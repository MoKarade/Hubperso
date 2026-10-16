// tests/coutMois.test.ts — la dépense du mois ne ment jamais : une différence de cumuls, dite
// partielle quand il manque le point de départ, « non lisible » quand on ne peut pas la calculer.

import { describe, expect, it } from "vitest";
import type { Releve } from "../lib/historique";
import { debutDuMois, depenseDuMois } from "../lib/coutMois";
import { USD_TO_CAD } from "../lib/usage";

const T = (iso: string) => new Date(iso).getTime();
const DEBUT = T("2026-10-01T04:00:00Z");

function releve(appId: string, releveLe: string, montant: number, devise: "USD" | "CAD" = "CAD"): Releve {
  return {
    appId,
    releveLe: T(releveLe),
    etat: "ok",
    dataAsOf: null,
    metriques: [],
    cout: { montant, devise, periode: "total" },
  };
}

describe("debutDuMois", () => {
  it("rend minuit du 1er à l'heure de Marc (UTC−4 en octobre)", () => {
    expect(new Date(debutDuMois(T("2026-10-16T14:00:00Z"))).toISOString()).toBe("2026-10-01T04:00:00.000Z");
  });

  it("suit l'heure d'hiver (UTC−5 en novembre) et ne dérape pas au changement d'heure du 1er", () => {
    expect(new Date(debutDuMois(T("2026-11-20T12:00:00Z"))).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(new Date(debutDuMois(T("2026-12-05T12:00:00Z"))).toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });

  it("garde le mois de Marc quand il est déjà le mois suivant en UTC", () => {
    // 1er novembre 02:00 UTC = 31 octobre 22:00 à Québec : on est encore en octobre.
    expect(new Date(debutDuMois(T("2026-11-01T02:00:00Z"))).toISOString()).toBe("2026-10-01T04:00:00.000Z");
  });
});

describe("depenseDuMois", () => {
  const fin = releve("a", "2026-10-16T12:00:00Z", 15);

  it("rend cumul d'aujourd'hui moins dernier cumul d'avant le 1er", () => {
    const r = depenseDuMois(["a"], DEBUT, [fin], [releve("a", "2026-09-30T23:00:00Z", 10)], []);
    expect(r.apps).toEqual([{ id: "a", cad: 5, partiel: false }]);
    expect(r.totalCad).toBe(5);
    expect(r.partiel).toBe(false);
    expect(r.dernierReleve).toBe("2026-10-16T12:00:00.000Z");
  });

  it("part du premier relevé du mois, et le dit, quand rien n'existe avant le 1er", () => {
    const r = depenseDuMois(["a"], DEBUT, [fin], [], [releve("a", "2026-10-03T12:00:00Z", 12)]);
    expect(r.apps).toEqual([{ id: "a", cad: 3, partiel: true }]);
    expect(r.partiel).toBe(true);
  });

  it("convertit chaque terme en CAD un par un", () => {
    const r = depenseDuMois(
      ["a"],
      DEBUT,
      [releve("a", "2026-10-16T12:00:00Z", 12, "USD")],
      [releve("a", "2026-09-30T12:00:00Z", 10, "USD")],
      [],
    );
    expect(r.totalCad).toBe(Math.round(2 * USD_TO_CAD * 100) / 100);
  });

  it("compte « non lisible », jamais 0, sans relevé ce mois-ci, sans point de départ ou si le cumul recule", () => {
    const r = depenseDuMois(
      ["vieux", "seul", "recule", "absent"],
      DEBUT,
      [
        releve("vieux", "2026-09-29T12:00:00Z", 8), // dernier relevé avant le mois
        releve("seul", "2026-10-03T12:00:00Z", 4),
        releve("recule", "2026-10-16T12:00:00Z", 2),
      ],
      [releve("vieux", "2026-09-20T12:00:00Z", 5), releve("recule", "2026-09-30T12:00:00Z", 9)],
      [releve("seul", "2026-10-03T12:00:00Z", 4)], // le seul relevé du mois est la fin elle-même
    );
    expect(r.apps).toEqual([]);
    expect(r.nonLisibles.sort()).toEqual(["absent", "recule", "seul", "vieux"]);
    expect(r.totalCad).toBeNull();
    expect(r.dernierReleve).toBeNull();
  });

  it("ignore un coût qui n'est pas un cumul", () => {
    const mois: Releve = { ...fin, cout: { montant: 3, devise: "CAD", periode: "mois" } };
    const r = depenseDuMois(["a"], DEBUT, [mois], [releve("a", "2026-09-30T12:00:00Z", 1)], []);
    expect(r.nonLisibles).toEqual(["a"]);
  });
});
