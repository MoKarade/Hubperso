// Agrégation coûts & quotas : conversion CAD, somme, « non suivi » honnête, alertes quota.

import { describe, expect, it } from "vitest";
import type { HubSummary } from "@mokarade/hub-contract";
import type { SummaryResult } from "../lib/fetchSummary";
import type { HubSource } from "../lib/sources";
import {
  aggregateUsage,
  pourquoiPasDeTotalUnique,
  quotaRatio,
  toCad,
  USD_TO_CAD,
} from "../lib/usage";

function source(id: string): HubSource {
  return { id, name: id, summaryUrl: `https://${id}.test/hub/summary`, token: "t", hero: false };
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
  it("somme les coûts en CAD d'une MÊME période, compte les apps suivies", () => {
    const d = aggregateUsage([
      ok("a", { cost: { amount: 10, currency: "CAD", period: "total" } }),
      ok("b", { cost: { amount: 2, currency: "USD", period: "total" } }),
      ok("c"), // pas de usage → non suivi
    ]);
    expect(d.trackedCount).toBe(2);
    expect(d.apps.find((x) => x.id === "c")?.tracked).toBe(false);
    expect(d.totalsByPeriod).toHaveLength(1);
    expect(d.totalsByPeriod[0]?.period).toBe("total");
    expect(d.totalsByPeriod[0]?.appCount).toBe(2);
    // 10 CAD + 2 USD×1.38 = 12.76
    expect(d.totalsByPeriod[0]?.cad).toBeCloseTo(10 + 2 * USD_TO_CAD, 2);
  });

  // LE défaut corrigé : DriveAI publie « mois », BatchChef/FinanceAI publient « total ».
  // Les additionner produisait un montant inexistant, affiché « cumulé ».
  it("ne fusionne JAMAIS des périodes différentes", () => {
    const d = aggregateUsage([
      ok("cumul", { cost: { amount: 10, currency: "CAD", period: "total" } }),
      ok("mensuel", { cost: { amount: 3, currency: "CAD", period: "mois" } }),
      ok("quotidien", { cost: { amount: 1, currency: "CAD", period: "jour" } }),
    ]);
    expect(d.totalsByPeriod).toEqual([
      { period: "total", cad: 10, appCount: 1 },
      { period: "mois", cad: 3, appCount: 1 },
      { period: "jour", cad: 1, appCount: 1 },
    ]);
    // Aucune somme globale ne doit exister : elle ne pourrait pas être honnête.
    expect(d).not.toHaveProperty("totalCad");
  });

  it("app hors ligne → non suivie, jamais un coût inventé", () => {
    const d = aggregateUsage([{ state: "unreachable", source: source("x"), detail: "timeout" }]);
    expect(d.trackedCount).toBe(0);
    expect(d.apps[0]?.costCad).toBeNull();
    expect(d.totalsByPeriod).toEqual([]);
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

describe("pourquoiPasDeTotalUnique — dire à l'écran ce que le code sait déjà", () => {
  it("se tait quand une seule période est en jeu", () => {
    // Rien à expliquer : une note permanente deviendrait du bruit qu'on cesse de lire,
    // et le jour où elle compte vraiment, on ne la verrait plus.
    expect(pourquoiPasDeTotalUnique([])).toBeNull();
    expect(pourquoiPasDeTotalUnique([{ period: "total", cad: 12, appCount: 2 }])).toBeNull();
  });

  it("explique, et NOMME les périodes en cause", () => {
    // C'est le cas réel d'aujourd'hui : FinanceAI publie un cumul, DriveAI le mois courant.
    // Un lecteur qui voit deux montants sans explication les additionne de tête — il refait
    // exactement l'erreur que `aggregateUsage` évite, sauf que lui ne le saura jamais.
    const note = pourquoiPasDeTotalUnique([
      { period: "total", cad: 12, appCount: 2 },
      { period: "mois", cad: 3, appCount: 1 },
    ]);
    expect(note).not.toBeNull();
    expect(note).toContain("cumulé");
    expect(note).toContain("ce mois-ci");
    // La conclusion doit être explicite : sans elle, on décrit le problème sans dire
    // qu'additionner est faux.
    expect(note).toMatch(/n'existe pas/);
  });

  it("couvre les trois périodes du contrat", () => {
    const note = pourquoiPasDeTotalUnique([
      { period: "total", cad: 1, appCount: 1 },
      { period: "mois", cad: 2, appCount: 1 },
      { period: "jour", cad: 3, appCount: 1 },
    ]);
    expect(note).toContain("aujourd\u2019hui");
  });
});
