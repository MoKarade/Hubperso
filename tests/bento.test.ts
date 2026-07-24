// Mise en page bento : un seul héros (le plus riche), taille dérivée du contenu.

import { describe, expect, it } from "vitest";
import { heroIndex, widgetSize } from "../lib/bento";

describe("heroIndex", () => {
  it("choisit l'app OK la plus riche en métriques", () => {
    expect(
      heroIndex([
        { ok: true, metrics: 3 },
        { ok: true, metrics: 5 },
        { ok: true, metrics: 4 },
      ]),
    ).toBe(1);
  });

  it("première en cas d'égalité (stable)", () => {
    expect(
      heroIndex([
        { ok: true, metrics: 4 },
        { ok: true, metrics: 4 },
      ]),
    ).toBe(0);
  });

  it("ignore les apps non OK", () => {
    expect(
      heroIndex([
        { ok: false, metrics: 0 },
        { ok: true, metrics: 2 },
      ]),
    ).toBe(1);
  });

  it("aucun héros si aucune app OK avec au moins une métrique", () => {
    expect(heroIndex([{ ok: false, metrics: 0 }, { ok: true, metrics: 0 }])).toBe(-1);
    expect(heroIndex([])).toBe(-1);
  });
});

describe("widgetSize", () => {
  it("héros → grand, OK avec métriques → moyen, reste → petit", () => {
    expect(widgetSize(true, 5, true)).toBe("widget--lg");
    expect(widgetSize(true, 3, false)).toBe("widget--md");
    expect(widgetSize(true, 0, false)).toBe("widget--sm");
    expect(widgetSize(false, 0, false)).toBe("widget--sm");
  });
});
