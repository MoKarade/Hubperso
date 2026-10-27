// app/api/chantier/gestes/route.ts — le hub dépose un geste de l'onglet « À toi » (Fusionner, Fait, une réponse).
//
//   POST /api/chantier/gestes   corps : { v:1, id, ref, geste, texte, quand } (lib/chantierGestes.ts)
//     201 déposé · 200 déjà déposé (même `id`, rien n'est écrit une seconde fois)
//     400 corps illisible · 401 pas de session · 403 pas de notre page · 404 connecté mais pas le propriétaire
//     413 corps trop gros · 422 hors contrat · 429 trop vite · 503 base absente ou en panne
//
// Remplace le dépôt dans le Drive `_Gantt` (connecteur que le cadre isolé n'a pas). Le PC lit ces gestes et les
// applique sur GitHub : un geste peut FUSIONNER une PR, donc rien n'est accepté sans la session du propriétaire
// (`AUTHORIZED_EMAIL`, sans réseau), ni sans que la demande vienne de notre page (en-tête `Origin`). Derrière le
// garde du hub, jamais dans les exclusions du middleware. 404 et non 403 pour un invité : il n'apprend pas que la route existe.

import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { TAILLE_MAX_GESTE, memeOrigine, validerGeste } from "@/lib/chantierGestes";
import { deposerGeste } from "@/lib/chantierGestesDb";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";

export const dynamic = "force-dynamic";

/** Un clic armé puis confirmé : 20 par minute et par client laissent de la marge à une rafale de réponses. */
const limiteur = creerLimiteur({ max: 20, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

export async function POST(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const session = await auth();
  if (!session?.user?.email) return erreur(401, "unauthorized", "Session invalide.");
  if (!isAuthorizedEmail(session.user.email, process.env.AUTHORIZED_EMAIL)) {
    return erreur(404, "not_found", "Introuvable.");
  }
  if (!memeOrigine(request.headers)) return erreur(403, "forbidden", "Demande hors de la page du hub.");

  const texte = await request.text();
  if (new TextEncoder().encode(texte).length > TAILLE_MAX_GESTE) {
    return erreur(413, "too_large", "Corps trop gros.");
  }
  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return erreur(400, "bad_request", "Corps JSON illisible.");
  }
  const verdict = validerGeste(corps);
  if (!verdict.ok) return erreur(422, "invalid", verdict.raison);

  try {
    const { nouveau } = await deposerGeste(verdict.geste);
    return Response.json({ ok: true, id: verdict.geste.id, nouveau }, { status: nouveau ? 201 : 200, headers: ENTETES });
  } catch (e) {
    console.error("[chantier] geste non déposé", e instanceof Error ? e.message : e);
    return erreur(503, "unavailable", "Le geste n'est pas déposé : la base ne répond pas.");
  }
}
