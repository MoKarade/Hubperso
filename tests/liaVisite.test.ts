// tests/liaVisite.test.ts — LIA va voir la carte et parle, même quand elle ne peut pas bouger
// (constat de production du 23/10/2026 : « Analyser », la page défile, LIA muette).

import { describe, expect, it, vi } from "vitest";
import { DELAI_ARRIVEE_MS, SECONDES_PRES_DE_LA_CARTE, visiterCarte, type Planifier } from "@/lib/liaVisite";

const carte = {} as Element;

function lia(peutBouger: boolean) {
  return {
    allerVoir: vi.fn(() => peutBouger),
    dire: vi.fn(() => true),
  };
}

/** Une minuterie à la main : on exécute l'action tout de suite et on note le délai demandé. */
function minuterie() {
  const delais: number[] = [];
  const planifier: Planifier = (action, delai) => {
    delais.push(delai);
    action();
  };
  return { planifier, delais };
}

describe("visiterCarte", () => {
  it("elle peut bouger : elle va près de la carte, puis parle après le temps d'arriver", () => {
    const l = lia(true);
    const m = minuterie();
    expect(visiterCarte(l, carte, "CarAI signale une alerte.", m.planifier)).toBe(true);
    expect(l.allerVoir).toHaveBeenCalledWith(carte, SECONDES_PRES_DE_LA_CARTE);
    expect(m.delais).toEqual([DELAI_ARRIVEE_MS]);
    expect(l.dire).toHaveBeenCalledWith("CarAI signale une alerte.");
  });

  it("elle ne peut pas bouger (mouvement réduit, chat ouvert) : elle parle quand même, aussitôt", () => {
    const l = lia(false);
    const m = minuterie();
    expect(visiterCarte(l, carte, "CarAI signale une alerte.", m.planifier)).toBe(false);
    expect(m.delais).toEqual([0]);
    expect(l.dire).toHaveBeenCalledTimes(1);
    expect(l.dire).toHaveBeenCalledWith("CarAI signale une alerte.");
  });

  it("ne parle pas avant que la minuterie ne l'ait décidé", () => {
    const l = lia(true);
    visiterCarte(l, carte, "x", () => {});
    expect(l.allerVoir).toHaveBeenCalledTimes(1);
    expect(l.dire).not.toHaveBeenCalled();
  });
});
