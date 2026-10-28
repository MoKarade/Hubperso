// tests/resumeSerie.test.ts — ce que LIA lit d'une courbe du hub (Marc, 28/10 : « l'assistant ne voit pas les graphes »).
// Le résumé dit ce que le tracé montre, jamais un jugement ; sous deux relevés, rien (même règle que le tracé).
import { describe, expect, it } from "vitest";
import type { HubMetric } from "@mokarade/hub-contract";
import { resumerSerie, valeurDeMetrique } from "@/lib/resumeSerie";

const jour = (j: number) => Date.UTC(2026, 9, j, 16, 0, 0); // 16 h UTC : même jour à Toronto
const m = (extra: Partial<HubMetric> = {}): HubMetric => ({ label: "Documents classés", value: 1, format: "number", ...extra }) as HubMetric;

describe("resumerSerie", () => {
  it("dit le nombre de relevés, la période, le départ, l'arrivée, le sens, le plus bas et le plus haut", () => {
    const pts = [
      { t: jour(14), v: 120 },
      { t: jour(20), v: 90 },
      { t: jour(28), v: 340 },
    ];
    const r = resumerSerie(pts, "Documents classés", valeurDeMetrique(m()));
    expect(r).toContain("3 relevés du 14 oct. au 28 oct.");
    expect(r).toContain("de 120 à 340, en hausse");
    expect(r).toContain("plus bas 90 (20 oct.), plus haut 340 (28 oct.)");
  });

  it("écrit les valeurs comme la carte (pourcentage, devise) et dit une baisse sans la juger", () => {
    const pts = [
      { t: jour(10), v: 80.4 },
      { t: jour(11), v: 70 },
    ];
    const r = resumerSerie(pts, "Précision", valeurDeMetrique(m({ format: "percent" })));
    expect(r).toContain("de 80,4 % à 70 %, en baisse");
    expect(r).not.toMatch(/mauvais|problème|alerte/i);
  });

  it("une série plate : « toujours X », jamais un plus bas et un plus haut inventés", () => {
    const r = resumerSerie([{ t: jour(1), v: 5 }, { t: jour(2), v: 5 }], "Véhicules", valeurDeMetrique(m()));
    expect(r).toContain("au même niveau qu'au départ");
    expect(r).toContain("toujours 5");
    expect(r).not.toContain("plus bas");
  });

  it("moins de deux relevés valables : rien (pas de résumé pour un tracé qu'on ne dessine pas)", () => {
    expect(resumerSerie([], "X", String)).toBeNull();
    expect(resumerSerie([{ t: jour(1), v: 1 }], "X", String)).toBeNull();
    expect(resumerSerie([{ t: jour(1), v: 1 }, { t: jour(2), v: Number.NaN }], "X", String)).toBeNull();
  });

  it("la date est celle du fuseau de Marc, pas celle d'UTC", () => {
    // 01 h UTC le 15 = 21 h le 14 à Toronto.
    const r = resumerSerie([{ t: Date.UTC(2026, 9, 15, 1), v: 1 }, { t: Date.UTC(2026, 9, 16, 1), v: 2 }], "X", String);
    expect(r).toContain("du 14 oct. au 15 oct.");
  });
});
