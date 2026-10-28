// app/api/bilans/[id]/route.ts — le document d'UN bilan, pour le cadre isolé de l'onglet « Bilans ».
//
//   GET /api/bilans/<id-drive>
//     200 le HTML du bilan, CSP en bac à sable, `frame-ancestors 'self'`
//     400 identifiant invalide · 401 · 404 (invité, ou fichier hors du dossier des bilans) · 409 · 429 · 502 · 503
//
// Même garde que la liste. Le contenu est une DONNÉE : il n'est jamais inséré dans une page du hub, seulement
// servi à un <iframe sandbox> sans origine ni réseau (`CSP_BILAN`).
// ⚠️ Cette route est EXCLUE de la CSP globale de `next.config.mjs` : elle pose elle-même tous ses en-têtes.

import { auth } from "@/auth";
import { CSP_BILAN, idDriveValide } from "@/lib/bilans";
import { lireBilan } from "@/lib/bilansDrive";
import { erreurBilans, garderBilans } from "@/lib/bilansGarde";

export const dynamic = "force-dynamic";

const ENTETES_SECURITE = {
  "Cache-Control": "private, no-store",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

export async function GET(request: Request, contexte: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await contexte.params;
  if (!idDriveValide(id)) return erreurBilans(400, "bad_request", "Identifiant de bilan invalide.");

  const session = await auth();
  const garde = await garderBilans(request, session?.user?.email);
  if (garde instanceof Response) return garde;

  const lu = await lireBilan(garde.jeton, garde.dossier, id);
  if (lu.ok) {
    return new Response(lu.valeur.html, {
      status: 200,
      headers: { ...ENTETES_SECURITE, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP_BILAN },
    });
  }
  if (lu.raison === "introuvable") return erreurBilans(404, "not_found", "Bilan introuvable.");
  if (lu.raison === "refuse") return erreurBilans(409, "droit-drive-absent", "Google refuse la lecture de Drive : reconnecte-toi au hub.");
  if (lu.raison === "hors-contrat") return erreurBilans(502, "hors-contrat", "Ce bilan n'a pas la forme attendue.");
  return erreurBilans(502, "drive-injoignable", "Google ne répond pas pour l'instant.");
}
