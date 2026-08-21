// tests/docAJour.test.ts — le contrôle qui empêche la doc de dériver, testé sans git ni CI.

import { describe, expect, it } from "vitest";
import {
  HORS_BACKLOG,
  entreeTouchee,
  estCode,
  idDeSujet,
  idsDesCommits,
  idsDuBacklog,
  suggestion,
  verifier,
} from "../scripts/docAJour.mjs";

describe("un sujet peut porter PLUSIEURS identifiants", () => {
  // Régression du 21/08/2026, trouvée en appliquant le contrôle à sa propre PR : la
  // première version exigeait une espace après le crochet fermant, donc « [H-06][H-07] … »
  // ne portait AUCUN id à ses yeux. Le contrôle bloquait un commit parfaitement conforme
  // en affirmant l'inverse de la vérité. Or un commit qui ferme deux items est un usage
  // courant ici — FinanceAI écrit « [FX-A][RETIREMENT-B] … » régulièrement.
  it("relève les deux, pas seulement le premier", () => {
    expect(idsDesCommits(["[H-06][H-07] fix: plafonds et quota"])).toEqual(["H-06", "H-07"]);
  });

  it("trois d'affilée, et le corps du sujet n'est pas confondu avec un id", () => {
    expect(idsDesCommits(["[A-1][B-2][C-3] feat: TROIS ITEMS D'UN COUP"])).toEqual([
      "A-1",
      "B-2",
      "C-3",
    ]);
  });

  it("un seul id entre crochets reste un seul id", () => {
    expect(idsDesCommits(["[H-01] Re-pinner le contrat"])).toEqual(["H-01"]);
  });
});

describe("idDeSujet — cherché EN TÊTE, jamais n'importe où", () => {
  it("reconnaît les conventions réelles de l'écosystème", () => {
    expect(idDeSujet("C28-49: feat: missions de curation")).toBe("C28-49");
    expect(idDeSujet("[CARTE-G] correctifs des retours de test")).toBe("CARTE-G");
    expect(idDeSujet("P1-03: extraction des PJ Gmail")).toBe("P1-03");
    expect(idDeSujet("FX-FALLBACK-SILENCIEUX: vague 2")).toBe("FX-FALLBACK-SILENCIEUX");
  });

  it("N'ATTRAPE PAS un identifiant cité en passant", () => {
    // Le risque le plus coûteux du contrôle : accuser une tâche qui n'existe pas. Un faux
    // positif n'agace pas, il APPREND À CONTOURNER.
    // Mutation : chercher le motif n'importe où dans le sujet fait tomber ces trois cas.
    expect(idDeSujet("fix: réponse en UTF-8 mal décodée")).toBeNull();
    expect(idDeSujet("fix: gérer le HTTP-404 du CDN")).toBeNull();
    expect(idDeSujet("docs: préciser l'ADR-0045 sur l'inventaire")).toBeNull();
  });

  it("ignore les préfixes conventionnels seuls", () => {
    expect(idDeSujet("feat: le hub gagne une mémoire")).toBeNull();
    expect(idDeSujet("chore: re-pinner le contrat")).toBeNull();
  });
});

describe("idsDesCommits", () => {
  it("dédoublonne en gardant l'ordre, et exclut l'échappatoire", () => {
    expect(
      idsDesCommits([`${HORS_BACKLOG}: réparer la CI`, "C28-49: a", "C28-50: b", "C28-49: c"]),
    ).toEqual(["C28-49", "C28-50"]);
  });
});

describe("idsDuBacklog — les DEUX formats du parc", () => {
  it("lit les cases à cocher (Hubperso, BatchChef)", () => {
    expect(idsDuBacklog("- [ ] **`MCP-02`** — poser le jeton").has("MCP-02")).toBe(true);
  });

  it("lit les identifiants entre CROCHETS (Hubperso)", () => {
    // Trouvé en faisant tourner le contrôle sur SA propre PR : la première version était
    // aveugle au format du dépôt où elle a été écrite. Elle serait passée au vert sans rien
    // vérifier — un contrôle aveugle est pire que pas de contrôle, parce qu'on s'y fie.
    expect(idsDuBacklog("- **[H-01] Re-pinner le contrat sur `#v1.1.0`.**").has("H-01")).toBe(true);
  });

  it("lit les tableaux à statut emoji (DriveAI)", () => {
    // Mutation : ne gérer qu'un seul format rendrait le contrôle aveugle sur la moitié du
    // parc — et un contrôle aveugle qui passe au vert est pire qu'aucun contrôle.
    expect(idsDuBacklog("| C28-61 — CI : le job E2E se fige | 🔧 bordé |").has("C28-61")).toBe(true);
  });
});

describe("entreeTouchee", () => {
  const diff = ["--- a/BACKLOG.md", "+++ b/BACKLOG.md", "-- [ ] **`C28-49`** — missions", "+- [x] **`C28-49`** — missions"].join("\n");

  it("voit une ligne modifiée", () => {
    expect(entreeTouchee(diff, "C28-49")).toBe(true);
  });

  it("ne confond pas l'en-tête du diff avec du contenu", () => {
    expect(entreeTouchee(diff, "BACKLOG")).toBe(false);
  });

  it("rend false quand l'entrée n'a pas bougé", () => {
    expect(entreeTouchee(diff, "C28-50")).toBe(false);
  });
});

describe("estCode — ce qui ne change pas ce qui est servi", () => {
  it("exclut doc, tests et CI", () => {
    expect(estCode("README.md")).toBe(false);
    expect(estCode("docs/ADR.md")).toBe(false);
    expect(estCode(".github/workflows/ci.yml")).toBe(false);
    expect(estCode("tests/carte.test.ts")).toBe(false);
    expect(estCode("web/tests/hub.test.ts")).toBe(false);
  });

  it("compte tout le reste, y compris l'imprévu", () => {
    // Liste d'exemptions FERMÉE, liste de ce qui compte OUVERTE : un chemin qu'on n'a pas
    // prévu déclenche le contrôle, jamais l'inverse.
    expect(estCode("lib/carte.ts")).toBe(true);
    expect(estCode("src/Router.gs")).toBe(true);
    expect(estCode("un/chemin/jamais/vu.rs")).toBe(true);
  });
});

describe("verifier — les deux oublis de Marc", () => {
  const backlog = "- [ ] **`C28-49`** — missions de curation\n- [x] **`MCP-02`** — jeton posé\n";

  it("BLOQUE une tâche jamais inscrite", () => {
    const r = verifier({
      sujets: ["C99-01: feat: quelque chose"],
      fichiers: ["lib/x.ts"],
      contenuBacklog: backlog,
      diffBacklog: "",
    });
    expect(r.bloquants.some((b) => b.includes("jamais inscrite"))).toBe(true);
  });

  it("BLOQUE une tâche avancée dont l'entrée n'a pas été relue", () => {
    const r = verifier({
      sujets: ["C28-49: feat: paies par employeur"],
      fichiers: ["lib/x.ts"],
      contenuBacklog: backlog,
      diffBacklog: "",
    });
    expect(r.bloquants.some((b) => b.includes("pas cochée"))).toBe(true);
  });

  it("LAISSE PASSER quand l'entrée a été relue, même encore décochée", () => {
    // Exiger la case COCHÉE punirait le travail en plusieurs PR : une tâche avancée sans
    // être finie reste légitimement ⬜.
    const r = verifier({
      sujets: ["C28-49: feat: paies par employeur"],
      fichiers: ["lib/x.ts"],
      contenuBacklog: backlog,
      diffBacklog: "-- [ ] **`C28-49`** — missions\n+- [ ] **`C28-49`** — missions (PR2 livrée)",
    });
    expect(r.bloquants).toEqual([]);
  });

  it("BLOQUE du code sans aucun identifiant de tâche", () => {
    const r = verifier({ sujets: ["feat: un truc"], fichiers: ["lib/x.ts"], contenuBacklog: backlog });
    expect(r.bloquants.some((b) => b.includes("aucun commit ne porte"))).toBe(true);
  });

  it("accepte l'échappatoire NOMMÉE", () => {
    const r = verifier({
      sujets: [`${HORS_BACKLOG}: réparer un job de CI figé`],
      fichiers: ["lib/x.ts"],
      contenuBacklog: backlog,
    });
    expect(r.bloquants).toEqual([]);
  });

  it("ne demande RIEN à une PR de documentation pure", () => {
    const r = verifier({
      sujets: ["docs: préciser la §6"],
      fichiers: ["CLAUDE.md", "docs/x.md"],
      contenuBacklog: backlog,
    });
    expect(r.bloquants).toEqual([]);
    expect(r.avertissements).toEqual([]);
  });

  it("avertit sans bloquer sur les autres documents", () => {
    const r = verifier({
      sujets: [`${HORS_BACKLOG}: x`],
      fichiers: ["lib/x.ts"],
      contenuBacklog: backlog,
      documents: { "HANDOVER.md": true, "CHANGELOG.md": false },
    });
    expect(r.bloquants).toEqual([]);
    expect(r.avertissements).toHaveLength(1);
    expect(r.avertissements[0]).toContain("HANDOVER.md");
  });

  it("NE réclame PAS le README pour un changement interne", () => {
    // Un avertissement qui paraît sur une PR sur deux ne porte plus d'information : on
    // apprend à le sauter, et le jour où il a raison il est déjà invisible.
    // Mutation : réclamer le README sur tout code touché fait tomber ce test.
    const r = verifier({
      sujets: [`${HORS_BACKLOG}: x`],
      fichiers: ["lib/carte.ts"],
      contenuBacklog: backlog,
      documents: { "README.md": true },
    });
    expect(r.avertissements).toEqual([]);
  });

  it("réclame le README quand la SURFACE bouge", () => {
    const r = verifier({
      sujets: [`${HORS_BACKLOG}: x`],
      fichiers: ["package.json"],
      contenuBacklog: backlog,
      documents: { "README.md": true },
    });
    expect(r.avertissements).toHaveLength(1);
    expect(r.avertissements[0]).toContain("README.md");
  });
});

describe("suggestion", () => {
  it("propose une entrée pour chaque ID manquant, à compléter", () => {
    const s = suggestion(["C99-01", "C28-49"], new Set(["C28-49"]));
    expect(s).toContain("C99-01");
    expect(s).not.toContain("C28-49");
    expect(s).toContain("à décrire");
  });

  it("ne propose rien quand tout est inscrit", () => {
    expect(suggestion(["C28-49"], new Set(["C28-49"]))).toBeNull();
  });
});
