// lib/limiteDebit.ts — limite de débit simple pour les deux routes à jeton, PUR (horloge injectée).
//
// ── CE QUE C'EST, ET CE QUE ÇA NE PROMET PAS ────────────────────────────────────────
//
// Une fenêtre fixe par clé (l'adresse du client), tenue EN MÉMOIRE de l'instance. Sur Vercel
// chaque instance serverless a sa propre mémoire : le plafond réel est donc « par instance »,
// pas global. C'est un frein contre le martelage de Neon (plan gratuit) par un porteur de
// jeton, sans nouvelle dépendance ni service payant — pas un pare-feu. Le vrai plafond global
// est le rate-limit du Vercel Firewall (gratuit), à poser dans la console (à faire par Marc /
// hubperso-deploiement : aucune écriture de console depuis le code).

/** Plancher de durée de `/api/acces` : la réponse ne dépend plus du chemin pris (voir la route). */
export const DUREE_MIN_ACCES_MS = 250;

export interface VerdictDebit {
  readonly ok: boolean;
  /** Secondes à attendre avant de réessayer (0 quand `ok`). */
  readonly retryApresS: number;
}

export interface Limiteur {
  verifier(cle: string, maintenantMs?: number): VerdictDebit;
  /** Nombre de clés suivies (test de la borne mémoire). */
  taille(): number;
}

interface Options {
  readonly max: number;
  readonly fenetreMs: number;
  /** Au-delà, les fenêtres périmées sont élaguées : la mémoire reste bornée. */
  readonly cleMax?: number;
}

export function creerLimiteur({ max, fenetreMs, cleMax = 1000 }: Options): Limiteur {
  const fenetres = new Map<string, { debut: number; compte: number }>();

  function elaguer(maintenantMs: number): void {
    for (const [cle, f] of fenetres) {
      if (maintenantMs - f.debut >= fenetreMs) fenetres.delete(cle);
    }
  }

  return {
    verifier(cle, maintenantMs = Date.now()) {
      if (fenetres.size >= cleMax) elaguer(maintenantMs);
      const f = fenetres.get(cle);
      if (!f || maintenantMs - f.debut >= fenetreMs) {
        fenetres.delete(cle); // réinsérée en fin d'ordre : la plus ancienne reste en tête
        // Plafond DUR : si tout est encore dans la fenêtre (rafale de clés distinctes), on évince
        // la plus ancienne. La mémoire ne dépasse jamais `cleMax`.
        while (fenetres.size >= cleMax) {
          const plusAncienne = fenetres.keys().next().value;
          if (plusAncienne === undefined) break;
          fenetres.delete(plusAncienne);
        }
        fenetres.set(cle, { debut: maintenantMs, compte: 1 });
        return { ok: true, retryApresS: 0 };
      }
      if (f.compte < max) {
        f.compte += 1;
        return { ok: true, retryApresS: 0 };
      }
      return { ok: false, retryApresS: Math.ceil((f.debut + fenetreMs - maintenantMs) / 1000) };
    },
    taille: () => fenetres.size,
  };
}

/**
 * Clé du client, dans l'ordre : `x-vercel-forwarded-for`, `x-real-ip`, puis le premier saut de
 * `x-forwarded-for` (même ordre que FinanceAI). Sans aucun en-tête (local, test) : « inconnu ».
 */
export function cleClient(entetes: Headers): string {
  const direct = entetes.get("x-vercel-forwarded-for")?.trim() || entetes.get("x-real-ip")?.trim();
  if (direct) return direct;
  const premier = entetes.get("x-forwarded-for")?.split(",")[0]?.trim();
  return premier || "inconnu";
}

/** Réponse 429 commune aux deux routes. */
export function reponse429(retryApresS: number): Response {
  return Response.json(
    { error: "rate_limited", message: "Trop de requêtes, réessayez plus tard." },
    { status: 429, headers: { "cache-control": "no-store", "retry-after": String(retryApresS) } },
  );
}

/** Attend le complément pour que la réponse dure au moins `dureeMinMs` depuis `debutMs`. */
export async function pauseJusquA(
  debutMs: number,
  maintenantMs: number,
  dureeMinMs: number,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  const reste = dureeMinMs - (maintenantMs - debutMs);
  if (reste > 0) await dormir(reste);
}
