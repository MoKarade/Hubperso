// tests/pageIntrouvable.test.ts — carte 1 : une adresse d'app inexistante affiche une page
// en français avec un retour au hub, au lieu de l'écran anglais « 404 This page could not
// be found » de Next.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app/not-found.tsx", () => {
  it("existe (sinon Next affiche sa page anglaise)", () => {
    expect(existsSync("app/not-found.tsx")).toBe(true);
  });

  const source = existsSync("app/not-found.tsx") ? readFileSync("app/not-found.tsx", "utf8") : "";

  it("dit en français que la page est introuvable", () => {
    expect(source).toMatch(/introuvable/i);
    expect(source).not.toMatch(/could not be found/i);
  });

  it("propose un bouton « Retour au hub » qui mène à l'accueil", () => {
    expect(source).toMatch(/Retour au hub/);
    expect(source).toMatch(/href="\/"/);
  });

  it("utilise le bouton du hub (cible tactile garantie par .btn) et n'ouvre pas d'onglet", () => {
    expect(source).toMatch(/className="btn"/);
    expect(source).not.toMatch(/target="_blank"/);
  });
});
