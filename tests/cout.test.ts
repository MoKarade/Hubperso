// tests/cout.test.ts — GET /api/cout : le coût API cumulé, public mais borné.
//
// Quatre garanties : la réponse porte le total et sa date ; une app sans coût est « non
// lisible » et jamais 0 ; une base muette donne 503 (jamais « 0 $ ») ; le corps ne porte rien
// que le total, les identifiants d'apps et la date.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Releve } from "../lib/historique";

let ip = 0;
const requete = () =>
  new Request("https://hubperso.com/api/cout", { headers: { "x-real-ip": `10.1.0.${++ip}` } });

function releve(appId: string, montant: number, periode: "total" | "mois" = "total"): Releve {
  return {
    appId,
    releveLe: Date.parse("2026-10-16T12:00:00Z"),
    etat: "ok",
    dataAsOf: Date.parse("2026-10-16T11:50:00Z"),
    metriques: [],
    cout: { montant, devise: "CAD", periode },
  };
}

type Refs = { avant: Releve[]; apres: Releve[] } | null;

async function appeler(
  derniers: Releve[] | null,
  baseConfiguree = true,
  references: Refs = { avant: [], apres: [] },
) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ baseConfiguree: () => baseConfiguree }));
  vi.doMock("@/lib/migrations", () => ({ assurerMigrations: async () => {} }));
  vi.doMock("@/lib/horloge", () => ({ maintenantMs: () => Date.parse("2026-10-16T14:00:00Z") }));
  vi.doMock("@/lib/historiqueDb", () => ({
    lireDerniersCouts: async () => derniers,
    lireReferencesMois: async () => references,
  }));
  const { GET } = await import("../app/api/cout/route");
  return GET(requete());
}

afterEach(() => {
  vi.doUnmock("@/lib/horloge");
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/historiqueDb");
  vi.doUnmock("@/lib/migrations");
  vi.resetModules();
});

describe("GET /api/cout", () => {
  it("rend le total, sa date de mesure et les apps non lisibles", async () => {
    const res = await appeler([releve("batchchef", 4), releve("financeai", 1.5), releve("driveai", 9, "mois")]);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const corps = await res.json();
    expect(corps).toMatchObject({
      ok: true,
      periode: "total",
      devise: "CAD",
      cumulCad: 5.5,
      dataAsOf: "2026-10-16T11:50:00.000Z",
    });
    expect(corps.apps.lues).toBe(2);
    expect(corps.apps.nonLisibles).toContain("driveai");
    expect(corps.apps.nonLisibles).not.toContain("batchchef");
  });

  it("n'invente pas 0 quand aucune app ne publie de coût", async () => {
    const corps = await (await appeler([])).json();
    expect(corps.cumulCad).toBeNull();
    expect(corps.dataAsOf).toBeNull();
  });

  it("répond 503 quand la base ne répond pas, sans rien d'autre", async () => {
    const res = await appeler(null);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, cause: "base" });
  });

  it("répond 503 quand la base n'est pas configurée", async () => {
    const res = await appeler([], false);
    expect(res.status).toBe(503);
  });

  it("le corps ne porte ni jeton, ni adresse, ni rien hors des clés prévues", async () => {
    const texte = JSON.stringify(await (await appeler([releve("batchchef", 4)])).json());
    expect(texte).not.toMatch(/token|jeton|https?:|summary|@/i);
    expect(Object.keys(JSON.parse(texte)).sort()).toEqual(
      ["apps", "cumulCad", "dataAsOf", "devise", "mois", "ok", "periode", "tauxUsdCad"].sort(),
    );
  });

  it("rend la dépense du mois par app (cumul d'aujourd'hui moins cumul d'avant le 1er)", async () => {
    const avant = { ...releve("batchchef", 3), releveLe: Date.parse("2026-09-30T20:00:00Z") };
    const corps = await (await appeler([releve("batchchef", 4)], true, { avant: [avant], apres: [] })).json();
    expect(corps.mois).toMatchObject({
      debut: "2026-10-01T04:00:00.000Z",
      totalCad: 1,
      partiel: false,
      apps: [{ id: "batchchef", cad: 1, partiel: false }],
    });
    expect(corps.mois.nonLisibles).toContain("financeai");
  });

  it("garde le cumul et met `mois: null` quand les références du mois sont illisibles", async () => {
    const res = await appeler([releve("batchchef", 4)], true, null);
    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps.mois).toBeNull();
    expect(corps.cumulCad).toBe(4);
  });

  it("freine un client qui martèle (429 au-delà de 10 appels par minute)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ baseConfiguree: () => true }));
    vi.doMock("@/lib/migrations", () => ({ assurerMigrations: async () => {} }));
    vi.doMock("@/lib/historiqueDb", () => ({
      lireDerniersCouts: async () => [],
      lireReferencesMois: async () => ({ avant: [], apres: [] }),
    }));
    const { GET } = await import("../app/api/cout/route");
    const memeClient = () =>
      new Request("https://hubperso.com/api/cout", { headers: { "x-real-ip": "10.9.9.9" } });
    const statuts: number[] = [];
    for (let i = 0; i < 12; i++) statuts.push((await GET(memeClient())).status);
    expect(statuts.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuts.slice(10)).toEqual([429, 429]);
  });
});
