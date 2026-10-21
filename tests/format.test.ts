import { describe, it, expect } from "vitest";
import type { HubMetric } from "@mokarade/hub-contract";
import { formatMetricValue, formatTrend, formatDateTime, ilYa } from "../lib/format";

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
