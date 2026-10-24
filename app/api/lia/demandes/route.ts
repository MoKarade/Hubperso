// app/api/lia/demandes/route.ts — les demandes « Que peut-on changer ici ? », relayées à MemoryAI.
//
//   POST /api/lia/demandes   corps : { app, genre, nom } (lib/demandes.ts) → 201 gardée · 200 déjà gardée aujourd'hui
//                            · 410 Marc l'avait oubliée · 400 / 413 / 422 corps refusé · 502 refusée par MemoryAI
//   GET  /api/lia/demandes   → 200 { demandes: [...] } (la plus récente d'abord) · 503 indisponible
//   401 : pas de session · 403 : invité · 429 : trop vite · 503 : mémoire gelée, absente ou hors contrat
//
// Comme `/api/lia/etat` : DERRIÈRE le garde du hub (aucune exception dans `lib/authGuard.ts`), session et accès vérifiés
// ici encore, propriétaire seul (un invité ne dépose ni ne lit rien). Le jeton de MemoryAI reste côté serveur. Le corps
// de la page est jugé AVANT tout saut réseau, et la date est posée par ce serveur.

import { lireDepot } from "@/lib/demandes";
import { deposerDemande, lireDemandes } from "@/lib/demandesMemoire";
import { appelantLia } from "@/lib/liaAppelant";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";

export const dynamic = "force-dynamic";

/** Un clic de Marc = une demande : 30 par minute laissent de la marge sans laisser un script inonder MemoryAI. */
const limiteur = creerLimiteur({ max: 30, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

async function garde(req: Request): Promise<Response | null> {
  const debit = limiteur.verifier(cleClient(req.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);
  const qui = await appelantLia();
  if (!qui) return erreur(401, "unauthorized", "Session invalide.");
  if (qui === "invite") return erreur(403, "forbidden", "Les demandes sont réservées au propriétaire.");
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const refus = await garde(req);
  if (refus) return refus;
  const lu = lireDepot(await req.text());
  if (!lu.ok) return erreur(lu.status, lu.error, lu.message);
  const { status, corps } = await deposerDemande(lu.depot);
  return Response.json(corps, { status, headers: ENTETES });
}

export async function GET(req: Request): Promise<Response> {
  const refus = await garde(req);
  if (refus) return refus;
  const lecture = await lireDemandes();
  return lecture.ok
    ? Response.json({ demandes: lecture.demandes }, { headers: ENTETES })
    : erreur(503, "unavailable", lecture.raison);
}
