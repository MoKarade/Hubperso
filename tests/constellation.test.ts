import { describe, it, expect } from "vitest";
import { verifierConstellation, rapportConstellation } from "../lib/constellation";
import type { SummaryResult } from "../lib/fetchSummary";
import type { HubSource } from "../lib/sources";
import type { HubSummary } from "@mokarade/hub-contract";

function source(id: string): HubSource {
  return {
    id,
    name: id.toUpperCase(),
    summaryUrl: `https://${id}.hubperso.com/hub/summary`,
    token: "jeton",
    hero: false,
  };
}

function summary(appId: string, usage?: HubSummary["usage"]): HubSummary {
  return {
    contractVersion: 1,
    app: {
      id: appId,
      name: appId,
      url: `https://${appId}.hubperso.com`,
      color: "#112233",
    },
    generatedAt: "2026-08-20T12:00:00.000Z",
    status: "ok",
    metrics: [],
    alerts: [],
    actions: [],
    ...(usage ? { usage } : {}),
  };
}

function ok(id: string, appId = id, usage?: HubSummary["usage"]): SummaryResult {
  return { state: "ok", source: source(id), summary: summary(appId, usage) };
}

describe("verifierConstellation — tout concorde", () => {
  it("aucune incohérence quand identités et périodes s'accordent", () => {
    const r = verifierConstellation([
      ok("driveai", "driveai", { cost: { amount: 10, currency: "USD", period: "total" } }),
      ok("financeai", "financeai", { cost: { amount: 2, currency: "USD", period: "total" } }),
    ]);
    expect(r).toEqual([]);
    expect(rapportConstellation(r)).toContain("Constellation cohérente");
  });

  it("une app sans bloc usage ne déclenche rien", () => {
    expect(verifierConstellation([ok("carai"), ok("jobai")])).toEqual([]);
  });
});

describe("verifierConstellation — l'identité divergente", () => {
  it("détecte que sources.ts et l'app ne sont pas d'accord sur QUI est l'app", () => {
    // Le mode d'échec qui n'existait nulle part : le widget s'affiche, avec le bon contenu,
    // sous le bon nom. Rien ne signale la divergence.
    const r = verifierConstellation([ok("batchchef", "batch-chef")]);
    expect(r).toHaveLength(1);
    expect(r[0]?.genre).toBe("identite-divergente");
    expect(r[0]?.gravite).toBe("bloquant");
    expect(r[0]?.detail).toContain('"batchchef"');
    expect(r[0]?.detail).toContain('"batch-chef"');
  });
});

describe("verifierConstellation — états d'échec", () => {
  it("« contrat trop récent » est bloquant et désigne le HUB", () => {
    const r = verifierConstellation([
      { state: "contract-too-new", source: source("driveai"), published: 2, supported: 1 },
    ]);
    expect(r[0]?.genre).toBe("contrat-trop-recent");
    expect(r[0]?.detail).toContain("re-pinner le HUB");
  });

  it("distingue jeton absent (avertissement) et jeton refusé (bloquant)", () => {
    const r = verifierConstellation([
      { state: "unconfigured", source: source("carai") },
      { state: "unauthorized", source: source("jobai") },
    ]);
    const parSource = Object.fromEntries(r.map((i) => [i.source, i]));
    expect(parSource.carai?.gravite).toBe("avertissement");
    expect(parSource.jobai?.gravite).toBe("bloquant");
  });

  it("remonte le détail d'une app injoignable ou hors contrat", () => {
    const r = verifierConstellation([
      { state: "unreachable", source: source("driveai"), detail: "délai dépassé (9000 ms)" },
      { state: "invalid", source: source("financeai"), detail: "app.color: invalide" },
    ]);
    expect(r.map((i) => i.genre).sort()).toEqual(["hors-contrat", "injoignable"]);
    expect(r.find((i) => i.source === "driveai")?.detail).toContain("délai dépassé");
  });
});

describe("verifierConstellation — la cohérence d'agrégat", () => {
  it("signale des périodes mélangées : aucun total unique n'est affichable", () => {
    // C'est LE contrôle qui aurait attrapé DriveAI avant qu'un montant faux ne s'affiche.
    const r = verifierConstellation([
      ok("driveai", "driveai", { cost: { amount: 10, currency: "USD", period: "mois" } }),
      ok("financeai", "financeai", { cost: { amount: 2, currency: "USD", period: "total" } }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]?.genre).toBe("periodes-melangees");
    expect(r[0]?.detail).toContain("driveai");
    expect(r[0]?.detail).toContain("financeai");
  });

  it("périodes mélangées = AVERTISSEMENT, pas bloquant", () => {
    // Le contrat les autorise et le hub somme par période : il ne ment jamais. Faire échouer
    // le run ici punirait une situation légale.
    const r = verifierConstellation([
      ok("a", "a", { cost: { amount: 1, currency: "USD", period: "jour" } }),
      ok("b", "b", { cost: { amount: 1, currency: "USD", period: "total" } }),
    ]);
    expect(r.every((i) => i.gravite === "avertissement")).toBe(true);
  });

  it("signale des devises mélangées", () => {
    const r = verifierConstellation([
      ok("a", "a", { cost: { amount: 1, currency: "USD", period: "total" } }),
      ok("b", "b", { cost: { amount: 1, currency: "CAD", period: "total" } }),
    ]);
    expect(r.map((i) => i.genre)).toContain("devises-melangees");
  });

  it("une seule app avec un coût ne déclenche aucun mélange", () => {
    const r = verifierConstellation([
      ok("a", "a", { cost: { amount: 1, currency: "CAD", period: "jour" } }),
      ok("b"),
    ]);
    expect(r).toEqual([]);
  });
});

describe("rapportConstellation", () => {
  it("met les bloquants en tête et compte", () => {
    const r = verifierConstellation([
      { state: "unconfigured", source: source("zzz") },
      { state: "unauthorized", source: source("aaa") },
    ]);
    expect(r[0]?.gravite).toBe("bloquant");
    const texte = rapportConstellation(r);
    expect(texte).toContain("2 incohérence(s), dont 1 bloquante(s)");
    expect(texte.indexOf("aaa")).toBeLessThan(texte.indexOf("zzz"));
  });

  it("l'ordre est stable d'un run à l'autre", () => {
    const entree: SummaryResult[] = [ok("b", "x"), ok("a", "y"), ok("c", "z")];
    expect(rapportConstellation(verifierConstellation(entree))).toBe(
      rapportConstellation(verifierConstellation([...entree].reverse())),
    );
  });
});
