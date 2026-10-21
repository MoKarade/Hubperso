// tests/sensCouleurs.test.ts — « chaque couleur a une signification » (Marc, 21/10/2026,
// docs/adr/0006-sens-des-couleurs.md). Les couleurs d'ÉTAT (vert, ambre, rouge, bleu, gris) ne
// servent qu'à dire un état : le décor du ciel (étoiles, orbites, faisceau, voile) n'en prend jamais.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const COULEURS_D_ETAT = /var\(--(ok|warn|danger|info|neutral)\b/;

/** Les déclarations de chaque règle dont le sélecteur commence par l'un de ces préfixes. */
function reglesDe(prefixes: string[]): { selecteur: string; corps: string }[] {
  const regles: { selecteur: string; corps: string }[] = [];
  for (const m of css.matchAll(/(^|\n)\s*([^{}@\n][^{}]*)\{([^{}]*)\}/g)) {
    const selecteur = m[2]!.trim();
    if (prefixes.some((p) => selecteur.split(",").some((s) => s.trim().startsWith(p)))) {
      regles.push({ selecteur, corps: m[3]! });
    }
  }
  return regles;
}

describe("sens des couleurs", () => {
  const decor = [".ciel__fond", ".ciel__etoile", ".ciel__filante", ".ciel__orbite", ".ciel__balayage"];

  it("le décor du ciel existe dans le CSS (le verrou ne regarde pas dans le vide)", () => {
    expect(reglesDe(decor).length).toBeGreaterThanOrEqual(10);
  });

  it("le décor n'emprunte aucune couleur d'état", () => {
    const fautes = reglesDe(decor)
      .filter((r) => COULEURS_D_ETAT.test(r.corps))
      .map((r) => r.selecteur);
    expect(fautes, `Décor aux couleurs d'état :\n${fautes.join("\n")}`).toEqual([]);
  });

  it("une pastille d'état ne prend que SA couleur (vert = à jour, ambre = en retard, rouge = panne, bleu = construction)", () => {
    const attendu: Record<string, string> = {
      vivant: "--ok",
      retard: "--warn",
      panne: "--danger",
      construction: "--info",
    };
    for (const [etat, jeton] of Object.entries(attendu)) {
      const r = reglesDe([`.astre__pastille[data-etat="${etat}"]`]);
      expect(r, etat).toHaveLength(1);
      expect(r[0]!.corps).toContain(`var(${jeton})`);
    }
  });
});
