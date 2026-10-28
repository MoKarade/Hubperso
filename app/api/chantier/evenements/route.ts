// app/api/chantier/evenements/route.ts — la page Chantier relit ici les événements GitHub reçus par le hub.
//
//   GET /api/chantier/evenements[?depuis=<ISO>]
//     200 { ok, evenements: [...], jusqua } : ceux reçus après `depuis` (sans `depuis` : les 48 dernières heures), du plus ancien
//         au plus récent ; `jusqua` est l'instant de réception du dernier rendu (ou `depuis` s'il n'y a rien de neuf)
//     401 pas de session (ou pas d'accès au hub) · 404 connecté mais pas le propriétaire · 400 `depuis` illisible
//     429 trop vite · 500 lecture impossible · 503 sans base
//
// Comme `/api/chantier/releve` : DERRIÈRE le garde du hub (aucune exception dans `lib/authGuard.ts`), session, accès au hub, puis
// propriétaire ; un invité reçoit 404, pas 403. Une lecture sans rien de neuf ne renvoie aucune ligne : la page la fait toutes
// les 10 s, onglet visible seulement. NO FAKE DATA : sans événement, `evenements: []`, jamais un événement inventé.

import { auth } from "@/auth";
import { lireDepuis } from "@/lib/chantierEvenementsDb";
import { baseConfiguree } from "@/lib/db";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { assurerMigrations } from "@/lib/migrations";
import { aAcces, APP_HUB, estProprietaire } from "@/lib/personnes";

export const dynamic = "force-dynamic";

/** Une lecture toutes les 10 s par onglet, avec de la marge pour deux onglets et les rechargements. */
const limiteur = creerLimiteur({ max: 30, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return erreur(401, "unauthorized", "Session invalide.");

  const brut = new URL(request.url).searchParams.get("depuis");
  const depuis = brut ? new Date(brut) : null;
  if (depuis && Number.isNaN(depuis.getTime())) return erreur(400, "bad_request", "`depuis` : date ISO attendue.");

  if (!baseConfiguree()) return erreur(503, "unavailable", "Aucune base : les événements ne peuvent pas être lus.");

  try {
    await assurerMigrations();
    if (!(await aAcces(email, APP_HUB))) return erreur(401, "unauthorized", "Session invalide.");
    if (!estProprietaire(email)) return erreur(404, "not_found", "Introuvable.");

    const evenements = await lireDepuis(depuis);
    const dernier = evenements.at(-1)?.rl ?? depuis?.toISOString() ?? null;
    return Response.json({ ok: true, evenements, jusqua: dernier }, { headers: ENTETES });
  } catch (err) {
    console.error("[chantier] lecture des événements impossible", err);
    return erreur(500, "internal", "Lecture des événements impossible — voir les journaux Vercel.");
  }
}
