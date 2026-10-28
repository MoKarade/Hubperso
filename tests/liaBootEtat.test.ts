// tests/liaBootEtat.test.ts — `window.__liaEtat()` dit à la preuve si les nanobots de LIA sont sortis (Hubperso#728).
//
// Le relevé du PC voyait « un nuage de petits points » pendant un déplacement de LIA et ne pouvait pas dire si
// c'étaient ses nanobots (le balayage d'analyse, interdit sur une visite spontanée, Hubperso#679) ou le dessin
// normal de son corps. `nanobots()` de lia-ui rend `actif` et `sortis` : la preuve les lit, elle ne devine plus.
// Lecture SEULE : l'état rendu ne donne jamais la poignée (on ne peut ni la faire parler ni la déplacer d'ici).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "..", "components", "LiaBoot.tsx"), "utf8");

/** Le corps de la fonction affectée à `window.__liaEtat`. */
function corpsLiaEtat(): string {
  const i = source.indexOf(".__liaEtat = () => {");
  expect(i, "window.__liaEtat n'est plus affecté").toBeGreaterThan(-1);
  return source.slice(i, source.indexOf("};", i));
}

describe("window.__liaEtat expose les nanobots, en lecture seule", () => {
  const corps = corpsLiaEtat();

  it("rend le résultat de nanobots() de la poignée", () => {
    expect(corps).toContain("nanobots: h.nanobots()");
  });

  it("garde ce qu'il rendait déjà (journal, ressent, envies, faits)", () => {
    for (const cle of ["journal: h.journal()", "ressent: h.ressent()", "envies: h.envies()", "faits: lireFaits()"]) {
      expect(corps).toContain(cle);
    }
  });

  it("ne rend jamais la poignée elle-même", () => {
    expect(corps).not.toMatch(/return\s+h\b\s*[;:]/);
    expect(corps).not.toMatch(/\bpoignee:\s*h\b/);
  });

  it("rend null tant que LIA n'est pas montée", () => {
    expect(corps).toContain(": null;");
  });
});
