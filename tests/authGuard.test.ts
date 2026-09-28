import { describe, it, expect } from "vitest";
import { isPublicPath, decideGuard } from "../lib/authGuard";

describe("isPublicPath", () => {
  it("laisse publiques les routes Auth.js et la page de login", () => {
    expect(isPublicPath("/api/auth/callback/google")).toBe(true);
    expect(isPublicPath("/api/auth/signin")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
  });

  // Exigées par la vérification Google OAuth (Test → Production) : le robot de revue de
  // Google n'a pas de session. Même mécanisme que /login, jamais une exclusion du matcher
  // de middleware.ts (CLAUDE.local.md).
  it("laisse publiques /confidentialite et /conditions", () => {
    expect(isPublicPath("/confidentialite")).toBe(true);
    expect(isPublicPath("/conditions")).toBe(true);
    expect(isPublicPath("/confidentialite-admin")).toBe(false);
    expect(isPublicPath("/conditionsx")).toBe(false);
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

  // L'exception de serveur à serveur. Elle est NOMMÉE, pas déduite d'un motif : sans ce
  // test, un `startsWith("/api/acces")` élargi plus tard ouvrirait aussi une future
  // `/api/acces-admin` à qui n'a pas de session, en silence.
  it("laisse passer /api/acces — et exactement ce chemin", () => {
    expect(isPublicPath("/api/acces")).toBe(true);
    expect(isPublicPath("/api/acces/")).toBe(false);
    expect(isPublicPath("/api/acces-admin")).toBe(false);
    expect(isPublicPath("/api/acces/tout")).toBe(false);
  });

  // La DEUXIÈME exception de serveur à serveur : l'horloge du hub, appelée par un workflow
  // GitHub Actions qui n'a pas de cookie de session. Même forme que ci-dessus, et pour la
  // même raison : le chemin est nommé exactement, jamais un préfixe — un
  // `startsWith("/api/cron")` ouvrirait n'importe quelle future route de cron sans session.
  //
  // ⚠️ Elle n'est pas OUVERTE : la route exige `Authorization: Bearer <CRON_SECRET>`,
  // comparé à temps constant (lib/cronAuth.ts, app/api/cron/releve/route.ts). Ce test
  // vérifie le chemin ; `tests/gardePages.test.ts` vérifie que l'auth de remplacement
  // existe vraiment, et que ces deux listes ne divergent pas.
  it("laisse passer /api/cron/releve — et exactement ce chemin", () => {
    expect(isPublicPath("/api/cron/releve")).toBe(true);
    expect(isPublicPath("/api/cron/releve/")).toBe(false);
    expect(isPublicPath("/api/cron")).toBe(false);
    expect(isPublicPath("/api/cron/autre")).toBe(false);
    expect(isPublicPath("/api/cron/releve-tout")).toBe(false);
  });

  it("n'ouvre pas d'autre route /api que les deux exceptions nommées", () => {
    // Le filet global : si une troisième exception apparaît sans passer par une décision
    // consciente, ce test la voit. La liste vit ici et dans `tests/gardePages.test.ts`,
    // qui vérifie en plus que chacune prouve son authentification de remplacement.
    for (const chemin of [
      "/api/summaries",
      "/api/admin",
      "/api/acces-admin",
      "/api/cron",
      "/api/declencher",
    ]) {
      expect(isPublicPath(chemin), `${chemin} ne doit pas être public`).toBe(false);
    }
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
  // INSTALLABILITÉ (PWA). Le navigateur récupère `/manifest.webmanifest` SANS cookies :
  // s'il tombait sur la redirection vers /login, le hub cesserait d'être installable —
  // en silence, sans erreur nulle part. Idem pour `/sw.js`, que Chromium exige pour
  // proposer « Installer l'application ». Ces chemins passent aujourd'hui par la règle
  // générale « dernier segment contenant un point » ; ce test empêche qu'un
  // resserrement de `isPublicPath` les emporte sans qu'on s'en aperçoive.
  //
  // Aucun de ces fichiers ne porte de donnée : ce sont des assets statiques. La règle du
  // CLAUDE.md (« toute route affichant des données reste derrière la middleware ») n'est
  // pas touchée — le test ci-dessous vérifie d'ailleurs que `/` le reste.
  it("laisse passer les fichiers requis pour l'installation, et RIEN d'autre", () => {
    for (const chemin of [
      "/manifest.webmanifest",
      "/sw.js",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
      "/apple-touch-icon.png",
    ]) {
      expect(isPublicPath(chemin)).toBe(true);
    }
    // Les routes qui portent des données restent protégées.
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/couts")).toBe(false);
  });
  // La vue détaillée AFFICHE DES DONNÉES et déclenche le fetch porteur du x-hub-token.
  // Elle doit donc rester protégée — c'est la règle n°1 du CLAUDE.md du hub. Son chemin
  // n'a pas de point, donc `isPublicPath` la refuse ; ce test empêche qu'un futur
  // assouplissement de la règle « fichier avec extension » l'emporte par accident.
  it("garde la vue détaillée /app/[id] derrière l'authentification", () => {
    for (const chemin of ["/app/carai", "/app/financeai", "/app/driveai"]) {
      expect(isPublicPath(chemin)).toBe(false);
      expect(decideGuard({ isAuthenticated: false, pathname: chemin })).toEqual({
        type: "redirect",
        location: `/login?callbackUrl=${encodeURIComponent(chemin)}`,
      });
    }
  });
});
