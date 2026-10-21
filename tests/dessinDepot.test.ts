// tests/dessinDepot.test.ts — la constellation décorative d'une carte de /graphes.
//
// Prouve : même nom = même dessin (le rendu serveur et le rendu client concordent) ; deux noms
// donnent deux dessins ; tout reste dans le cadre ; d'un seul tenant ; jamais un lien vers soi-même.

import { describe, expect, it } from "vitest";
import { DEPOTS } from "../lib/graphes";
import { HAUTEUR, LARGEUR, dessinDepot } from "../lib/dessinDepot";

describe("dessinDepot", () => {
  it("est déterministe : le même nom redonne exactement le même dessin", () => {
    expect(dessinDepot("Hubperso")).toEqual(dessinDepot("Hubperso"));
  });

  it("donne un dessin différent à chaque dépôt du hub", () => {
    const signatures = DEPOTS.map((d) => JSON.stringify(dessinDepot(d).points));
    expect(new Set(signatures).size).toBe(DEPOTS.length);
  });

  it("garde tous les points dans le cadre, avec un rayon de 3 à 6", () => {
    for (const depot of DEPOTS) {
      for (const p of dessinDepot(depot).points) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(LARGEUR);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(HAUTEUR);
        expect(p.r).toBeGreaterThanOrEqual(3);
        expect(p.r).toBeLessThanOrEqual(6);
      }
    }
  });

  it("est d'un seul tenant et sans lien d'un point vers lui-même", () => {
    for (const depot of DEPOTS) {
      const { points, liens } = dessinDepot(depot);
      const parent = points.map((_, i) => i);
      const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i]!)));
      for (const [a, b] of liens) {
        expect(a).not.toBe(b);
        parent[racine(a)] = racine(b);
      }
      expect(new Set(points.map((_, i) => racine(i))).size).toBe(1);
    }
  });
});
