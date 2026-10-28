// lib/bilansGarde.ts — la garde commune des routes `/api/bilans` : session, propriétaire seul, dossier,
// jeton Drive. Rend soit la réponse d'échec, soit de quoi lire. Un invité du hub reçoit 404, pas 403.

import { isAuthorizedEmail } from "@/lib/authorized";
import { DOSSIER_BILANS } from "@/lib/bilans";
import { jetonDrive } from "@/lib/jetonDrive";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";

export const ENTETES_BILANS = { "cache-control": "no-store" } as const;

/** Une lecture ouverte par clic : 30 par minute laissent de la marge sans permettre un martelage de Drive. */
const limiteur = creerLimiteur({ max: 30, fenetreMs: 60_000 });

export const erreurBilans = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES_BILANS });

const MESSAGE_DROIT =
  "Le droit de lire Drive manque à ta session : reconnecte-toi une fois au hub et accepte l'écran Google.";

/**
 * @param email l'adresse de la session, lue par la ROUTE avec `auth()` (chaque route reste lisible comme gardée).
 */
export async function garderBilans(
  request: Request,
  email: string | null | undefined,
): Promise<Response | { jeton: string; dossier: string }> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  if (!email) return erreurBilans(401, "unauthorized", "Session invalide.");
  if (!isAuthorizedEmail(email, process.env.AUTHORIZED_EMAIL)) return erreurBilans(404, "not_found", "Introuvable.");

  const dossier = process.env.BILANS_DRIVE_FOLDER_ID?.trim() || DOSSIER_BILANS;

  const jeton = await jetonDrive(request);
  if ("raison" in jeton) {
    if (jeton.raison === "droit-absent" || jeton.raison === "jeton-refuse") {
      return erreurBilans(409, "droit-drive-absent", MESSAGE_DROIT);
    }
    if (jeton.raison === "session") return erreurBilans(401, "unauthorized", "Session invalide.");
    return erreurBilans(502, "drive-injoignable", "Google ne répond pas pour l'instant.");
  }
  return { jeton: jeton.jeton, dossier };
}
