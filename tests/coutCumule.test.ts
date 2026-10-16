// tests/coutCumule.test.ts — le cumulé ne ment jamais : pas de 0 faute de mesure, pas de
// fusion de périodes, la date de la mesure la plus vieille.

import { describe, expect, it } from "vitest";
import type { Releve } from "../lib/historique";
import { cumulerCouts } from "../lib/coutCumule";
import { USD_TO_CAD } from "../lib/usage";

const T = (iso: string) => new Date(iso).getTime();

function releve(over: Partial<Releve> & Pick<Releve, "appId">): Releve {
  return {
    releveLe: T("2026-10-16T12:00:00Z"),
    etat: "ok",
    dataAsOf: null,
    metriques: [],
    cout: { montant: 10, devise: "CAD", periode: "total" },
    ...over,
  };
}

describe("cumulerCouts", () => {
  it("additionne les coûts de période « total », USD convertis en CAD", () => {
    const r = cumulerCouts(
      ["a", "b"],
      [
        releve({ appId: "a", cout: { montant: 10, devise: "USD", periode: "total" } }),
        releve({ appId: "b", cout: { montant: 2.5, devise: "CAD", periode: "total" } }),
      ],
    );
    expect(r.cumulCad).toBe(Math.round((10 * USD_TO_CAD + 2.5) * 100) / 100);
    expect(r.apps).toEqual({ lues: 2, nonLisibles: [] });
    expect(r.periode).toBe("total");
    expect(r.tauxUsdCad).toBe(USD_TO_CAD);
  });

  it("ne rend jamais 0 faute de mesure : aucune app lisible → null", () => {
    const r = cumulerCouts(["a", "b"], []);
    expect(r.cumulCad).toBeNull();
    expect(r.dataAsOf).toBeNull();
    expect(r.apps).toEqual({ lues: 0, nonLisibles: ["a", "b"] });
  });

  it("compte « non lisible » une app sans coût, jamais comme 0", () => {
    const r = cumulerCouts(["a", "b"], [releve({ appId: "a" })]);
    expect(r.cumulCad).toBe(10);
    expect(r.apps.nonLisibles).toEqual(["b"]);
  });

  it("ne fusionne pas les périodes : un coût « mois » n'entre pas dans le cumulé", () => {
    const r = cumulerCouts(
      ["a", "drive"],
      [
        releve({ appId: "a" }),
        releve({ appId: "drive", cout: { montant: 99, devise: "CAD", periode: "mois" } }),
      ],
    );
    expect(r.cumulCad).toBe(10);
    expect(r.apps).toEqual({ lues: 1, nonLisibles: ["drive"] });
  });

  it("écarte un montant négatif ou non numérique plutôt que de le sommer", () => {
    const r = cumulerCouts(
      ["a", "b"],
      [
        releve({ appId: "a", cout: { montant: -3, devise: "CAD", periode: "total" } }),
        releve({ appId: "b", cout: { montant: Number.NaN, devise: "CAD", periode: "total" } }),
      ],
    );
    expect(r.cumulCad).toBeNull();
    expect(r.apps.nonLisibles).toEqual(["a", "b"]);
  });

  it("date le total par sa mesure la plus ANCIENNE, `dataAsOf` avant l'heure du relevé", () => {
    const r = cumulerCouts(
      ["a", "b", "c"],
      [
        releve({ appId: "a", dataAsOf: T("2026-10-16T11:00:00Z") }),
        releve({ appId: "b", dataAsOf: null, releveLe: T("2026-10-16T09:30:00Z") }),
        releve({ appId: "c", dataAsOf: T("2026-10-16T11:59:00Z") }),
      ],
    );
    expect(r.dataAsOf).toBe("2026-10-16T09:30:00.000Z");
  });

  it("ignore un relevé d'une app qui n'est plus au hub", () => {
    const r = cumulerCouts(["a"], [releve({ appId: "a" }), releve({ appId: "fantome" })]);
    expect(r.cumulCad).toBe(10);
    expect(r.apps.lues).toBe(1);
  });
});
