// app/api/chantier/cadre/route.ts — le document de la page Chantier, pour le cadre isolé de /chantier.
//
//   GET /api/chantier/cadre
//     200 le document (HTML autonome, SANS donnée), CSP en bac à sable, `frame-ancestors 'self'`
//     401 pas de session · 404 connecté mais pas le propriétaire · 500 document introuvable
//
// Ce document ne porte rien de privé (le relevé arrive par le hub, dans un canal) ; la route reste
// pourtant derrière la connexion et réservée au propriétaire : la page n'a de sens que pour lui, et
// un invité du hub ne doit pas apprendre qu'elle existe (404, pas 403). Propriétaire = `AUTHORIZED_EMAIL`,
// sans réseau ni base, comme `app/api/graphes/[depot]/route.ts`.
//
// ⚠️ Cette route est EXCLUE de la CSP globale de `next.config.mjs` (qui interdit la mise en cadre
// et s'additionnerait à celle-ci) : elle pose donc elle-même TOUS ses en-têtes de sécurité, sur
// chacune de ses réponses. Voir `lib/chantierCadre.ts` pour le pourquoi de l'isolement.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { CSP_CADRE } from "@/lib/chantierCadre";
import { etagCorrespond } from "@/lib/chantierReleve";

export const dynamic = "force-dynamic";

const ENTETES_SECURITE = {
  "Cache-Control": "private, no-store",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

function texte(corps: string, status: number): Response {
  return new Response(corps, {
    status,
    headers: { ...ENTETES_SECURITE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Lu une fois par instance (440 Ko) ; un échec n'est pas gardé, la requête suivante réessaie. Son ETag est l'empreinte du texte :
 * le hub (`ChantierCadre`) le relit toutes les 5 minutes et sait ainsi qu'un déploiement a posé une version neuve du cadre.
 */
let documentCadre: Promise<{ html: string; etag: string }> | null = null;
function lireDocument(): Promise<{ html: string; etag: string }> {
  documentCadre ??= readFile(join(process.cwd(), "chantier", "cadre.html"), "utf8")
    .then((html) => ({ html, etag: `"${createHash("sha1").update(html).digest("hex").slice(0, 16)}"` }))
    .catch((erreur) => {
      documentCadre = null;
      throw erreur;
    });
  return documentCadre;
}

export async function GET(requete?: Request): Promise<Response> {
  const session = await auth();
  if (!session) return texte("Authentification requise.", 401);
  if (!isAuthorizedEmail(session.user?.email, process.env.AUTHORIZED_EMAIL)) {
    return texte("Introuvable.", 404);
  }

  try {
    const { html, etag } = await lireDocument();
    // Même version que celle que la page connaît : ni corps, ni document renvoyé.
    if (requete && etagCorrespond(requete.headers.get("if-none-match"), etag)) {
      return new Response(null, { status: 304, headers: { ...ENTETES_SECURITE, ETag: etag } });
    }
    return new Response(html, {
      status: 200,
      headers: {
        ...ENTETES_SECURITE,
        ETag: etag,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": CSP_CADRE,
      },
    });
  } catch (erreur) {
    console.error("[chantier] document du cadre introuvable", erreur);
    return texte("Le document de la page Chantier est introuvable.", 500);
  }
}
