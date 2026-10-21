// app/api/graphes/[depot]/route.ts — sert le graphe de code d'un dépôt, pour le propriétaire seul.
//
//   GET /api/graphes/hubperso                →   la page 2D d'origine (graph.html), avec un bouton « 3D »
//   GET /api/graphes/hubperso?vue=donnees     →   les nœuds et les liens en JSON, pour la vue 3D de /graphes
//
// La vue 3D ne sert JAMAIS le HTML du dépôt : elle en lit les nœuds et les liens comme du JSON
// (`lib/grapheDonnees.ts`), des chaînes sans HTML que le visualiseur du hub pose par `textContent`.
// Si le format change, la route le dit (502 avec la cause), jamais un graphe inventé.
//
// ⚠️ LE CONTENU VIENT DU CODE D'UN DÉPÔT : il est traité comme non fiable. Trois verrous :
//   1. propriétaire seul (session lue ICI, en plus du middleware : défense en profondeur) ;
//   2. servi en navigation de premier niveau avec `Content-Security-Policy: sandbox allow-scripts`
//      → origine OPAQUE : ni cookie du hub, ni lecture de ses pages, ni fetch (connect-src 'none'),
//      ni navigation du cadre parent, ni fenêtre ouverte. Seul son propre script peut tourner ;
//   3. aucun script tiers : en 2D `preparerHtml` réécrit vis-network vers la copie locale ou refuse ;
//      en 3D les seuls scripts sont ceux du hub (`public/vendor`, `public/graphes`).
// Cette route est donc EXCLUE de la CSP globale de `next.config.mjs` (qui forcerait sinon un
// deuxième en-tête) et porte ici l'ensemble de ses en-têtes de sécurité.
//
// Pas d'état inventé : graphe absent, expiré, jeton absent… → 502 avec la cause en clair.

import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { chargerGraphe, depotDepuisId, idDepot } from "@/lib/graphes";
import { preparerHtml } from "@/lib/grapheHtml";
import { extraireDonnees } from "@/lib/grapheDonnees";
import { avecBascule3d, vueDemandee } from "@/lib/grapheVue3d";

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

function pageHtml(corps: string): Response {
  return new Response(corps, {
    status: 200,
    headers: {
      ...ENTETES_SECURITE,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP_GRAPHE,
    },
  });
}

export async function GET(
  request: Request,
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

  if (vueDemandee(new URL(request.url).searchParams.get("vue")) === "donnees") {
    const lu = extraireDonnees(charge.graphe.html);
    if (!lu.ok) return texte(`Vue 3D indisponible : ${lu.detail}.`, 502);
    const { noeuds, liens } = lu.donnees;
    return new Response(JSON.stringify({ depot, sha: charge.graphe.meta.sha, noeuds, liens }), {
      status: 200,
      headers: { ...ENTETES_SECURITE, "Content-Type": "application/json; charset=utf-8" },
    });
  }
  const pret = preparerHtml(charge.graphe.html);
  if (!pret.ok) return texte(`Graphe refusé : ${pret.detail}.`, 502);
  return pageHtml(avecBascule3d(pret.html, idDepot(depot)));
}
