// tests/carteDetail.test.ts — les calculs de la page de détail (/app/[id]), testés sans rendu.
// Ces fonctions étaient écrites en ligne dans le JSX de la page ; les phrases attendues
// ci-dessous sont celles que la page affichait AVANT le découpage (refactor sans changement).

import { describe, expect, it } from "vitest";
import {
  FENETRE_VARIATION_MS,
  SEUIL_INCHANGE_MS,
  barreQuota,
  inchangeSignificatif,
  libelleQuota,
  lienRecoRefuse,
  messageProblemeDetail,
  noteEvolutionDetail,
  recommandation,
  variablesAccent,
} from "@/lib/carte";
import type { Releve, Variation } from "@/lib/historique";
import { hubSource, validSummary } from "./helpers";

const source = hubSource();

describe("messageProblemeDetail — une phrase par état d'échec, jamais une page vide", () => {
  it("nomme ce qui manque quand l'app n'est pas branchée", () => {
    expect(
      messageProblemeDetail({
        state: "unconfigured",
        source,
        manque: ["url", "jeton"],
      }),
    ).toBe(
      "Non branchée dans l’environnement du hub — aucune URL de résumé configurée et aucun jeton x-hub-token configuré.",
    );
  });

  it("dit que le jeton est refusé (401)", () => {
    expect(messageProblemeDetail({ state: "unauthorized", source })).toBe(
      "Jeton refusé (401). La valeur ne correspond pas à celle de l’app.",
    );
  });

  it("reprend le détail d'une app injoignable ou hors contrat", () => {
    expect(
      messageProblemeDetail({
        state: "unreachable",
        source,
        detail: "l’app a répondu avec une erreur",
      }),
    ).toBe("App injoignable — l’app a répondu avec une erreur.");
    expect(
      messageProblemeDetail({
        state: "invalid",
        source,
        detail: "champ manquant",
      }),
    ).toBe("Réponse non conforme au contrat — champ manquant.");
  });

  it("dit que c'est le HUB qui est en retard quand le contrat est trop récent", () => {
    expect(
      messageProblemeDetail({
        state: "contract-too-new",
        source,
        published: 2,
        supported: 1,
      }),
    ).toBe(
      "L’app publie la version 2 du contrat ; ce hub lit jusqu’à la 1. Le hub doit être mis à jour pour lire cette app — l’app va bien.",
    );
  });

  it("ne dit rien quand le résumé est là", () => {
    expect(
      messageProblemeDetail({ state: "ok", source, summary: validSummary() }),
    ).toBe("");
  });
});

describe("noteEvolutionDetail — l'évolution sur la fenêtre de comparaison", () => {
  const fenetre = "7 j";
  const v = (deltaAbsolu: number, deltaRelatif: number | null): Variation => ({
    avant: { t: 0, v: 0 },
    apres: { t: FENETRE_VARIATION_MS, v: deltaAbsolu },
    deltaAbsolu,
    deltaRelatif,
  });

  it("parle en pourcentage quand la valeur de départ n'est pas nulle", () => {
    expect(noteEvolutionDetail(v(5, 0.125))).toEqual({
      texte: `+12,5 % sur ${fenetre}`,
      dir: "up",
    });
    expect(noteEvolutionDetail(v(-5, -0.5))).toEqual({
      texte: `−50 % sur ${fenetre}`,
      dir: "down",
    });
  });

  it("donne l'écart brut, signé, quand le départ est à zéro", () => {
    expect(noteEvolutionDetail(v(3, null))).toEqual({
      texte: `+3 sur ${fenetre}`,
      dir: "up",
    });
    expect(noteEvolutionDetail(v(-3, null))).toEqual({
      texte: `-3 sur ${fenetre}`,
      dir: "down",
    });
  });

  it("une valeur stable compte comme « up » (même règle qu'avant le découpage)", () => {
    expect(noteEvolutionDetail(v(0, 0)).dir).toBe("up");
  });
});

describe("inchangeSignificatif — « inchangé depuis » seulement au-delà du seuil", () => {
  const T0 = Date.UTC(2026, 8, 1, 12);
  const releve = (decalageMs: number, valeur: number): Releve => ({
    appId: "financeai",
    releveLe: T0 + decalageMs,
    etat: "ok",
    dataAsOf: null,
    metriques: [{ label: "Valeur nette", value: valeur, format: "number" }],
    cout: null,
  });

  it("rend null sans historique", () => {
    expect(inchangeSignificatif([], "Valeur nette", T0)).toBeNull();
  });

  it("rend null sous le seuil et la durée au-delà", () => {
    const hist = [releve(0, 10), releve(1000, 10)];
    expect(inchangeSignificatif(hist, "Valeur nette", T0 + 1000)).toBeNull();
    const loin = T0 + SEUIL_INCHANGE_MS * 2;
    expect(
      inchangeSignificatif(hist, "Valeur nette", loin),
    ).toBeGreaterThanOrEqual(SEUIL_INCHANGE_MS);
  });
});

describe("lienRecoRefuse — le refus d'un lien de recommandation se voit", () => {
  it("vrai quand l'app a publié un lien que safeHttpUrl a écarté", () => {
    const summary = validSummary({
      recommendation: { label: "Faire X", href: "javascript:alert(1)" },
    });
    const reco = recommandation(summary)!;
    expect(reco.href).toBeNull();
    expect(lienRecoRefuse(reco, summary)).toBe(true);
  });

  it("faux quand le lien est valide ou absent", () => {
    const valide = validSummary({
      recommendation: {
        label: "Faire X",
        href: "https://finance.hubperso.com/x",
      },
    });
    expect(lienRecoRefuse(recommandation(valide)!, valide)).toBe(false);
    const sansLien = validSummary({ recommendation: { label: "Faire X" } });
    expect(lienRecoRefuse(recommandation(sansLien)!, sansLien)).toBe(false);
  });
});

describe("libelleQuota et barreQuota — la ligne d'un quota", () => {
  it("écrit le plafond seulement quand il est connu", () => {
    expect(
      libelleQuota({ label: "Appels", used: 120, limit: 1000, unit: "appels" }),
    ).toBe("Appels — 120 / 1000 appels");
    expect(libelleQuota({ label: "Stockage", used: 4, limit: null })).toBe(
      "Stockage — 4 ",
    );
  });

  it("plafonne la barre à 100 % et passe en orange dès 80 %", () => {
    expect(barreQuota(0.5)).toEqual({ largeur: "50%", alerte: false });
    expect(barreQuota(0.8)).toEqual({ largeur: "80%", alerte: true });
    expect(barreQuota(1.7)).toEqual({ largeur: "100%", alerte: true });
  });
});

describe("variablesAccent — la couleur de l'app et le texte lisible dessus", () => {
  it("rien sans couleur : la page garde l'accent par défaut", () => {
    expect(variablesAccent(undefined)).toBeUndefined();
  });

  it("calcule le texte lisible sur la couleur", () => {
    expect(variablesAccent("#0f766e")).toEqual({
      "--accent": "#0f766e",
      "--accent-texte": "#ffffff",
    });
    expect(variablesAccent("#fde047")).toEqual({
      "--accent": "#fde047",
      "--accent-texte": "#000000",
    });
  });

  it("garde la couleur sans texte quand elle n'est pas lisible par texteSur", () => {
    expect(variablesAccent("pas-une-couleur")).toEqual({
      "--accent": "pas-une-couleur",
    });
  });
});
