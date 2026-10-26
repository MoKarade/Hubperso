// app/api/chantier/couts/route.ts — les coûts et quotas des apps, pour l'onglet Coûts de la page Chantier.
//
//   GET /api/chantier/couts
//     200 les totaux par période, le coût et les quotas de chaque app (`lib/chantierCouts.ts`)
//     401 pas de session · 404 connecté mais pas le propriétaire · 429 trop vite
//
// Reprend la page `/couts` (que Marc a demandé de retirer, 26/10/2026 ; son retrait suit) : même source, `fetchAllSummaries`,
// c'est-à-dire les jetons `x-hub-token` des apps. D'où une route DERRIÈRE le garde du hub (jamais dans
// les exclusions du middleware) qui se garde encore seule, et réservée au propriétaire : un invité du hub
// a perdu le détail des coûts avec la page. 404 et non 403, il n'apprend pas que la page existe.
//
// Propriétaire = `AUTHORIZED_EMAIL`, sans réseau ni base (comme `app/api/chantier/cadre/route.ts`).
// Rien n'est mis en cache : un coût d'hier présenté comme celui d'aujourd'hui serait un faux.

import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { coutsPourCadre } from "@/lib/chantierCouts";
import { fetchAllSummaries } from "@/lib/fetchSummary";
import { maintenantMs } from "@/lib/horloge";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { getSources } from "@/lib/sources";
import { aggregateUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";

/** Chaque appel interroge toutes les apps : 6 par minute et par client suffisent à un onglet qui relit toutes les 5 min. */
const limiteur = creerLimiteur({ max: 6, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const session = await auth();
  if (!session?.user?.email) return erreur(401, "unauthorized", "Session invalide.");
  if (!isAuthorizedEmail(session.user.email, process.env.AUTHORIZED_EMAIL)) {
    return erreur(404, "not_found", "Introuvable.");
  }

  const resultats = await fetchAllSummaries(getSources());
  return Response.json(coutsPourCadre(aggregateUsage(resultats), maintenantMs()), { headers: ENTETES });
}
