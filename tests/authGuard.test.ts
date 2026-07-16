import { describe, it, expect } from "vitest";
import { isPublicPath, decideGuard } from "../lib/authGuard";

describe("isPublicPath", () => {
  it("laisse publiques les routes Auth.js et la page de login", () => {
    expect(isPublicPath("/api/auth/callback/google")).toBe(true);
    expect(isPublicPath("/api/auth/signin")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
  });

  it("laisse publics les assets statiques", () => {
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicPath("/favicon.ico")).toBe(true);
    expect(isPublicPath("/logo.svg")).toBe(true);
  });

  it("protège la page d'accueil et les routes de données", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/api/summaries")).toBe(false);
  });
});

describe("decideGuard", () => {
  it("laisse passer une requête authentifiée vers une page protégée", () => {
    expect(
      decideGuard({ isAuthenticated: true, pathname: "/" }),
    ).toEqual({ type: "next" });
  });

  it("redirige une page protégée non authentifiée vers /login avec callbackUrl", () => {
    expect(
      decideGuard({ isAuthenticated: false, pathname: "/", search: "" }),
    ).toEqual({ type: "redirect", location: "/login?callbackUrl=%2F" });
  });

  it("répond 401 pour /api/summaries non authentifié (pas de redirection)", () => {
    expect(
      decideGuard({ isAuthenticated: false, pathname: "/api/summaries" }),
    ).toEqual({ type: "unauthorized" });
  });

  it("laisse passer /api/auth/* et /login même sans session", () => {
    expect(
      decideGuard({ isAuthenticated: false, pathname: "/api/auth/callback/google" }),
    ).toEqual({ type: "next" });
    expect(
      decideGuard({ isAuthenticated: false, pathname: "/login" }),
    ).toEqual({ type: "next" });
  });
});
