// tests/bilanEtat.test.ts — le bilan d'état des apps, tiré des relevés. Pur : T0 fixe, aucune horloge.
//
// Ce qu'on éprouve : une app sans relevé est dite sans historique (jamais « sans coupure »), une durée
// est un minimum, un trou du hub ne prolonge pas une panne, un refus n'est pas une coupure, l'heure
// habituelle exige deux coupures, et le texte reste borné et ne contient rien d'autre que du daté.

import { describe, expect, it } from "vitest";
import type { Releve } from "@/lib/historique";
import { bilanApp, CONTEXTE_MAX, FENETRE_BILAN_MS, texteBilans } from "@/lib/bilanEtat";

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;
// Jeudi 22 octobre 2026, 20 h 00 au Québec (UTC−4).
const T0 = Date.UTC(2026, 9, 23, 0, 0, 0);

function releve(avantMs: number, etat: string, appId = "driveai"): Releve {
  return { appId, releveLe: T0 - avantMs, etat, dataAsOf: null, metriques: [], cout: null };
}

/** Un relevé tous les 15 minutes, du plus ancien (`depart`) au plus récent, avec l'état de chacun. */
function serie(etats: string[], departAvantMs: number): Releve[] {
  return etats.map((e, i) => releve(departAvantMs - i * 15 * MINUTE, e));
}

describe("bilanApp", () => {
  it("sans relevé : sans historique, jamais « aucune coupure »", () => {
    const b = bilanApp("driveai", "DriveAI", [], T0);
    expect(b).toMatchObject({ nbReleves: 0, depuisMs: null, coupures: [], disponibilitePct: null, heureHabituelle: null });
    expect(texteBilans([b], T0)).toContain("DriveAI : sans historique (aucun relevé lu).");
    expect(texteBilans([b], T0)).not.toContain("aucune coupure");
  });

  it("ne lit que la fenêtre d'une semaine, dans n'importe quel ordre", () => {
    const b = bilanApp("driveai", "DriveAI", [releve(8 * JOUR, "unreachable"), releve(HEURE, "ok"), releve(30 * MINUTE, "ok")], T0);
    expect(b.nbReleves).toBe(2);
    expect(b.coupures).toEqual([]);
    expect(b.disponibilitePct).toBe(100);
    expect(FENETRE_BILAN_MS).toBe(7 * JOUR);
  });

  it("une coupure : début, dernier relevé en échec, retour observé, durée au moins la distance mesurée", () => {
    const rs = serie(["ok", "unreachable", "unreachable", "ok", "ok"], 2 * HEURE);
    const b = bilanApp("driveai", "DriveAI", rs, T0);
    expect(b.coupures).toHaveLength(1);
    const [c] = b.coupures;
    expect(c).toEqual({ debutMs: T0 - 2 * HEURE + 15 * MINUTE, dernierMs: T0 - 2 * HEURE + 30 * MINUTE, finMs: T0 - 2 * HEURE + 45 * MINUTE, enCours: false });
    expect(b.disponibilitePct).toBe(60);
    expect(texteBilans([b], T0)).toContain("1 coupure");
    expect(texteBilans([b], T0)).toContain("au moins 30 min, revenue ensuite");
  });

  it("une coupure qui touche le dernier relevé récent est en cours ; trop ancienne, le retour n'est pas observé", () => {
    const recent = bilanApp("driveai", "DriveAI", serie(["ok", "unreachable"], 30 * MINUTE), T0);
    expect(recent.coupures[0]?.enCours).toBe(true);
    const ancien = bilanApp("driveai", "DriveAI", serie(["ok", "unreachable"], 5 * HEURE), T0);
    expect(ancien.coupures[0]).toMatchObject({ finMs: null, enCours: false });
    expect(texteBilans([ancien], T0)).toContain("retour non observé");
  });

  it("un trou du hub (plus de trois intervalles) coupe la série en deux coupures", () => {
    const rs = [releve(5 * HEURE, "unreachable"), releve(5 * HEURE - 15 * MINUTE, "unreachable"), releve(2 * HEURE, "unreachable")];
    const b = bilanApp("driveai", "DriveAI", rs, T0);
    expect(b.coupures).toHaveLength(2);
  });

  it("un refus (jeton) n'est pas une coupure : compté à part, hors de la disponibilité", () => {
    const b = bilanApp("driveai", "DriveAI", serie(["ok", "unauthorized", "unconfigured", "ok"], HEURE), T0);
    expect(b.coupures).toEqual([]);
    expect(b.refus).toBe(2);
    expect(b.disponibilitePct).toBe(50);
    expect(texteBilans([b], T0)).toContain("2 relevés où le hub n'a pas pu entrer");
  });

  it("invalid et contract-too-new comptent comme coupure (le hub n'a rien pu lire d'utile)", () => {
    const b = bilanApp("driveai", "DriveAI", serie(["ok", "invalid", "contract-too-new", "ok"], HEURE), T0);
    expect(b.coupures).toHaveLength(1);
  });

  it("l'heure habituelle (Québec) exige deux coupures à la même heure", () => {
    // Deux coupures à 14 h 00 (Québec = 18 h UTC) à deux jours d'écart.
    const jour = (n: number) => Date.UTC(2026, 9, 22 - n, 18, 0, 0);
    const mk = (t: number, etat: string): Releve => ({ appId: "driveai", releveLe: t, etat, dataAsOf: null, metriques: [], cout: null });
    const deux = [mk(jour(0), "unreachable"), mk(jour(0) + 15 * MINUTE, "ok"), mk(jour(2), "unreachable"), mk(jour(2) + 15 * MINUTE, "ok")];
    expect(bilanApp("driveai", "DriveAI", deux, T0).heureHabituelle).toBe(14);
    const une = [mk(jour(0), "unreachable"), mk(jour(0) + 15 * MINUTE, "ok"), mk(jour(2) + 3 * HEURE, "unreachable"), mk(jour(2) + 4 * HEURE, "ok")];
    expect(bilanApp("driveai", "DriveAI", une, T0).heureHabituelle).toBeNull();
  });
});

describe("texteBilans", () => {
  it("est daté à l'heure du Québec et dit que les durées sont des minimums", () => {
    const t = texteBilans([bilanApp("driveai", "DriveAI", serie(["ok"], HEURE), T0)], T0);
    expect(t).toContain("jeudi 22 octobre à 20 h 00");
    expect(t).toContain("les durées sont des minimums");
    expect(t).toContain("aucune coupure");
  });

  it("reste sous la borne : les dernières lignes tombent et la coupe est dite", () => {
    const longues = Array.from({ length: 40 }, (_, i) => bilanApp(`app${i}`, `Application numéro ${i}`, serie(["ok", "unreachable", "ok"], HEURE), T0));
    const t = texteBilans(longues, T0);
    expect(t.length).toBeLessThanOrEqual(CONTEXTE_MAX);
    expect(t).toContain("Bilan tronqué");
  });
});
