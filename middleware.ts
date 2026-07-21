// middleware.ts
//
// Garde global : le hub est privé, rien n'est servi sans session valide. Le matcher
// exclut ce qui DOIT rester public (routes Auth.js, page de login, assets Next). La
// décision (laisser passer / 401 / redirect vers /login) est déléguée à `decideGuard`
// (lib/authGuard.ts, testé unitairement). La page /page.tsx revérifie la session côté
// serveur (défense en profondeur) là où vivent réellement les jetons des apps.

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { decideGuard } from "@/lib/authGuard";
import { isAuthConfigured } from "@/lib/authConfigured";

export default auth((req) => {
  // Fail-closed : sans AUTH_SECRET/AUTHORIZED_EMAIL, Auth.js loggue MissingSecret mais
  // laisse passer (constaté sur Vercel). On refuse alors TOUT ce qui est protégé.
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error: "auth_unconfigured",
        message:
          "Authentification non configurée (AUTH_SECRET / AUTHORIZED_EMAIL manquants). Accès refusé.",
      },
      { status: 503 },
    );
  }

  const decision = decideGuard({
    isAuthenticated: Boolean(req.auth),
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
  });

  switch (decision.type) {
    case "next":
      return;
    case "unauthorized":
      return NextResponse.json(
        { error: "unauthenticated", message: "Authentification requise." },
        { status: 401 },
      );
    case "redirect":
      return NextResponse.redirect(new URL(decision.location, req.nextUrl.origin));
  }
});

export const config = {
  // Tout est protégé SAUF : les routes Auth.js (/api/auth/*), la page de login, et les
  // assets statiques de Next. Doit rester aligné avec `isPublicPath` (lib/authGuard.ts).
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
