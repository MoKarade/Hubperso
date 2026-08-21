// tests/palette.test.ts — la palette de commandes, sans rendu ni clavier.

import { describe, expect, it } from "vitest";
import { commandes, filtrer, normaliserRecherche } from "@/lib/palette";

const APPS = [
  { id: "driveai", nom: "DriveAI", url: "https://drive.hubperso.com" },
  { id: "carai", nom: "CarAI", url: null },
];

describe("normaliserRecherche", () => {
  it("retire les accents — personne ne tape « coûts » avec l'accent", () => {
    // Mutation : comparer sans normaliser fait qu'« couts » ne trouve jamais « Coûts »,
    // et la palette passe pour cassée alors qu'elle marche.
    expect(normaliserRecherche("Coûts & quotas")).toBe("couts quotas");
    expect(normaliserRecherche("Accès")).toBe("acces");
  });

  it("écrase casse et ponctuation", () => {
    expect(normaliserRecherche("  DriveAI — Détail  ")).toBe("driveai detail");
  });
});

describe("filtrer", () => {
  const liste = commandes(APPS);

  it("trouve malgré l'accent manquant", () => {
    expect(filtrer(liste, "couts").map((c) => c.id)).toEqual(["page-couts"]);
  });

  it("accepte les mots DANS N'IMPORTE QUEL ORDRE", () => {
    // Un filtre par sous-chaîne de la requête entière obligerait à taper dans l'ordre
    // affiché, ce que personne ne fait.
    const a = filtrer(liste, "drive ouvrir").map((c) => c.id);
    const b = filtrer(liste, "ouvrir drive").map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).toContain("ouvrir-driveai");
  });

  it("cherche aussi dans le CONTEXTE, pas seulement le libellé", () => {
    expect(filtrer(liste, "detail hub").length).toBeGreaterThan(0);
  });

  it("une requête vide rend TOUT — la palette montre ce qu'elle sait faire", () => {
    expect(filtrer(liste, "")).toHaveLength(liste.length);
    expect(filtrer(liste, "   ")).toHaveLength(liste.length);
  });

  it("rend une liste vide quand rien ne correspond, sans jeter", () => {
    expect(filtrer(liste, "zzzzz")).toEqual([]);
  });
});

describe("commandes", () => {
  it("met les pages du hub avant les apps", () => {
    expect(commandes(APPS)[0]!.genre).toBe("page");
  });

  it("n'ajoute PAS d'entrée « Ouvrir » quand l'app ne publie pas d'URL utilisable", () => {
    // `safeHttpUrl` a filtré en amont : une URL refusée arrive ici en `null`, et on ne
    // fabrique pas un lien vers rien.
    const ids = commandes(APPS).map((c) => c.id);
    expect(ids).toContain("ouvrir-driveai");
    expect(ids).not.toContain("ouvrir-carai");
  });

  it("ne propose AUCUNE action de mutation", () => {
    // Décision, pas oubli : une palette est faite pour taper vite et valider sans relire.
    // Une action `trigger` déclenchée par un Entrée réflexe n'a rien à y faire — le champ
    // `confirm` du contrat existe justement pour imposer un temps d'arrêt.
    expect(commandes(APPS).every((c) => c.genre !== ("trigger" as never))).toBe(true);
  });
});
