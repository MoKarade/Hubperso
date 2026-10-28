// tests/chantierCibles.test.ts — En cours : les trois délais visés (file, prise, preuve), 10 min au plus chacun (cible du 29/10, Marc).
// On exécute `xcEligible` telle qu'elle est publiée dans chantier/cadre.html et on vérifie que le bloc est bien branché dans En cours.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(resolve(process.cwd(), "chantier", "cadre.html"), "utf8");

describe("En cours : les trois délais visés (file, prise, preuve), 10 min au plus chacun", () => {
  const debut = SOURCE.indexOf("const xcEligible = l =>");
  const fin = SOURCE.indexOf("\n", debut);
  const xcEligible = new Function(`${SOURCE.slice(debut, fin)}; return xcEligible;`)() as (l: { c: number; waits?: { unknown?: boolean; end?: number | string | null }[] }) => number;

  it("« éligible depuis » : le plus tard de la création et de la fermeture de chaque dépendance ; une dépendance inconnue ou non fermée ne se date pas", () => {
    const c = Date.parse("2026-10-28T10:00:00Z");
    expect(xcEligible({ c })).toBe(c);
    expect(xcEligible({ c, waits: [{ end: Date.parse("2026-10-28T09:00:00Z") }] })).toBe(c);
    expect(xcEligible({ c, waits: [{ end: Date.parse("2026-10-28T12:00:00Z") }, { end: "2026-10-28T11:00:00Z" }] })).toBe(Date.parse("2026-10-28T12:00:00Z"));
    expect(xcEligible({ c, waits: [{ unknown: true, end: Date.parse("2026-10-28T23:00:00Z") }, { end: null }] })).toBe(c);
  });

  it("le bloc est dans En cours, avec la cible, les trois délais, la part tenue et les dépassements dits, sans valeur inventée quand rien n'est mesuré", () => {
    expect(SOURCE).toContain("const XCIBLE = 10 * 60e3;");
    expect(SOURCE).toContain("add('fileEl', xcEligible(l), l.start);");
    expect(SOURCE).toContain("dans: a.filter(v => v <= XCIBLE).length");
    expect(SOURCE).toContain("[['fileEl', 'File',");
    expect(SOURCE).toContain("['prise', 'Prise',");
    expect(SOURCE).toContain("['prove', 'Preuve',");
    expect(SOURCE).toContain("${top}${ph}${cibleHtml}<div class=\"xc-sc\">");
    expect(SOURCE).toContain("rien à mesurer");
    expect(SOURCE).toContain("au-dessus de ");
  });
});
