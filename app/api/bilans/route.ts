// app/api/bilans/route.ts — la liste des bilans gardés dans Drive, pour l'onglet « Bilans ».
//
//   GET /api/bilans
//     200 { bilans: [{ id, genre, date, nom }] } les plus récents d'abord (peut être vide : « Aucun bilan »)
//     401 pas de session · 404 connecté mais pas le propriétaire · 409 le droit Drive manque (se reconnecter)
//     429 trop vite · 502 Google ne répond pas · 503 dossier non configuré
//
// Propriétaire seul, derrière la session. Les bilans sont personnels : `no-store`, rien en base ni dans le dépôt.

import { auth } from "@/auth";
import { garderBilans, ENTETES_BILANS, erreurBilans } from "@/lib/bilansGarde";
import { listerBilans } from "@/lib/bilansDrive";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  const garde = await garderBilans(request, session?.user?.email);
  if (garde instanceof Response) return garde;

  const liste = await listerBilans(garde.jeton, garde.dossier);
  if (liste.ok) return Response.json({ bilans: liste.valeur }, { headers: ENTETES_BILANS });
  if (liste.raison === "refuse") return erreurBilans(409, "droit-drive-absent", "Google refuse la lecture de Drive : reconnecte-toi au hub.");
  if (liste.raison === "introuvable") return erreurBilans(503, "dossier-introuvable", "Le dossier Drive des bilans est introuvable.");
  if (liste.raison === "hors-contrat") return erreurBilans(502, "hors-contrat", "Drive a répondu autre chose que prévu.");
  return erreurBilans(502, "drive-injoignable", "Google ne répond pas pour l'instant.");
}
