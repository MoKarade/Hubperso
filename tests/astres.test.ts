import { describe, expect, it } from "vitest";
import type { HubSummary } from "@mokarade/hub-contract";
import type { SummaryResult } from "../lib/fetchSummary";
import type { HubSource } from "../lib/sources";
import {
  destinationAstre,
  dispositionAstres,
  etatAstre,
  etoiles,
  satellitesAstre,
  SATELLITES_MAX,
} from "../lib/astres";

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

describe("satellitesAstre : une alerte publiée = un satellite", () => {
  const avecAlertes = (...severites: ("info" | "warn" | "alert")[]): SummaryResult => {
    const base = ok("ok") as Extract<SummaryResult, { state: "ok" }>;
    return {
      ...base,
      summary: { ...base.summary, alerts: severites.map((severity, i) => ({ label: `a${i}`, severity })) },
    };
  };

  it("classe les plus graves d'abord et nomme le ton du jeton", () => {
    expect(satellitesAstre(avecAlertes("info", "alert", "warn"))).toEqual({
      tons: ["danger", "warn", "info"],
      total: 3,
    });
  });

  it("n'en dessine que cinq, mais dit le vrai nombre", () => {
    const r = satellitesAstre(avecAlertes(...Array.from({ length: 8 }, () => "warn" as const)));
    expect(r.tons).toHaveLength(SATELLITES_MAX);
    expect(r.total).toBe(8);
  });

  it("une app qui ne répond pas, ou servie du cache, n'a AUCUN satellite (inconnu ≠ zéro)", () => {
    expect(satellitesAstre({ state: "unreachable", source, detail: "x" })).toEqual({ tons: [], total: 0 });
    const enCache = { ...avecAlertes("alert"), stale: true } as SummaryResult;
    expect(satellitesAstre(enCache)).toEqual({ tons: [], total: 0 });
  });

  it("une app sans alerte n'en montre pas", () => {
    expect(satellitesAstre(ok("ok"))).toEqual({ tons: [], total: 0 });
  });
});

describe("etoiles", () => {
  it("est déterministe, dans la scène, et refuse un nombre invalide", () => {
    expect(etoiles(40)).toEqual(etoiles(40));
    expect(etoiles(40)).toHaveLength(40);
    for (const e of etoiles(40)) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(100);
      expect(e.r).toBeGreaterThanOrEqual(0.5);
      expect(e.r).toBeLessThanOrEqual(1.5);
      expect(e.d).toBeLessThanOrEqual(0);
    }
    expect(() => etoiles(-1)).toThrow(RangeError);
  });
});
