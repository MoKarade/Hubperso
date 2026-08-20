// tests/historique.test.ts — la mémoire du hub, testée sans base, sans réseau, sans horloge.

import { describe, expect, it } from "vitest";
import type { HubMetric } from "@mokarade/hub-contract";
import {
  figeDepuisMs,
  inchangeDepuisMs,
  serieCout,
  serieMetrique,
  variation,
  type Releve,
} from "@/lib/historique";

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** T0 fixe : aucun test ne lit l'horloge (cf. la règle des fonctions pures du CLAUDE.md). */
const T0 = Date.UTC(2026, 7, 20, 12, 0, 0);

function releve(decalageMs: number, metriques: HubMetric[], extra: Partial<Releve> = {}): Releve {
  return {
    appId: "driveai",
    releveLe: T0 + decalageMs,
    etat: "ok",
    dataAsOf: null,
    metriques,
    cout: null,
    ...extra,
  };
}

function m(label: string, value: number | string): HubMetric {
  return { label, value, format: typeof value === "number" ? "number" : "text" };
}

describe("serieMetrique", () => {
  it("rend les points dans l'ordre chronologique, quelle que soit l'entrée", () => {
    const serie = serieMetrique(
      [releve(2 * HEURE, [m("Docs", 30)]), releve(0, [m("Docs", 10)]), releve(HEURE, [m("Docs", 20)])],
      "Docs",
    );
    expect(serie.map((p) => p.v)).toEqual([10, 20, 30]);
  });

  it("ÉCARTE les valeurs non numériques au lieu de les convertir", () => {
    // `Number("3 en attente")` vaut NaN, et un NaN contamine toute somme qui le touche.
    // Mutation : remplacer le filtre par `Number(value)` fait tomber ce test.
    const serie = serieMetrique(
      [releve(0, [m("État", "en pause")]), releve(HEURE, [m("État", 4)])],
      "État",
    );
    expect(serie).toEqual([{ t: T0 + HEURE, v: 4 }]);
  });

  it("laisse un TROU quand l'app était injoignable — on ne relie pas par-dessus une panne", () => {
    const serie = serieMetrique(
      [releve(0, [m("Docs", 10)]), releve(HEURE, [], { etat: "unreachable" }), releve(2 * HEURE, [m("Docs", 12)])],
      "Docs",
    );
    expect(serie).toHaveLength(2);
  });

  it("ignore une métrique absente et une infinie", () => {
    expect(serieMetrique([releve(0, [m("Autre", 1)])], "Docs")).toEqual([]);
    expect(serieMetrique([releve(0, [m("Docs", Number.POSITIVE_INFINITY)])], "Docs")).toEqual([]);
  });
});

describe("variation", () => {
  it("compare le plus récent au plus ancien DANS la fenêtre", () => {
    const v = variation(
      [releve(-2 * JOUR, [m("Coût", 5)]), releve(-2 * HEURE, [m("Coût", 10)]), releve(0, [m("Coût", 13)])],
      "Coût",
      JOUR,
      T0,
    );
    // Le point à -2 jours est HORS fenêtre : la variation part de 10, pas de 5.
    expect(v).toMatchObject({ deltaAbsolu: 3 });
    expect(v!.deltaRelatif).toBeCloseTo(0.3);
  });

  it("rend null avec un seul point — « n'a pas bougé » ≠ « je ne sais pas encore »", () => {
    expect(variation([releve(0, [m("Coût", 10)])], "Coût", JOUR, T0)).toBeNull();
  });

  it("rend null en RELATIF quand le départ est 0, sans casser l'absolu", () => {
    const v = variation([releve(-HEURE, [m("Coût", 0)]), releve(0, [m("Coût", 4)])], "Coût", JOUR, T0);
    expect(v!.deltaAbsolu).toBe(4);
    expect(v!.deltaRelatif).toBeNull();
  });
});

describe("inchangeDepuisMs — la question que le hub ne savait pas poser", () => {
  it("mesure depuis le plus ancien relevé portant la MÊME valeur", () => {
    // Le cas réel : une campagne figée à 322 documents pendant que le widget dit « en pause ».
    const releves = [
      releve(-14 * JOUR, [m("Traités", 322)]),
      releve(-7 * JOUR, [m("Traités", 322)]),
      releve(0, [m("Traités", 322)]),
    ];
    expect(inchangeDepuisMs(releves, "Traités", T0)).toBe(14 * JOUR);
  });

  it("s'arrête au changement : une hausse récente n'est pas un gel ancien", () => {
    const releves = [
      releve(-14 * JOUR, [m("Traités", 300)]),
      releve(-2 * JOUR, [m("Traités", 322)]),
      releve(0, [m("Traités", 322)]),
    ];
    expect(inchangeDepuisMs(releves, "Traités", T0)).toBe(2 * JOUR);
  });

  it("rend null quand la valeur vient de changer — et non 0", () => {
    // 0 affirmerait « figée depuis zéro » ; la vérité est qu'il n'y a pas de gel du tout.
    const releves = [releve(-JOUR, [m("Traités", 300)]), releve(0, [m("Traités", 322)])];
    expect(inchangeDepuisMs(releves, "Traités", T0)).toBeNull();
  });

  it("rend null avec un seul relevé", () => {
    expect(inchangeDepuisMs([releve(0, [m("Traités", 322)])], "Traités", T0)).toBeNull();
  });

  it("voit aussi une métrique TEXTUELLE figée", () => {
    // « en pause » affiché depuis deux semaines est exactement ce qu'on cherche à montrer.
    const releves = [releve(-14 * JOUR, [m("État", "en pause")]), releve(0, [m("État", "en pause")])];
    expect(inchangeDepuisMs(releves, "État", T0)).toBe(14 * JOUR);
  });
});

describe("serieCout — jamais deux périodes sur une courbe", () => {
  const releves = [
    releve(-2 * JOUR, [], { cout: { montant: 10, devise: "USD", periode: "total" } }),
    releve(-JOUR, [], { cout: { montant: 3, devise: "USD", periode: "mois" } }),
    releve(0, [], { cout: { montant: 12, devise: "USD", periode: "total" } }),
  ];

  it("ne retient que la période demandée", () => {
    // Mutation : retirer le filtre de période donne [10, 3, 12] — une courbe qui CHUTE
    // alors que rien n'a baissé. C'est exactement le graphe malhonnête qu'on refuse.
    expect(serieCout(releves, "total", "USD").map((p) => p.v)).toEqual([10, 12]);
    expect(serieCout(releves, "mois", "USD").map((p) => p.v)).toEqual([3]);
  });

  it("ne mélange pas non plus deux devises", () => {
    expect(serieCout(releves, "total", "CAD")).toEqual([]);
  });
});

describe("figeDepuisMs — se lit sur dataAsOf, pas sur l'heure du hub", () => {
  it("mesure l'âge de la DONNÉE, même si l'app répond à l'instant", () => {
    // Une app peut répondre toutes les 15 s en resservant un instantané vieux d'une semaine.
    const releves = [releve(0, [], { dataAsOf: T0 - 7 * JOUR })];
    expect(figeDepuisMs(releves, T0)).toBe(7 * JOUR);
  });

  it("rend null si l'app ne publie pas dataAsOf — le hub ne SAIT pas, il le dit", () => {
    expect(figeDepuisMs([releve(0, [m("Docs", 1)])], T0)).toBeNull();
  });
});
