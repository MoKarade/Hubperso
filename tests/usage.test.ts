// Agrégation coûts & quotas : conversion CAD, somme, « non suivi » honnête, alertes quota.

import { describe, expect, it } from "vitest";
import type { HubSummary } from "@mokarade/hub-contract";
import type { SummaryResult } from "../lib/fetchSummary";
import type { HubSource } from "../lib/sources";
import { aggregateUsage, quotaRatio, toCad, USD_TO_CAD } from "../lib/usage";

function source(id: string): HubSource {
  return { id, name: id, summaryUrl: `https://${id}.test/hub/summary`, token: "t" };
}

function ok(id: string, usage?: HubSummary["usage"]): SummaryResult {
  return {
    state: "ok",
    source: source(id),
    summary: {
      contractVersion: 1,
      app: { id, name: id.toUpperCase(), url: `https://${id}.test`, color: "#123456" },
      generatedAt: "2026-07-24T12:00:00.000Z",
      status: "ok",
      metrics: [],
      alerts: [],
      actions: [],
      usage,
    },
  };
}

describe("toCad", () => {
  it("convertit USD→CAD, laisse CAD tel quel", () => {
    expect(toCad(10, "USD")).toBeCloseTo(10 * USD_TO_CAD);
    expect(toCad(10, "CAD")).toBe(10);
  });
});

describe("quotaRatio", () => {
  it("ratio used/limit, null si plafond inconnu ou nul", () => {
    expect(quotaRatio(80, 100)).toBe(0.8);
    expect(quotaRatio(5, null)).toBeNull();
    expect(quotaRatio(5, 0)).toBeNull();
  });
});

describe("aggregateUsage", () => {
  it("somme les coûts en CAD, compte les apps suivies", () => {
    const d = aggregateUsage([
      ok("a", { cost: { amount: 10, currency: "CAD", period: "total" } }),
      ok("b", { cost: { amount: 2, currency: "USD", period: "total" } }),
      ok("c"), // pas de usage → non suivi
    ]);
    expect(d.trackedCount).toBe(2);
    expect(d.apps.find((x) => x.id === "c")?.tracked).toBe(false);
    // 10 CAD + 2 USD×1.38 = 12.76
    expect(d.totalCad).toBeCloseTo(10 + 2 * USD_TO_CAD, 2);
  });

  it("app hors ligne → non suivie, jamais un coût inventé", () => {
    const d = aggregateUsage([{ state: "unreachable", source: source("x"), detail: "timeout" }]);
    expect(d.trackedCount).toBe(0);
    expect(d.apps[0]?.costCad).toBeNull();
    expect(d.totalCad).toBe(0);
  });

  it("compte les quotas à ≥ 80 % de leur plafond", () => {
    const d = aggregateUsage([
      ok("a", { quotas: [{ label: "Gmail", used: 90, limit: 100 }, { label: "Drive", used: 10, limit: 100 }] }),
      ok("b", { quotas: [{ label: "Libre", used: 999, limit: null }] }), // sans plafond → jamais en alerte
    ]);
    expect(d.quotaWarnings).toBe(1);
  });

  it("un bloc usage vide (ni coût ni quota) reste non suivi", () => {
    const d = aggregateUsage([ok("a", {})]);
    expect(d.trackedCount).toBe(0);
  });
});
