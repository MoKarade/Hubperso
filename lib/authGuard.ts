// lib/authGuard.ts
//
// Logique de garde du middleware, isolée en fonctions pures pour être testable sans
// mocker tout NextAuth. Deux responsabilités :
//   - `isPublicPath` : ce qui reste accessible sans session (doit rester aligné avec le
//     matcher du middleware) ;
//   - `decideGuard` : que faire d'une requête protégée non authentifiée (401 pour une
//     route API, redirection vers /login pour une page).

export type GuardDecision =
  | { type: "next" }
  | { type: "unauthorized" }
  | { type: "redirect"; location: string };

/** Routes toujours publiques : Auth.js, page de login, assets statiques de Next. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  ) {
    return true;
  }
  // Fichier avec extension (svg, png, css, …) → asset public.
  const lastSegment = pathname.split("/").pop() ?? "";
  return lastSegment.includes(".");
}

/**
 * Décide du sort d'une requête. `isAuthenticated` vient de la session Auth.js.
 * Une requête publique OU authentifiée passe ; sinon : 401 pour /api/*, redirection
 * vers /login (avec callbackUrl) pour une page.
 */
export function decideGuard(params: {
  isAuthenticated: boolean;
  pathname: string;
  search?: string;
}): GuardDecision {
  const { isAuthenticated, pathname, search = "" } = params;

  if (isPublicPath(pathname) || isAuthenticated) return { type: "next" };

  if (pathname.startsWith("/api/")) return { type: "unauthorized" };

  const callbackUrl = encodeURIComponent(pathname + search);
  return { type: "redirect", location: `/login?callbackUrl=${callbackUrl}` };
}
