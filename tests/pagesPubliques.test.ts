// tests/pagesPubliques.test.ts — /confidentialite et /conditions, les deux pages légales
// exigées par la vérification Google OAuth (Test → Production). Elles doivent rester
// accessibles SANS session, par le même mécanisme que /login (isPublicPath), jamais par une
// exclusion du matcher de middleware.ts (interdit par CLAUDE.local.md).
//
// AUCUNE donnée inventée : les scopes Google cités dans le contenu sont vérifiés ici contre
// `lib/jetonsGoogle.ts` (la source de vérité), pas recopiés à la main.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPublicPath, decideGuard } from "../lib/authGuard";
import { PORTEES_GOOGLE, PORTEE_TASKS } from "../lib/jetonsGoogle";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("isPublicPath — /confidentialite et /conditions", () => {
  it("sont publiques, exactement (pas un préfixe qui ouvrirait autre chose)", () => {
    expect(isPublicPath("/confidentialite")).toBe(true);
    expect(isPublicPath("/conditions")).toBe(true);
    expect(isPublicPath("/confidentialite/")).toBe(true);
    expect(isPublicPath("/conditions/")).toBe(true);
    expect(isPublicPath("/confidentialite-admin")).toBe(false);
    expect(isPublicPath("/conditionsx")).toBe(false);
  });
});

describe("decideGuard — accès sans session", () => {
  it("laisse passer /confidentialite et /conditions sans authentification", () => {
    expect(decideGuard({ isAuthenticated: false, pathname: "/confidentialite" })).toEqual({
      type: "next",
    });
    expect(decideGuard({ isAuthenticated: false, pathname: "/conditions" })).toEqual({
      type: "next",
    });
  });
});

describe("middleware.ts n'a pas gagné d'exclusion (règle CLAUDE.local.md)", () => {
  it("le matcher ne cite ni confidentialite ni conditions", () => {
    const mw = lire("middleware.ts");
    expect(mw).not.toMatch(/confidentialite/);
    expect(mw).not.toMatch(/conditions/);
  });
});

describe("les deux pages existent, sont statiques et ne exigent pas de session", () => {
  const pages = {
    confidentialite: lire("app/confidentialite/page.tsx"),
    conditions: lire("app/conditions/page.tsx"),
  };

  it.each(Object.entries(pages))("%s n'appelle ni exigerAccesHub ni exigerProprietaire ni auth()", (_nom, source) => {
    expect(source).not.toContain("exigerAccesHub");
    expect(source).not.toContain("exigerProprietaire");
    expect(source).not.toContain("auth()");
  });

  it.each(Object.entries(pages))("%s exporte un titre de métadonnée", (_nom, source) => {
    expect(source).toMatch(/export const metadata/);
    expect(source).toMatch(/title:/);
  });

  it("utilisent le composant générique PagePublique (pas de logique par app)", () => {
    expect(pages.confidentialite).toContain("PagePublique");
    expect(pages.conditions).toContain("PagePublique");
  });
});

describe("le contenu de /confidentialite ne cite QUE les scopes Google réellement demandés", () => {
  const source = lire("app/confidentialite/page.tsx");

  it("les portées citées dans lib/jetonsGoogle.ts sont bien openid+email+profile+tasks (contrôle anti-dérive)", () => {
    // Si ce fichier change un jour, la page /confidentialite doit être revue avec —
    // ce test le rend impossible à manquer.
    expect(PORTEES_GOOGLE).toBe(`openid email profile ${PORTEE_TASKS}`);
    expect(PORTEE_TASKS).toBe("https://www.googleapis.com/auth/tasks");
  });

  it("mentionne l'identité et Google Tasks", () => {
    expect(source).toMatch(/identit/i);
    expect(source).toMatch(/tasks/i);
  });

  it("ne cite aucune URL de scope googleapis autre que celles réellement demandées", () => {
    // Contrôle faible mais honnête : toute URL de scope Google mentionnée dans le texte
    // doit être une sous-chaîne de PORTEES_GOOGLE (la vraie liste). Empêche de faire
    // apparaître, par exemple, `auth/drive` ou `auth/calendar` dans le contenu.
    for (const m of source.matchAll(/googleapis\.com\/auth\/[\w.]+/g)) {
      expect(PORTEES_GOOGLE, `${m[0]} n'est pas une portée réellement demandée`).toContain(
        m[0],
      );
    }
  });

  it("dit comment révoquer l'accès via le compte Google", () => {
    expect(source).toContain("myaccount.google.com/permissions");
  });

  it("dit l'usage strictement personnel (un seul utilisateur)", () => {
    expect(source).toMatch(/personnel/i);
  });

  it("mentionne Vercel Analytics (seule collecte de données tierce active — app/layout.tsx)", () => {
    const layout = lire("app/layout.tsx");
    expect(layout).toContain("@vercel/analytics");
    expect(source).toMatch(/analytics/i);
  });

  it("ne prétend pas d'adresse de contact qui n'existe pas dans le code", () => {
    // Aucune variable SUPPORT_EMAIL/CONTACT_EMAIL n'est lue nulle part dans le dépôt : la
    // page ne doit donc afficher aucune adresse de contact inventée.
    expect(source).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });
});

describe("le contenu de /conditions", () => {
  const source = lire("app/conditions/page.tsx");

  it("dit l'usage strictement personnel", () => {
    expect(source).toMatch(/personnel/i);
  });

  it("renvoie vers /confidentialite (les deux pages se complètent)", () => {
    expect(source).toContain("/confidentialite");
  });
});
