// tests/chantierFacons.test.ts — En cours : le bloc « Façons de travailler » (Hubperso#710).
// Règle de Marc (28/10) : chaque changement de façon de travailler va sur la bonne page du Chantier, à jour, avec ses durées.
// On lit le registre tel qu'il est publié dans chantier/cadre.html : chaque entrée dit ce qu'elle doit dire, et rien n'est inventé.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(resolve(process.cwd(), "chantier", "cadre.html"), "utf8");
const debut = SOURCE.indexOf("const XFACON = ");
const fin = SOURCE.indexOf("];", SOURCE.indexOf("const XFACONS = [")) + 2;
type Facon = { ref?: string; regle?: string; t: string; att: string | null; mes: string | null };
const { XFACON, XFACONS } = new Function(`${SOURCE.slice(debut, fin)}; return {XFACON, XFACONS};`)() as { XFACON: string; XFACONS: Facon[] };

describe("registre des façons de travailler", () => {
  it("l'étiquette qui désigne une façon est `façon-de-travailler`", () => {
    expect(XFACON).toBe("façon-de-travailler");
  });

  it("chaque entrée a un titre et soit l'issue qui la porte (dépôt#n), soit la date d'une règle ; jamais les deux, jamais aucun des deux", () => {
    expect(XFACONS.length).toBeGreaterThanOrEqual(8);
    for (const f of XFACONS) {
      expect(f.t.length).toBeGreaterThan(10);
      expect(Boolean(f.ref) !== Boolean(f.regle)).toBe(true);
      if (f.ref) expect(f.ref).toMatch(/^[\w.-]+#\d+$/);
      if (f.regle) expect(f.regle).toMatch(/^\d{2}\/\d{2}$/);
    }
    expect(new Set(XFACONS.map((f) => f.ref).filter(Boolean)).size).toBe(XFACONS.filter((f) => f.ref).length);
  });

  it("les durées attendues données par le fil workflow sont là ; aucune durée mesurée n'est inventée tant que rien n'est mesuré", () => {
    const par = (ref: string) => XFACONS.find((f) => f.ref === ref)!;
    expect(par(".github#750").att).toContain("moins de 1 min");
    expect(par(".github#748").att).toContain("quelques secondes");
    expect(par(".github#713").att).toContain("2 min");
    expect(XFACONS.find((f) => f.regle && f.t.includes("coordinateur"))!.att).toContain("10 min");
    for (const f of XFACONS) expect(f.mes).toBeNull();
  });

  it("le bloc est branché dans En cours : état et âge lus dans le relevé, durée absente dite, issue absente dite", () => {
    expect(SOURCE).toContain("const fzListe = [...XFACONS, ...fzNodes].map(f => ({...f, n: f.ref ? M.N[f.ref] || null : null}));");
    expect(SOURCE).toContain("'pas encore mesuré'");
    expect(SOURCE).toContain("'hors du relevé'");
    expect(SOURCE).toContain("'mise en place en '");
    expect(SOURCE).toContain("n.lb.includes(XFACON) && !fzRef.has(n.ref)");
    expect(SOURCE).toContain("${key}${facHtml}${grid(2,");
  });
});
