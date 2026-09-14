// tests/gel.test.ts — juger le retard d'une donnée, sans base, sans réseau, sans horloge.

import { describe, expect, it } from "vitest";
import type { HubSummary } from "@mokarade/hub-contract";
import {
  FACTEUR_TROU,
  TOLERANCE_AVANCE_MS,
  continuite,
  etatObservation,
  fraicheur,
  rythmeDonnee,
} from "@/lib/gel";
import type { Releve } from "@/lib/historique";

const SECONDE = 1000;
const MINUTE = 60 * SECONDE;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** T0 fixe : aucun test ne lit l'horloge. */
const T0 = Date.UTC(2026, 8, 14, 15, 0, 0);

function summary(extra: Partial<HubSummary> = {}): HubSummary {
  return {
    contractVersion: 1,
    app: { id: "carai", name: "CarAI", url: "https://carai.hubperso.com", color: "#db2777" },
    generatedAt: new Date(T0).toISOString(),
    status: "ok",
    metrics: [],
    alerts: [],
    actions: [],
    ...extra,
  };
}

function releve(releveLeDecalage: number, dataAsOf: number | null): Releve {
  return {
    appId: "carai",
    releveLe: T0 + releveLeDecalage,
    etat: "ok",
    dataAsOf,
    metriques: [],
    cout: null,
  };
}

describe("fraicheur — les cinq états, et pourquoi ils ne se confondent pas", () => {
  it("fraîche : l'âge est sous la limite déclarée par l'app", () => {
    const f = fraicheur(
      summary({ dataAsOf: new Date(T0 - 30 * MINUTE).toISOString(), expectedMaxAgeSec: 3600 }),
      T0,
    );
    expect(f).toEqual({ genre: "fraiche", ageMs: 30 * MINUTE, limiteMs: HEURE });
  });

  it("figée : l'âge dépasse la limite, et le DÉPASSEMENT est chiffré", () => {
    // C'est le cas mesuré sur CarAI le 14/09 : l'app répond parfaitement, sa donnée a
    // presque sept heures. Le retard est ce qui se dit à l'écran, pas l'âge brut.
    const f = fraicheur(
      summary({
        dataAsOf: new Date(T0 - (6 * HEURE + 53 * MINUTE)).toISOString(),
        expectedMaxAgeSec: 3600,
      }),
      T0,
    );
    expect(f).toEqual({
      genre: "figee",
      ageMs: 6 * HEURE + 53 * MINUTE,
      limiteMs: HEURE,
      retardMs: 5 * HEURE + 53 * MINUTE,
    });
  });

  it("la limite est une limite INCLUSIVE : pile à l'heure reste fraîche", () => {
    // Discriminant : un `<` au lieu d'un `<=` ferait clignoter « figée » à chaque fois que
    // l'âge tombe pile sur la limite, c'est-à-dire sans qu'aucun passage ait été perdu.
    const f = fraicheur(
      summary({ dataAsOf: new Date(T0 - HEURE).toISOString(), expectedMaxAgeSec: 3600 }),
      T0,
    );
    expect(f.genre).toBe("fraiche");
  });

  it("âge connu non jugé : dataAsOf publié, mais pas de seuil déclaré", () => {
    // L'état de TOUTES les apps avant leur re-pin sur la v1.3. Ce n'est ni « tout va bien »
    // ni une panne : le hub peut afficher l'âge et ne peut pas le juger.
    const f = fraicheur(summary({ dataAsOf: new Date(T0 - 3 * JOUR).toISOString() }), T0);
    expect(f).toEqual({ genre: "age-connu-non-juge", ageMs: 3 * JOUR });
  });

  it("non datée : aucun dataAsOf — le hub ne sait rien et le dit", () => {
    expect(fraicheur(summary(), T0)).toEqual({ genre: "non-datee" });
  });

  it("non datée aussi quand dataAsOf est illisible, plutôt qu'un NaN silencieux", () => {
    // Un summary reconstruit (cache, historique) peut porter une date cassée. Un NaN
    // rendrait toutes les comparaisons fausses SANS erreur : « je ne sais pas » est la
    // seule réponse honnête.
    const f = fraicheur(summary({ dataAsOf: "pas-une-date" as string }), T0);
    expect(f).toEqual({ genre: "non-datee" });
  });
});

describe("fraicheur — l'horloge de l'app en avance", () => {
  it("une dérive sous la tolérance est ignorée, et l'âge ne devient jamais négatif", () => {
    const f = fraicheur(
      summary({
        dataAsOf: new Date(T0 + 10 * SECONDE).toISOString(),
        expectedMaxAgeSec: 3600,
      }),
      T0,
    );
    // Deux horloges ne s'accordent pas à la seconde : 10 s d'avance n'est pas un défaut.
    expect(f).toEqual({ genre: "fraiche", ageMs: 0, limiteMs: HEURE });
  });

  it("au-delà de la tolérance, c'est signalé — c'est le contournement de toute détection", () => {
    // Une app dont l'horloge est en avance paraît ÉTERNELLEMENT fraîche. Sans cet état,
    // c'est le seul moyen connu d'échapper à la détection de gel sans rien d'anormal.
    const f = fraicheur(
      summary({ dataAsOf: new Date(T0 + 3 * HEURE).toISOString(), expectedMaxAgeSec: 3600 }),
      T0,
    );
    expect(f).toEqual({ genre: "horloge-en-avance", avanceMs: 3 * HEURE });
  });

  it("le signale même sans seuil déclaré : le problème est la date, pas le jugement", () => {
    const f = fraicheur(summary({ dataAsOf: new Date(T0 + 3 * HEURE).toISOString() }), T0);
    expect(f.genre).toBe("horloge-en-avance");
  });

  it("la tolérance est bien celle qui est exportée", () => {
    const juste = fraicheur(
      summary({ dataAsOf: new Date(T0 + TOLERANCE_AVANCE_MS).toISOString() }),
      T0,
    );
    const auDela = fraicheur(
      summary({ dataAsOf: new Date(T0 + TOLERANCE_AVANCE_MS + SECONDE).toISOString() }),
      T0,
    );
    expect(juste.genre).not.toBe("horloge-en-avance");
    expect(auDela.genre).toBe("horloge-en-avance");
  });
});

describe("rythmeDonnee — le rythme RÉEL de la donnée neuve", () => {
  it("compte les instants de mesure DISTINCTS, pas les relevés", () => {
    // Le cœur de la fonction. Le hub relève toutes les 15 min et peut recevoir dix fois le
    // même instantané : compter les relevés mesurerait sa propre cadence, pas celle de
    // l'app. C'est cette distinction qui rend un poll mort visible.
    const releves = [
      releve(-60 * MINUTE, T0 - 60 * MINUTE),
      releve(-45 * MINUTE, T0 - 60 * MINUTE),
      releve(-30 * MINUTE, T0 - 60 * MINUTE),
      releve(-15 * MINUTE, T0 - 10 * MINUTE),
    ];
    const r = rythmeDonnee(releves, JOUR, T0);
    expect(r.mesures).toBe(2);
    expect(r.ecartMaxMs).toBe(50 * MINUTE);
  });

  it("le médian dit le rythme habituel, le max dit le pire silence", () => {
    // Un poll régulier aux 30 min qui a lâché une fois pendant 7 h. La moyenne (≈ 2 h 15)
    // ne décrirait ni le rythme ni l'accident ; les deux nombres, si.
    const instants = [0, 30, 60, 90, 90 + 7 * 60, 90 + 7 * 60 + 30].map(
      (min) => T0 - JOUR + min * MINUTE,
    );
    const r = rythmeDonnee(
      instants.map((t, i) => releve(-JOUR + i * MINUTE, t)),
      2 * JOUR,
      T0,
    );
    expect(r.mesures).toBe(6);
    expect(r.ecartMedianMs).toBe(30 * MINUTE);
    expect(r.ecartMaxMs).toBe(7 * HEURE);
  });

  it("une seule mesure ⇒ aucun écart, et null plutôt que 0", () => {
    // `0` affirmerait « aucun délai entre deux mesures ». Il n'y a pas deux mesures.
    const r = rythmeDonnee([releve(-10 * MINUTE, T0 - 10 * MINUTE)], JOUR, T0);
    expect(r).toEqual({ mesures: 1, ecartMedianMs: null, ecartMaxMs: null });
  });

  it("ignore les relevés sans dataAsOf et ceux hors de la fenêtre", () => {
    const releves = [
      releve(-3 * JOUR, T0 - 3 * JOUR), // hors fenêtre
      releve(-2 * HEURE, null), // pas de dataAsOf
      releve(-HEURE, T0 - HEURE),
      releve(-30 * MINUTE, T0 - 30 * MINUTE),
    ];
    expect(rythmeDonnee(releves, JOUR, T0).mesures).toBe(2);
  });
});

describe("continuite — les trous dans l'observation du hub lui-même", () => {
  const CADENCE = 30 * MINUTE;

  it("compte les relevés, le pire écart et les passages perdus", () => {
    const releves = [
      releve(-4 * HEURE, null),
      releve(-3.5 * HEURE, null),
      releve(-3 * HEURE, null),
      releve(-3 * HEURE + 6 * HEURE + 53 * MINUTE, null), // le trou de 6 h 53
    ];
    const c = continuite(releves, CADENCE, 2 * JOUR, T0 + 5 * HEURE);
    expect(c.releves).toBe(4);
    expect(c.ecartMaxMs).toBe(6 * HEURE + 53 * MINUTE);
    expect(c.trous).toBe(1);
  });

  it("un petit retard n'est PAS un trou", () => {
    // Discriminant : avec un facteur de 1, chaque passage arrivé cinq minutes en retard
    // deviendrait un trou, la liste serait toujours pleine et ne se lirait plus.
    const releves = [releve(0, null), releve(CADENCE + 5 * MINUTE, null)];
    expect(continuite(releves, CADENCE, JOUR, T0 + HEURE).trous).toBe(0);
  });

  it("le seuil est bien FACTEUR_TROU × la cadence, strictement au-dessus", () => {
    const pile = [releve(0, null), releve(CADENCE * FACTEUR_TROU, null)];
    const auDela = [releve(0, null), releve(CADENCE * FACTEUR_TROU + SECONDE, null)];
    expect(continuite(pile, CADENCE, JOUR, T0 + 5 * HEURE).trous).toBe(0);
    expect(continuite(auDela, CADENCE, JOUR, T0 + 5 * HEURE).trous).toBe(1);
  });

  it("moins de deux relevés ⇒ aucun écart mesurable, et null plutôt que 0", () => {
    expect(continuite([releve(0, null)], CADENCE, JOUR, T0 + MINUTE)).toEqual({
      releves: 1,
      ecartMaxMs: null,
      trous: 0,
    });
    expect(continuite([], CADENCE, JOUR, T0)).toEqual({
      releves: 0,
      ecartMaxMs: null,
      trous: 0,
    });
  });

  it("n'est pas sensible à l'ordre d'arrivée des relevés", () => {
    const desordre = [releve(4 * HEURE, null), releve(0, null), releve(2 * HEURE, null)];
    const c = continuite(desordre, CADENCE, JOUR, T0 + 5 * HEURE);
    // Deux écarts de 2 h, chacun bien au-delà du seuil (2 × 30 min) : deux trous, et le
    // pire écart est 2 h — pas 4 h, qui serait la distance entre le premier et le dernier
    // si l'ordre d'arrivée était pris pour l'ordre chronologique.
    expect(c.ecartMaxMs).toBe(2 * HEURE);
    expect(c.trous).toBe(2);
  });
});

describe("etatObservation", () => {
  it("dit « sans base » quand la base manque, MÊME si des relevés étaient comptés", () => {
    // Le cas qui compte : c'est l'ordre des deux tests dans la fonction qui est éprouvé ici,
    // pas le résultat évident. Sans base, `totalReleves` vaut 0 en pratique — mais si le
    // jugement de l'horloge passait d'abord, il gagnerait dans tous les cas réels et la
    // panne serait TOUJOURS attribuée à l'horloge. Un total non nul et volontairement
    // incohérent est le seul moyen de faire échouer une fonction qui inverserait l'ordre.
    expect(etatObservation(false, 0)).toBe("sans-base");
    expect(etatObservation(false, 42)).toBe("sans-base");
  });

  it("dit « horloge muette » quand la base est là et que rien n'a été enregistré", () => {
    expect(etatObservation(true, 0)).toBe("horloge-muette");
  });

  it("dit « observé » dès un seul relevé", () => {
    expect(etatObservation(true, 1)).toBe("observe");
    expect(etatObservation(true, 336)).toBe("observe");
  });

  it("traite un total négatif comme une absence d'observation, jamais comme une observation", () => {
    // Un compteur négatif ne devrait pas exister ; s'il apparaît (soustraction fautive en
    // amont), il ne doit surtout pas franchir la porte en se faisant passer pour des données
    // réelles. `<= 0` et non `=== 0` : c'est la différence entre un garde et une égalité.
    expect(etatObservation(true, -1)).toBe("horloge-muette");
  });
});
