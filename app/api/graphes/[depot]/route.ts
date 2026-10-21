// app/api/graphes/[depot]/route.ts — sert le graphe de code d'un dépôt, pour le propriétaire seul.
//
//   GET /api/graphes/hubperso   →   la page interactive (graph.html) du dernier push sur `main`
//
// ⚠️ LE CONTENU VIENT DU CODE D'UN DÉPÔT : il est traité comme non fiable. Trois verrous :
//   1. propriétaire seul (session lue ICI, en plus du middleware : défense en profondeur) ;
//   2. servi en navigation de premier niveau avec `Content-Security-Policy: sandbox allow-scripts`
//      → origine OPAQUE : ni cookie du hub, ni lecture de ses pages, ni fetch (connect-src 'none'),
//      ni navigation du cadre parent, ni fenêtre ouverte. Seul son propre script peut tourner ;
//   3. aucun script tiers : `preparerHtml` réécrit vis-network vers la copie locale ou refuse.
// Cette route est donc EXCLUE de la CSP globale de `next.config.mjs` (qui forcerait sinon un
// deuxième en-tête) et porte ici l'ensemble de ses en-têtes de sécurité.
//
// Pas d'état inventé : graphe absent, expiré, jeton absent… → 502 avec la cause en clair.

import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { chargerGraphe, depotDepuisId } from "@/lib/graphes";
import { preparerHtml } from "@/lib/grapheHtml";

export const dynamic = "force-dynamic";

/** `sandbox` SANS allow-same-origin / allow-top-navigation / allow-popups / allow-forms. */
export const CSP_GRAPHE = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

const ENTETES_SECURITE = {
  "Cache-Control": "private, no-store",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

function texte(corps: string, status: number): Response {
  return new Response(corps, {
    status,
    headers: { ...ENTETES_SECURITE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ depot: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session) return texte("Authentification requise.", 401);
  // Propriétaire = AUTHORIZED_EMAIL, sans réseau ni base (même décision que `estProprietaire`).
  if (!isAuthorizedEmail(session.user?.email, process.env.AUTHORIZED_EMAIL)) return texte("Réservé au propriétaire.", 403);

  const depot = depotDepuisId((await params).depot);
  if (!depot) return texte("Dépôt inconnu.", 404);

  const charge = await chargerGraphe(depot);
  if (!charge.ok) return texte(`Graphe indisponible : ${charge.detail}.`, 502);

  const pret = preparerHtml(charge.graphe.html);
  if (!pret.ok) return texte(`Graphe refusé : ${pret.detail}.`, 502);

  return new Response(pret.html, {
    status: 200,
    headers: {
      ...ENTETES_SECURITE,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP_GRAPHE,
    },
  });
}
