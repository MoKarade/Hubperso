import { describe, it, expect } from "vitest";
import type { HubMetric } from "@mokarade/hub-contract";
import { VALEUR_MAX, formatMetricValue, formatTrend, formatDateTime, ilYa } from "../lib/format";

function metric(over: Partial<HubMetric>): HubMetric {
  return { label: "x", value: 0, format: "number", ...over };
}

describe("formatMetricValue", () => {
  it("currency : symbole $ et pas de décimales", () => {
    const out = formatMetricValue(metric({ value: 123456, format: "currency" }));
    expect(out).toContain("$");
    expect(out).not.toContain(",00");
  });

  it("percent : la valeur est traitée en points de % et suffixée", () => {
    const out = formatMetricValue(metric({ value: 2.3, format: "percent" }));
    expect(out).toContain("2,3");
    expect(out).toContain("%");
  });

  it("number : formaté sans symbole monétaire", () => {
    const out = formatMetricValue(metric({ value: 1234, format: "number" }));
    expect(out).not.toContain("$");
    expect(out).toContain("234");
  });

  it("text : la chaîne est rendue telle quelle", () => {
    expect(formatMetricValue(metric({ value: "1 250 $ / mois", format: "text" }))).toBe(
      "1 250 $ / mois",
    );
  });

  it("valeur string non numérique en format numérique : rendue brute plutôt que NaN", () => {
    expect(formatMetricValue(metric({ value: "n/d", format: "currency" }))).toBe("n/d");
  });

  describe("longueur maximale d'une valeur texte (Hubperso#747)", () => {
    it("40 caractères ou moins : rendue telle quelle", () => {
      const quarante = "a".repeat(VALEUR_MAX);
      expect(formatMetricValue(metric({ value: quarante, format: "text" }))).toBe(quarante);
      expect(formatMetricValue(metric({ value: "n/d", format: "text" }))).toBe("n/d");
    });

    it.each([VALEUR_MAX + 1, 500])("%i caractères : coupée à 40 et finie par « … »", (n) => {
      const out = formatMetricValue(metric({ value: "b".repeat(n), format: "text" }));
      expect(Array.from(out)).toHaveLength(VALEUR_MAX);
      expect(out).toBe(`${"b".repeat(VALEUR_MAX - 1)}…`);
    });

    it("jamais au milieu d'un caractère à deux unités UTF-16", () => {
      const out = formatMetricValue(metric({ value: "😀".repeat(60), format: "text" }));
      expect(out).toBe(`${"😀".repeat(VALEUR_MAX - 1)}…`);
      expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    });

    it("une chaîne non numérique en format numérique est coupée aussi", () => {
      const out = formatMetricValue(metric({ value: "x".repeat(200), format: "number" }));
      expect(Array.from(out)).toHaveLength(VALEUR_MAX);
    });

    it("un nombre n'est jamais coupé", () => {
      const out = formatMetricValue(metric({ value: 123456789012345, format: "number" }));
      expect(out).not.toContain("…");
    });
  });
});

describe("formatTrend", () => {
  it("préfixe + pour une hausse", () => {
    expect(formatTrend(2.3).startsWith("+")).toBe(true);
    expect(formatTrend(2.3)).toContain("%");
  });
  it("préfixe le signe moins pour une baisse", () => {
    expect(formatTrend(-1)).toContain("−");
  });
});

describe("formatDateTime", () => {
  it("rend une date ISO valide", () => {
    expect(formatDateTime("2026-07-15T12:00:00.000Z")).not.toBe("2026-07-15T12:00:00.000Z");
  });
  it("retourne l'entrée brute si non parsable", () => {
    expect(formatDateTime("pas-une-date")).toBe("pas-une-date");
  });
});

describe("ilYa", () => {
  const MAINTENANT = Date.parse("2026-10-21T20:00:00Z");

  it("dit l'âge dans l'unité la plus parlante", () => {
    expect(ilYa("2026-10-21T19:50:00Z", MAINTENANT)).toBe("il y a 10 min");
    expect(ilYa("2026-10-21T17:00:00Z", MAINTENANT)).toBe("il y a 3 h");
    expect(ilYa("2026-10-19T20:00:00Z", MAINTENANT)).toBe("il y a 2 j");
  });

  it("ne rend jamais un âge négatif ni « 0 min » : à l'instant", () => {
    expect(ilYa("2026-10-21T19:59:30Z", MAINTENANT)).toBe("à l'instant");
    expect(ilYa("2026-10-21T20:05:00Z", MAINTENANT)).toBe("à l'instant");
  });

  it("rend une date illisible telle quelle plutôt qu'un âge inventé", () => {
    expect(ilYa("pas une date", MAINTENANT)).toBe("pas une date");
  });
});
