// tests/jetonApp.test.ts — l'identité de l'appelant.
//
// Ce module décide QUI parle au hub. Les cas qui comptent sont ceux du refus : accorder
// une identité par erreur ne se voit nulle part, alors qu'un refus se signale tout seul.

import { describe, expect, it, vi } from "vitest";
import { appDuJeton, memeJeton } from "../lib/jetonApp";

const JETON_JOBAI = "jeton-de-test-jobai-0000000000";
const JETON_CARAI = "jeton-de-test-carai-1111111111";

describe("memeJeton", () => {
  it("reconnaît deux valeurs identiques", () => {
    expect(memeJeton(JETON_JOBAI, JETON_JOBAI)).toBe(true);
  });

  it("refuse deux valeurs différentes de même longueur", () => {
    expect(memeJeton(JETON_JOBAI, JETON_CARAI)).toBe(false);
  });

  it("refuse des longueurs différentes sans lever d'exception", () => {
    // `timingSafeEqual` LÈVE quand les tailles diffèrent. Sans la garde de longueur, un
    // en-tête plus court ferait planter la route en 500 au lieu de répondre 401.
    expect(() => memeJeton("court", JETON_JOBAI)).not.toThrow();
    expect(memeJeton("court", JETON_JOBAI)).toBe(false);
  });
});

describe("appDuJeton", () => {
  const env = { HUB_TOKEN_JOBAI: JETON_JOBAI, HUB_TOKEN_CARAI: JETON_CARAI };

  it("identifie l'app par son propre jeton", () => {
    expect(appDuJeton(JETON_JOBAI, env)).toBe("jobai");
    expect(appDuJeton(JETON_CARAI, env)).toBe("carai");
  });

  it("tolère les espaces autour du jeton", () => {
    // Une variable Vercel collée avec un retour à la ligne est une panne classique.
    expect(appDuJeton(`  ${JETON_JOBAI}\n`, env)).toBe("jobai");
  });

  it("refuse un jeton inconnu, absent ou vide", () => {
    expect(appDuJeton("jeton-qui-n-existe-pas", env)).toBeNull();
    expect(appDuJeton(null, env)).toBeNull();
    expect(appDuJeton(undefined, env)).toBeNull();
    expect(appDuJeton("   ", env)).toBeNull();
  });

  it("ne fait correspondre AUCUNE app quand rien n'est configuré", () => {
    // ÉCHEC FERMÉ : sans variables, un en-tête quelconque ne doit correspondre à personne.
    expect(appDuJeton(JETON_JOBAI, {})).toBeNull();
  });

  it("ne laisse pas un jeton vide correspondre à une app non configurée", () => {
    // Le piège : `env.HUB_TOKEN_X` vaut "" et l'appelant envoie "". `timingSafeEqual` sur
    // deux tampons vides répond `true` — sans garde, n'importe qui serait CarAI.
    //
    // TROIS mécanismes le refusent, chacun suffisant à lui seul : le retour anticipé sur un
    // jeton vide, le fait qu'une variable vide n'est jamais « configurée », et le refus de
    // l'ambiguïté (une chaîne vide correspondrait à TOUTES les apps non configurées à la
    // fois). Vérifié par mutation : il faut les retirer tous les trois pour que ce test
    // tombe — aucun n'est donc à lui seul le verrou, et c'est très bien ainsi.
    expect(appDuJeton("", { HUB_TOKEN_CARAI: "" })).toBeNull();
    expect(appDuJeton(" ", { HUB_TOKEN_CARAI: "  " })).toBeNull();
  });

  it("REFUSE quand deux apps partagent le même jeton", () => {
    // Copier-coller d'un HUB_TOKEN entre deux projets Vercel : l'identité devient ambiguë.
    // Répondre « jobai » attribuerait la question à une app que l'appelant n'est peut-être
    // pas. On refuse, et on le dit dans les journaux.
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const partage = { HUB_TOKEN_JOBAI: JETON_JOBAI, HUB_TOKEN_CARAI: JETON_JOBAI };

    expect(appDuJeton(JETON_JOBAI, partage)).toBeNull();
    expect(erreur).toHaveBeenCalledOnce();
    expect(String(erreur.mock.calls[0]?.[0])).toContain("ambigu");

    erreur.mockRestore();
  });
});
