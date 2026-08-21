// tests/autoMerge.test.ts — la décision d'auto-merge, testée sans GitHub.
//
// Chaque cas de refus vient d'un incident réel ou d'un mode d'échec nommé. Un auto-merge
// dont la logique n'est pas testée finit par fusionner ce qu'il ne fallait pas — et on ne
// s'en aperçoit qu'après, parce qu'un merge ne se rejoue pas.

import { describe, expect, it } from "vitest";
import { LABEL_FREIN, decision, type EtatPR } from "../scripts/autoMerge.mjs";

/** Une PR parfaitement mergeable. Chaque test n'en dégrade qu'UN aspect. */
function prVerte(patch: Partial<EtatPR> = {}): EtatPR {
  return {
    state: "OPEN",
    isDraft: false,
    isCrossRepository: false,
    labels: [],
    checks: [
      { name: "Gate", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "La doc suit le code", status: "COMPLETED", conclusion: "SUCCESS" },
    ],
    mergeStateStatus: "CLEAN",
    ...patch,
  };
}

describe("decision — le cas nominal", () => {
  it("merge une PR verte, à jour, hors brouillon", () => {
    expect(decision(prVerte())).toEqual({
      merger: true,
      raison: "tous les checks sont verts et la branche est à jour",
    });
  });

  it("accepte NEUTRAL et SKIPPED À CÔTÉ d'un check réellement vert", () => {
    const r = decision(
      prVerte({
        checks: [
          { name: "Gate", status: "COMPLETED", conclusion: "SUCCESS" },
          { name: "a", status: "COMPLETED", conclusion: "SKIPPED" },
          { name: "b", status: "COMPLETED", conclusion: "NEUTRAL" },
        ],
      }),
    );
    expect(r.merger).toBe(true);
  });

  it("REFUSE quand TOUS les checks sont sautés — rien n'a tourné", () => {
    // Resserrement du 21/08, trouvé en ajoutant le garde `auMoinsUnePreuve` : la version
    // précédente fusionnait une PR dont chaque check était SKIPPED. « Aucun échec » n'est pas
    // « tout est vérifié » — c'est exactement la confusion que le cas « quota seul » a rendue
    // visible, et elle existait déjà sans lui.
    const r = decision(
      prVerte({
        checks: [
          { name: "a", status: "COMPLETED", conclusion: "SKIPPED" },
          { name: "b", status: "COMPLETED", conclusion: "NEUTRAL" },
        ],
      }),
    );
    expect(r.merger).toBe(false);
    expect(r.raison).toContain("rien n'a été prouvé");
  });
});

describe("decision — le brouillon, le frein qui a manqué", () => {
  it("REFUSE un brouillon", () => {
    // L'incident du 20/08 : l'ADR-0045, ouverte en brouillon avec « statut Proposé, demande
    // ta ratification », fusionnée 63 secondes après sa création.
    expect(decision(prVerte({ isDraft: true }).valueOf() as EtatPR).merger).toBe(false);
  });

  it("REFUSE quand le champ est ABSENT — « je ne sais pas » n'est pas « non »", () => {
    // Mutation : écrire `isDraft === true` au lieu de `!== false` fait passer ce cas, et
    // c'est exactement la confusion qui a coûté l'ADR-0045.
    const { isDraft, ...sansChamp } = prVerte();
    expect(decision(sansChamp).raison).toContain("brouillon");
  });
});

describe("decision — les refus de sécurité", () => {
  it("REFUSE une PR de fork", () => {
    expect(decision(prVerte({ isCrossRepository: true })).raison).toContain("fork");
  });

  it("REFUSE si le champ fork est absent", () => {
    const { isCrossRepository, ...sansChamp } = prVerte();
    expect(decision(sansChamp).merger).toBe(false);
  });

  it("REFUSE sur le label frein", () => {
    expect(decision(prVerte({ labels: [{ name: LABEL_FREIN }] })).raison).toContain(LABEL_FREIN);
  });
});

describe("decision — TOUS les checks, pas seulement un workflow", () => {
  it("REFUSE si un SEUL check échoue, même si les autres passent", () => {
    // Le défaut du premier auto-merge du parc : déclenché par le succès du workflow « CI »,
    // il ignorait les autres. Hubperso a deux workflows depuis le 21/08 — copié tel quel, il
    // aurait mergé une PR dont le contrôle de doc avait échoué.
    const r = decision(
      prVerte({
        checks: [
          { name: "Gate", status: "COMPLETED", conclusion: "SUCCESS" },
          { name: "La doc suit le code", status: "COMPLETED", conclusion: "FAILURE" },
        ],
      }),
    );
    expect(r.merger).toBe(false);
    expect(r.raison).toContain("La doc suit le code");
  });

  it("REFUSE tant qu'un check n'est pas terminé", () => {
    const r = decision(
      prVerte({ checks: [{ name: "Gate", status: "IN_PROGRESS" }] }),
    );
    expect(r.raison).toContain("pas terminé");
  });

  it("REFUSE une PR SANS aucun check — rien n'a été prouvé", () => {
    // Zéro check signale plus souvent une CI qui n'a pas démarré qu'un dépôt sans CI.
    expect(decision(prVerte({ checks: [] })).raison).toContain("aucun check");
  });

  it("comprend les statuts « legacy » (Vercel) qui n'ont qu'un `state`", () => {
    expect(decision(prVerte({ checks: [{ name: "Vercel", state: "SUCCESS" }] })).merger).toBe(true);
    expect(decision(prVerte({ checks: [{ name: "Vercel", state: "FAILURE" }] })).merger).toBe(false);
    expect(decision(prVerte({ checks: [{ name: "Vercel", state: "PENDING" }] })).raison).toContain("en cours");
  });

  it("REFUSE une forme de check INCONNUE plutôt que de la supposer verte", () => {
    expect(decision(prVerte({ checks: [{ name: "bizarre" }] })).merger).toBe(false);
  });
});

describe("decision — les quotas : un signal ABSENT n'est pas un signal négatif", () => {
  const vercelQuota = {
    name: "Vercel",
    state: "FAILURE",
    description: "Deployment rate limited — retry in 24 hours.",
  };

  it("NEUTRALISE un échec Vercel dû au quota, si un vrai check est vert", () => {
    // Vécu deux fois en dix-huit heures les 20 et 21/08 : plus rien ne pouvait être fusionné
    // pendant que tout était vert côté code. Le plafond refuse le déploiement À LA CRÉATION —
    // aucun build tenté, donc aucune information sur la PR.
    const r = decision(prVerte({ checks: [prVerte().checks![0]!, vercelQuota] }));
    expect(r.merger).toBe(true);
  });

  it("REFUSE quand le quota est le SEUL signal — rien n'a été prouvé", () => {
    // Le cas où le quota tombe avant que la CI ne démarre : la PR aurait l'air « sans
    // échec » alors qu'elle n'a rien passé du tout.
    // Mutation : retirer le garde `auMoinsUnePreuve` fait passer ce cas, et fusionne une PR
    // dont aucun check n'a rien vérifié.
    const r = decision(prVerte({ checks: [vercelQuota] }));
    expect(r.merger).toBe(false);
    expect(r.raison).toContain("rien n'a été prouvé");
  });

  it("ne neutralise PAS un vrai échec de build Vercel", () => {
    // La distinction est étroite EXPRÈS : seul un message de plafond compte. « Vercel a
    // échoué » et « Vercel n'a rien tenté » ne sont pas le même fait.
    const r = decision(
      prVerte({
        checks: [
          prVerte().checks![0]!,
          { name: "Vercel", state: "FAILURE", description: "Build failed: type error" },
        ],
      }),
    );
    expect(r.merger).toBe(false);
    expect(r.raison).toContain("Vercel");
  });

  it("reconnaît les formulations réelles du plafond Vercel", () => {
    for (const description of [
      "Resource is limited - try again in 24 hours (more than 100, code: \"api-deployments-free-per-day\").",
      "Deployment rate limited — retry in 24 hours.",
    ]) {
      const r = decision(prVerte({ checks: [prVerte().checks![0]!, { name: "Vercel", state: "FAILURE", description }] }));
      expect(r.merger).toBe(true);
    }
  });
});

describe("decision — l'état de fusion", () => {
  it("REFUSE une branche en retard sur main", () => {
    // Verte contre une base PÉRIMÉE : ses tests n'ont jamais vu le main d'aujourd'hui.
    // C'est ainsi qu'on casse main avec deux PR vertes qui ne se sont jamais rencontrées.
    expect(decision(prVerte({ mergeStateStatus: "BEHIND" })).raison).toContain("BEHIND");
  });

  it("REFUSE un conflit, un blocage, et l'état UNKNOWN", () => {
    // `UNKNOWN` est calculé de façon ASYNCHRONE par GitHub : le traiter comme « probablement
    // bon » mergerait sur une réponse pas encore calculée.
    for (const etat of ["DIRTY", "BLOCKED", "UNSTABLE", "UNKNOWN"]) {
      expect(decision(prVerte({ mergeStateStatus: etat })).merger).toBe(false);
    }
  });

  it("accepte HAS_HOOKS comme CLEAN", () => {
    expect(decision(prVerte({ mergeStateStatus: "HAS_HOOKS" })).merger).toBe(true);
  });
});

describe("decision — les entrées dégénérées refusent, jamais l'inverse", () => {
  it("refuse null, undefined, et une PR fermée", () => {
    expect(decision(null).merger).toBe(false);
    expect(decision(undefined).merger).toBe(false);
    expect(decision(prVerte({ state: "MERGED" })).merger).toBe(false);
    expect(decision(prVerte({ state: "CLOSED" })).merger).toBe(false);
  });
});
