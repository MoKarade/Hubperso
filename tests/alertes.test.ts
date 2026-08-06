// Bandeau d'alerte : quelle alerte est promue, et laquelle reste dans la liste.

import { describe, expect, it } from "vitest";
import type { HubAlert } from "@mokarade/hub-contract";
import { separerAlertes } from "../lib/alertes";

const a = (label: string, severity: HubAlert["severity"]): HubAlert => ({ label, severity });

describe("separerAlertes", () => {
  it("promeut la première alerte de sévérité `alert`", () => {
    const { bandeau, reste } = separerAlertes([
      a("coût en hausse", "warn"),
      a("bail dépassé", "alert"),
      a("info", "info"),
    ]);
    expect(bandeau?.label).toBe("bail dépassé");
    expect(reste.map((x) => x.label)).toEqual(["coût en hausse", "info"]);
  });

  it("ne promeut RIEN sans sévérité `alert` — pas de bandeau pour un simple warn", () => {
    // C'est le cœur de la décision : un bandeau permanent cesse d'être lu. `warn` et `info`
    // restent dans la liste, où ils sont visibles sans crier.
    const alerts = [a("coût en hausse", "warn"), a("note", "info")];
    const { bandeau, reste } = separerAlertes(alerts);
    expect(bandeau).toBeNull();
    expect(reste).toEqual(alerts);
  });

  it("ne répète JAMAIS l'alerte promue dans le reste", () => {
    // Sans ça, la carte afficherait deux fois la même phrase — le défaut le plus visible
    // qu'aurait pu avoir cette fonctionnalité.
    const { bandeau, reste } = separerAlertes([a("panne", "alert")]);
    expect(bandeau?.label).toBe("panne");
    expect(reste).toEqual([]);
  });

  it("n'en promeut qu'UNE même quand plusieurs sont critiques", () => {
    const { bandeau, reste } = separerAlertes([
      a("première", "alert"),
      a("seconde", "alert"),
    ]);
    expect(bandeau?.label).toBe("première");
    expect(reste.map((x) => x.label)).toEqual(["seconde"]);
  });

  it("supporte une liste vide", () => {
    expect(separerAlertes([])).toEqual({ bandeau: null, reste: [] });
  });

  it("ne dépend d'aucune app : seule la sévérité décide", () => {
    // Verrou du principe « générique par le contrat ». Deux alertes au texte radicalement
    // différent, même sévérité → même traitement.
    const x = separerAlertes([a("DriveAI : moteur muet", "alert")]);
    const y = separerAlertes([a("CarAI : batterie à 4 %", "alert")]);
    expect(x.bandeau?.severity).toBe(y.bandeau?.severity);
    expect(x.reste).toEqual(y.reste);
  });
});
