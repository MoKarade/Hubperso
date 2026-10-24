// lib/liaPauseClient.ts — ce que la PAGE sait de la pause de LIA, pour l'option `pause` de lia-ui (≥ v0.31.0).
//
// ⚠️ CE N'EST QUE LE CÔTÉ CLIENT. Le vrai contrôle est sur le serveur : `POST /api/lia/ask` rend 423 sans appeler le modèle
// tant que la pause est posée (`lib/liaPause.ts`, `app/api/lia/ask/route.ts`). Ici on ne fait que laisser LIA se taire à
// l'écran (plus de parole spontanée, plus de question envoyée) sans attendre un refus du serveur.
//
// `pause()` de lia-ui est SYNCHRONE et relue à chaque pas : on garde donc la dernière lecture en mémoire et un minuteur la
// rafraîchit (`demarrerSuiviPause`). PUR ici : la lecture réseau et l'horloge se passent en paramètres.
//
// ── ÉCHEC FERMÉ ─────────────────────────────────────────────────────────────────────
//
// Une pause qu'on ne sait pas lire vaut pause : jamais lue, session absente (401), invité (403), réseau en panne, réponse
// hors contrat. Une lecture réussie reste valable `VALIDITE_PAUSE_MS` (trois rafraîchissements) : un raté passager ne fait pas
// taire LIA, mais une panne qui dure oui. Sans cela, une pause posée ne retiendrait pas une page qui ne la relit plus.

/** Fréquence de relecture de la pause par la page. */
export const INTERVALLE_PAUSE_MS = 30_000;
/** Une lecture réussie reste crue ce temps ; au-delà, faute de nouvelle lecture, LIA se tait. */
export const VALIDITE_PAUSE_MS = 3 * INTERVALLE_PAUSE_MS;

/**
 * Juge la réponse de `GET /api/lia/pause`. `true` / `false` : la pause lue ; `null` : illisible (statut autre que 200, JSON
 * absent, forme hors contrat). Jamais réparé : `{ "pause": "non" }` n'est pas « pas en pause ».
 */
export function lireReponsePause(statut: number, json: unknown): boolean | null {
  if (statut !== 200) return null;
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const pause = (json as Record<string, unknown>).pause;
  return typeof pause === "boolean" ? pause : null;
}

export interface SuiviPause {
  /** Relit la pause. N'échoue jamais : une lecture ratée est « illisible » (`null`). */
  rafraichir(): Promise<void>;
  /** Ce qu'on passe à `pause` de lia-ui. Vrai tant que la pause est posée OU qu'on ne sait pas. */
  enPause(): boolean;
}

/** @param lire la lecture réseau : `true`/`false` ou `null` si illisible. Peut lever : c'est « illisible ». */
export function creerSuiviPause(lire: () => Promise<boolean | null>, maintenant: () => number): SuiviPause {
  let derniere: { pause: boolean; a: number } | null = null;
  return {
    async rafraichir() {
      let lue: boolean | null = null;
      try {
        lue = await lire();
      } catch {
        lue = null;
      }
      if (lue !== null) derniere = { pause: lue, a: maintenant() };
    },
    enPause() {
      if (derniere === null) return true;
      if (maintenant() - derniere.a > VALIDITE_PAUSE_MS) return true;
      return derniere.pause;
    },
  };
}

/** La lecture réelle : `GET /api/lia/pause` avec le cookie de session de la page. Jamais de cache. */
export async function lirePauseServeur(): Promise<boolean | null> {
  const r = await fetch("/api/lia/pause", { cache: "no-store", credentials: "same-origin" });
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  return lireReponsePause(r.status, json);
}
