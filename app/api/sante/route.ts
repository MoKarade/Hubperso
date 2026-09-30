// app/api/sante/route.ts — santé publique, pour la vigie de l'Atelier.
//
// Même patron que JobAI#49 et BatchChef#154 (modèle CarAI) : trois conventions pour la
// même sonde finiraient par coûter une soirée de débogage.
//
// ⚠️ Route SANS authentification — délibérément. Elle traverse le garde par `isPublicPath`
// (lib/authGuard.ts), JAMAIS par une exclusion du matcher de `middleware.ts`. Elle ne rend
// que `{ ok: true }` ou `{ ok: false, cause }` : aucune donnée, aucun message d'erreur brut,
// aucun NOM de variable. `tests/gardePages.test.ts` vérifie qu'elle n'importe aucun module
// de données ; `tests/sante.test.ts` que son corps reste muet dans tous les cas.
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
// `assurerMigrations()` n'échoue jamais vers l'appelant : pas de try/catch autour.

import { sql } from "drizzle-orm";
import { baseConfiguree, db } from "@/lib/db";
import { assurerMigrations } from "@/lib/migrations";
import { requisesManquantes } from "@/lib/variablesAttendues";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function echec(cause: "base" | "configuration"): Response {
  return Response.json({ ok: false, cause }, { status: 503, headers: NO_STORE });
}

export async function GET(): Promise<Response> {
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

  return Response.json({ ok: true }, { headers: NO_STORE });
}
