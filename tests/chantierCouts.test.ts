// tests/chantierCouts.test.ts — les coûts et quotas des apps tels que l'onglet Coûts du Chantier les reçoit
// (ce que montrait la page `/couts`, retirée le 26/10/2026) : mêmes règles d'honnêteté, au mot près.

import { describe, expect, it } from "vitest";
import type { HubSummary } from "@mokarade/hub-contract";
import { coutsPourCadre, NOTE_CONVERSION } from "@/lib/chantierCouts";
import type { SummaryResult } from "@/lib/fetchSummary";
import type { HubSource } from "@/lib/sources";
import { aggregateUsage, USD_TO_CAD } from "@/lib/usage";

const MAINTENANT = Date.parse("2026-10-26T20:00:00Z");

function source(id: string): HubSource {
  return { id, name: id, summaryUrl: `https://${id}.test/hub/summary`, accueilUrl: `https://${id}.test`, token: "t", hero: false };
}

function ok(id: string, usage?: HubSummary["usage"]): SummaryResult {
  return {
    state: "ok",
    source: source(id),
    summary: {
      contractVersion: 1,
      app: { id, name: id.toUpperCase(), url: `https://${id}.test`, color: "#123456" },
      generatedAt: "2026-10-26T19:59:00.000Z",
      status: "ok",
      metrics: [],
      alerts: [],
      actions: [],
      usage,
    },
  };
}

const hors: SummaryResult = { state: "unreachable", source: source("hors"), detail: "délai dépassé" };

describe("coutsPourCadre", () => {
  const cadre = coutsPourCadre(
    aggregateUsage([
      ok("a", {
        cost: { amount: 10, currency: "CAD", period: "mois" },
        quotas: [
          { label: "Requêtes", used: 90, limit: 100, unit: "req", resetAt: "2026-10-28T20:00:00Z" },
          { label: "Stockage", used: 5, limit: null },
        ],
      }),
      ok("b", { cost: { amount: 2, currency: "USD", period: "total" } }),
      ok("c"),
      hors,
    ]),
    MAINTENANT,
  );

  it("un total PAR période, jamais fusionnés, avec la raison écrite à côté", () => {
    expect(cadre.totaux.map((t) => t.periode)).toEqual(["ce mois-ci", "cumulé"]);
    expect(cadre.totaux[0]).toMatchObject({ cad: 10, apps: 1 });
    expect(cadre.totaux[1]!.cad).toBeCloseTo(2 * USD_TO_CAD, 2);
    expect(cadre.note).toMatch(/Pas de total unique/);
    expect(Object.keys(cadre)).not.toContain("totalCad");
  });

  it("le coût garde son montant brut et sa devise à côté du montant converti", () => {
    const b = cadre.detail.find((a) => a.nom === "B")!;
    expect(b.cout).toMatchObject({ brut: 2, devise: "USD", periode: "cumulé" });
    expect(b.cout!.cad).toBeCloseTo(2 * USD_TO_CAD, 2);
  });

  it("une app sans coût est nommée et sans coût (jamais 0) ; hors ligne, elle le dit", () => {
    const c = cadre.detail.find((a) => a.nom === "C")!;
    expect(c).toMatchObject({ enLigne: true, suivie: false, cout: null, quotas: [] });
    const h = cadre.detail.find((a) => a.nom === "hors")!;
    expect(h).toMatchObject({ enLigne: false, suivie: false, cout: null });
    expect(cadre.suivies).toBe(2);
    expect(cadre.apps).toBe(4);
  });

  it("un quota a sa part du plafond et sa remise à zéro ; sans plafond publié, pas de jauge", () => {
    const a = cadre.detail.find((x) => x.nom === "A")!;
    expect(a.quotas[0]).toMatchObject({ pct: 90, alerte: true, unit: "req", remise: "se remet à zéro dans 2 j" });
    expect(a.quotas[1]).toMatchObject({ pct: null, limit: null, alerte: false, remise: null });
    expect(cadre.alertes).toBe(1);
  });

  it("un seul total : aucune note", () => {
    const seul = coutsPourCadre(aggregateUsage([ok("a", { cost: { amount: 1, currency: "CAD", period: "mois" } })]), MAINTENANT);
    expect(seul.note).toBeNull();
  });

  it("la part d'un quota dépassé est plafonnée à 100 %", () => {
    const d = coutsPourCadre(aggregateUsage([ok("a", { quotas: [{ label: "x", used: 250, limit: 100 }] })]), MAINTENANT);
    expect(d.detail[0]!.quotas[0]!.pct).toBe(100);
  });

  it("le résultat est du JSON pur (il traverse le canal et la route)", () => {
    expect(JSON.parse(JSON.stringify(cadre))).toEqual(cadre);
  });

  it("dit que les montants viennent des apps et que la conversion est approximative", () => {
    expect(NOTE_CONVERSION).toMatch(/taux approximatif/);
    expect(NOTE_CONVERSION).toMatch(/jamais estimé par le hub/);
  });
});
