// app/api/sante/route.ts — santé publique, pour la vigie de l'Atelier.
//
// Même patron que JobAI#49 et BatchChef#154 (modèle CarAI) : trois conventions pour la
// même sonde finiraient par coûter une soirée de débogage.
//
// ⚠️ Route SANS authentification — délibérément. Elle traverse le garde par `isPublicPath`
// (lib/authGuard.ts), JAMAIS par une exclusion du matcher de `middleware.ts`. Elle ne rend
// que `{ ok: true }` ou `{ ok: false, cause }`, plus le commit servi (7 caractères, public) :
// aucune donnée, aucun message d'erreur brut, aucun NOM de variable. `tests/gardePages.test.ts`
// vérifie qu'elle n'importe aucun module de données ; `tests/sante.test.ts` que son corps
// reste muet dans tous les cas, `commit` mis à part.
//
// `commit` dit QUEL déploiement le domaine sert : après un retour en arrière, un alias Vercel
// peut rester figé sur un ancien déploiement sans que rien le montre (Hubperso#743,
// MoKarade/.github#822). Absent si la variable manque ou n'est pas un SHA hexadécimal.
//
// ── POURQUOI CETTE ROUTE EXISTE ──────────────────────────────────────────────────────
// La page d'accueil répond même quand la base est en panne (redirection vers /login) :
// regarder son code HTTP ne montre AUCUNE panne. Et derrière la garde de session, la vigie
// recevrait un 401 au lieu d'un diagnostic.
//
// ── DEUX CAUSES, DANS CET ORDRE ──────────────────────────────────────────────────────
// 1. `base` : non configurée OU injoignable — même réponse dans les deux cas (patron JobAI).
// 2. `configuration` : une variable REQUISE manque (F7, prévention d'INC-16). Les noms
//    partent au journal serveur (`console.error`), JAMAIS dans la réponse : les nommer
//    publiquement donnerait la carte de ce qu'il faut deviner. Une variable optionnelle
//    absente ne rend pas la sonde rouge (elle dégrade un widget, pas le hub).
//
// Note : sans AUTH_SECRET/AUTHORIZED_EMAIL, `middleware.ts` répond 503 AVANT d'arriver ici.
// La vigie voit donc un 503 dans ce cas aussi — c'est voulu (fail-closed).
//
// `assurerMigrations()` n'échoue jamais vers l'appelant : pas de try/catch autour. Après un
// échec, elle observe un délai de repli (lib/migrations.ts) : la sonde ne relance pas une
// migration à chaque appel.
//
// ── LIMITE DE DÉBIT (décision pole-securite, 30/09/2026) ──────────────────────────────
// Route publique SANS authentification qui fait un vrai `SELECT 1` sur Neon (plan gratuit) :
// sans frein, n'importe qui peut la marteler et consommer le quota de la base. 10 appels par
// minute et par client (même réglage que `/api/cron/releve`) : la vigie appelle une fois par
// heure, c'est très large. Vérifiée EN PREMIER, avant tout accès à la base. Le plafond est
// par instance (voir lib/limiteDebit.ts) : un frein, pas un pare-feu.

import { sql } from "drizzle-orm";
import { baseConfiguree, db } from "@/lib/db";
import { assurerMigrations } from "@/lib/migrations";
import { requisesManquantes } from "@/lib/variablesAttendues";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const limiteur = creerLimiteur({ max: 10, fenetreMs: 60_000 });

/** Les 7 premiers caractères du commit servi ; rien si la variable manque ou n'est pas un SHA. */
function commitServi(brut: string | undefined = process.env.VERCEL_GIT_COMMIT_SHA): { commit?: string } {
  const sha = (brut ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? { commit: sha.slice(0, 7).toLowerCase() } : {};
}

function echec(cause: "base" | "configuration"): Response {
  return Response.json({ ok: false, cause, ...commitServi() }, { status: 503, headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  if (!baseConfiguree()) return echec("base");

  await assurerMigrations();

  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    // Le motif détaillé est journalisé, JAMAIS renvoyé : un message d'erreur brut pourrait
    // porter des détails de connexion.
    console.error("[sante] base injoignable", err);
    return echec("base");
  }

  const manquantes = requisesManquantes();
  if (manquantes.length > 0) {
    // Des NOMS seulement, jamais une valeur : de quoi savoir quoi poser sur Vercel.
    console.error(`[sante] variables requises absentes : ${manquantes.join(", ")}`);
    return echec("configuration");
  }

  return Response.json({ ok: true, ...commitServi() }, { headers: NO_STORE });
}
