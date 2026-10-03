// tests/courbeCout.test.ts — la courbe de coût de la vue détaillée (H-09), sans base ni horloge.

import { describe, expect, it } from "vitest";
import { courbeCout, FENETRE_7J_MS } from "@/lib/courbeCout";
import type { CoutReleve, Releve } from "@/lib/historique";

const HEURE = 3_600_000;
const JOUR = 24 * HEURE;
const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);

function releve(decalageMs: number, cout: CoutReleve | null): Releve {
  return { appId: "driveai", releveLe: T0 + decalageMs, etat: "ok", dataAsOf: null, metriques: [], cout };
}
const c = (montant: number, periode: CoutReleve["periode"] = "mois", devise: CoutReleve["devise"] = "USD"): CoutReleve => ({
  montant,
  devise,
  periode,
});

describe("courbeCout", () => {
  it("rend null sous deux points : pas de ligne plate inventée", () => {
    expect(courbeCout([], "mois", "USD", T0)).toBeNull();
    expect(courbeCout([releve(0, c(5))], "mois", "USD", T0)).toBeNull();
  });

  it("ne mélange jamais deux périodes ni deux devises", () => {
    const releves = [
      releve(0, c(5, "mois")),
      releve(HEURE, c(900, "total")),
      releve(2 * HEURE, c(6, "mois")),
      releve(3 * HEURE, c(7, "mois", "CAD")),
    ];
    const courbe = courbeCout(releves, "mois", "USD", T0 + 3 * HEURE);
    expect(courbe?.points.map((p) => p.v)).toEqual([5, 6]);
    expect(courbe?.periode).toBe("mois");
    expect(courbe?.devise).toBe("USD");
  });

  it("donne min, max, premier et dernier montants", () => {
    const releves = [releve(0, c(4)), releve(HEURE, c(9)), releve(2 * HEURE, c(6))];
    const courbe = courbeCout(releves, "mois", "USD", T0 + 2 * HEURE);
    expect(courbe).toMatchObject({ min: 4, max: 9, premier: 4, dernier: 6 });
  });

  it("trace dans un viewBox 100x100 : y=0 en haut pour le max, 100 en bas pour le min", () => {
    const releves = [releve(0, c(0)), releve(HEURE, c(10))];
    const courbe = courbeCout(releves, "mois", "USD", T0 + HEURE)!;
    expect(courbe.trace).toBe("M0.00,100.00 L100.00,0.00");
  });

  it("trace une série constante à mi-hauteur sans diviser par zéro", () => {
    const releves = [releve(0, c(3)), releve(HEURE, c(3))];
    expect(courbeCout(releves, "mois", "USD", T0 + HEURE)!.trace).toBe("M0.00,50.00 L100.00,50.00");
  });

  it("calcule la variation sur 7 jours seulement avec 2 points dans la fenêtre", () => {
    const releves = [releve(-10 * JOUR, c(1)), releve(-2 * JOUR, c(4)), releve(0, c(10))];
    const courbe = courbeCout(releves, "mois", "USD", T0)!;
    expect(courbe.points).toHaveLength(3);
    expect(courbe.sur7j).toEqual({ debut: 4, fin: 10, delta: 6 });
    expect(FENETRE_7J_MS).toBe(7 * JOUR);
  });

  it("rend sur7j null si un seul point tombe dans les 7 derniers jours", () => {
    const releves = [releve(-10 * JOUR, c(1)), releve(-9 * JOUR, c(2)), releve(0, c(3))];
    expect(courbeCout(releves, "mois", "USD", T0)!.sur7j).toBeNull();
  });

  it("une baisse (changement de mois) est signalée telle quelle, delta négatif", () => {
    const releves = [releve(-2 * JOUR, c(40)), releve(0, c(2))];
    expect(courbeCout(releves, "mois", "USD", T0)!.sur7j?.delta).toBe(-38);
  });
});
