import { describe, expect, it } from "vitest";
import type { HubSummary } from "@mokarade/hub-contract";
import type { SummaryResult } from "../lib/fetchSummary";
import type { HubSource } from "../lib/sources";
import { destinationAstre, dispositionAstres, etatAstre } from "../lib/astres";

const source: HubSource = {
  id: "exemple",
  name: "Exemple",
  summaryUrl: "https://exemple.invalid/hub/summary",
  accueilUrl: "https://exemple.invalid",
  token: "jeton-fictif",
  hero: false,
};

function summary(status: HubSummary["status"], url = "https://exemple.invalid/app"): HubSummary {
  return {
    contractVersion: 1,
    app: { id: "exemple", name: "Exemple", url, color: "#336699" },
    generatedAt: "2026-10-21T12:00:00.000Z",
    status,
    metrics: [],
    alerts: [],
    actions: [],
  };
}

const ok = (status: HubSummary["status"], plus: Partial<SummaryResult> = {}): SummaryResult =>
  ({ state: "ok", source, summary: summary(status), ...plus }) as SummaryResult;

describe("etatAstre : l'astre dit ce que dit la carte", () => {
  it("chaque état du hub a son genre et reprend le mot du badge", () => {
    expect(etatAstre(ok("ok"))).toEqual({ genre: "vivant", mot: "À jour" });
    expect(etatAstre(ok("degraded"))).toEqual({ genre: "retard", mot: "Données en retard" });
    expect(etatAstre(ok("error"))).toEqual({ genre: "panne", mot: "En erreur" });
    expect(etatAstre(ok("building"))).toEqual({ genre: "construction", mot: "En construction" });
    expect(etatAstre({ state: "unreachable", source, detail: "délai dépassé" })).toEqual({
      genre: "panne",
      mot: "Injoignable",
    });
    expect(etatAstre({ state: "unauthorized", source }).genre).toBe("panne");
    expect(etatAstre({ state: "invalid", source, detail: "x" }).genre).toBe("panne");
    expect(etatAstre({ state: "unconfigured", source, manque: [] }).genre).toBe("absent");
  });

  it("un résumé en cache n'est JAMAIS un astre vivant", () => {
    const enCache = ok("ok", { stale: true, cachedAgeMs: 60_000 });
    expect(etatAstre(enCache)).toEqual({ genre: "retard", mot: "En cache" });
  });

  it("contrat trop récent : retard du hub, pas panne de l'app", () => {
    expect(etatAstre({ state: "contract-too-new", source, published: 2, supported: 1 }).genre).toBe(
      "retard",
    );
  });
});

describe("destinationAstre", () => {
  it("une app qui répond s'ouvre elle-même", () => {
    expect(destinationAstre(ok("ok"))).toEqual({
      href: "https://exemple.invalid/app",
      externe: true,
    });
  });

  it("une adresse non http(s) retombe sur l'accueil déclaré du hub, jamais sur elle", () => {
    const r = { state: "ok", source, summary: summary("ok", "javascript:alert(1)") } as SummaryResult;
    expect(destinationAstre(r)).toEqual({ href: "https://exemple.invalid/", externe: true });
  });

  it("en panne, en cache ou non branchée : le détail dans le hub, où la cause est écrite", () => {
    const interne = { href: "/app/exemple", externe: false };
    expect(destinationAstre({ state: "unreachable", source, detail: "x" })).toEqual(interne);
    expect(destinationAstre(ok("ok", { stale: true, cachedAgeMs: 1 }))).toEqual(interne);
    expect(destinationAstre({ state: "unconfigured", source, manque: [] })).toEqual(interne);
  });
});

describe("dispositionAstres", () => {
  it("rend autant de positions que d'apps, la première en haut", () => {
    const p = dispositionAstres(6);
    expect(p).toHaveLength(6);
    expect(p[0]).toEqual({ x: 50, y: 17, lx: 10, ly: 22 });
    expect(p[5]).toMatchObject({ lx: 90, ly: 74 });
  });

  it("est déterministe et reste dans la scène", () => {
    expect(dispositionAstres(7)).toEqual(dispositionAstres(7));
    for (const n of [1, 2, 5, 6, 7, 12]) {
      for (const { x, y, lx, ly } of dispositionAstres(n)) {
        for (const v of [x, lx]) {
          expect(v).toBeGreaterThanOrEqual(5);
          expect(v).toBeLessThanOrEqual(95);
        }
        for (const v of [y, ly]) {
          expect(v).toBeGreaterThanOrEqual(10);
          expect(v).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it("ne superpose jamais deux astres, dans aucune des deux dispositions", () => {
    const p = dispositionAstres(7);
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        expect(Math.hypot(p[i]!.x - p[j]!.x, p[i]!.y - p[j]!.y)).toBeGreaterThan(15);
        expect(Math.hypot(p[i]!.lx - p[j]!.lx, p[i]!.ly - p[j]!.ly)).toBeGreaterThan(15);
      }
  });

  it("zéro app : zéro astre ; un nombre négatif ou décimal est refusé", () => {
    expect(dispositionAstres(0)).toEqual([]);
    expect(() => dispositionAstres(-1)).toThrow(RangeError);
    expect(() => dispositionAstres(2.5)).toThrow(RangeError);
  });
});
