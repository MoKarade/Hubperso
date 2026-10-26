// tests/chargement.test.ts — carte 3 : Attention affiche « Chargement… » pendant
// que les apps répondent (jusqu'à 9 s), au lieu d'un écran vide.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe.each(["app/attention/loading.tsx"])("%s", (chemin) => {
  it("existe", () => {
    expect(existsSync(chemin)).toBe(true);
  });

  const source = existsSync(chemin) ? readFileSync(chemin, "utf8") : "";

  it("affiche « Chargement… » de façon annoncée aux lecteurs d'écran", () => {
    expect(source).toMatch(/Chargement…/);
    expect(source).toMatch(/role="status"/);
  });

  it("n'appelle aucune donnée d'app (pas de fetch, pas de garde à contourner)", () => {
    expect(source).not.toMatch(/fetch|exigerAccesHub|lib\/sources/);
  });
});
