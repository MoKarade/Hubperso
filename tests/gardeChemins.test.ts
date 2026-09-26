// tests/gardeChemins.test.ts — la garde technique : une PR qui touche un chemin sensible
// (hooks, workflows, réglages, garde de commit, .claude, CODEOWNERS, copies de modèles) ne
// s'auto-fusionne JAMAIS, quel que soit l'état de ses checks.
//
// Modèle : `atelier/modeles/auto-merge/chemins-interdits.json` (source unique côté Atelier),
// porté ici avec la même logique de comparaison (sans casse, séparateurs Windows, renommage
// = ancien ET nouveau chemin, chemin douteux = refus).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CHEMINS_INTERDITS, examinerChemins } from "../scripts/gardeChemins.mjs";

describe("examinerChemins — les chemins interdits", () => {
  it.each([
    "scripts/hooks/pre-commit.sh",
    ".github/workflows/auto-merge.yml",
    ".github/CODEOWNERS",
    "CODEOWNERS",
    "settings.json",
    "app/settings.local.json",
    ".claude/settings.json",
    "commit-gate.ps1",
    "qualite/commit-gate.mjs",
    "passerelle/tunnel.yml",
    "modeles/qualite/portes.mjs",
    ".husky/pre-push",
    ".gitattributes",
    "scripts/autoMerge.mjs",
    "scripts/gardeChemins.mjs",
  ])("REFUSE %s", (chemin) => {
    const r = examinerChemins([chemin]);
    expect(r.ok).toBe(false);
    expect(r.raison).toContain(chemin.toLowerCase());
  });

  it("accepte une PR de code ordinaire", () => {
    expect(examinerChemins(["lib/format.ts", "tests/format.test.ts", "docs/adr/0001.md"]).ok).toBe(true);
  });

  it("un seul chemin sensible parmi beaucoup suffit à refuser", () => {
    const r = examinerChemins(["lib/a.ts", "lib/b.ts", ".github/workflows/ci.yml"]);
    expect(r.ok).toBe(false);
    expect(r.raison).toContain(".github/workflows/ci.yml");
  });

  it("ignore la casse et accepte les séparateurs Windows", () => {
    expect(examinerChemins([".GitHub\\Workflows\\ci.yml"]).ok).toBe(false);
    expect(examinerChemins(["Scripts\\Hooks\\x.sh"]).ok).toBe(false);
  });

  it("un renommage compte l'ANCIEN chemin comme le nouveau", () => {
    const r = examinerChemins([{ filename: "lib/x.yml", previous_filename: ".github/workflows/x.yml" }]);
    expect(r.ok).toBe(false);
  });

  it("une suppression d'un fichier sensible compte aussi", () => {
    expect(examinerChemins([{ filename: ".claude/settings.json", status: "removed" }]).ok).toBe(false);
  });

  it("ne confond pas un nom voisin avec un chemin interdit", () => {
    expect(examinerChemins(["lib/settingsPanel.ts"]).ok).toBe(false); // settings* : voulu, prudent
    expect(examinerChemins(["lib/githubClient.ts", "docs/hooksNote.md"]).ok).toBe(true);
  });
});

describe("examinerChemins — échec fermé", () => {
  it.each([
    ["liste absente", undefined],
    ["liste non tableau", "lib/a.ts"],
    ["liste vide", []],
    ["chemin remonté", ["../secret"]],
    ["chemin absolu", ["/etc/passwd"]],
    ["chemin Windows absolu", ["C:\\x\\y.ts"]],
    ["octet de contrôle", ["lib/a\u0000.ts"]],
    ["entrée non textuelle", [42]],
    ["objet sans chemin", [{}]],
  ])("REFUSE : %s", (_nom, fichiers) => {
    expect(examinerChemins(fichiers as unknown).ok).toBe(false);
  });

  it("REFUSE une liste peut-être tronquée (3000 fichiers = plafond de l'API)", () => {
    const beaucoup = Array.from({ length: 3000 }, (_, i) => `lib/f${i}.ts`);
    expect(examinerChemins(beaucoup).ok).toBe(false);
  });

  it("la liste porte bien les chemins exigés (anti-vacuité)", () => {
    expect(CHEMINS_INTERDITS.length).toBeGreaterThan(10);
    for (const attendu of ["scripts/hooks/**", ".github/**", ".claude/**", "CODEOWNERS", "modeles/**", "passerelle/tunnel.yml"]) {
      expect(CHEMINS_INTERDITS).toContain(attendu);
    }
  });
});

// Le workflow doit APPELER la garde, et se réveiller à la fin des contrôles externes.
describe("le workflow auto-merge", () => {
  const workflow = readFileSync(".github/workflows/auto-merge.yml", "utf8").replaceAll("\r\n", "\n");

  it("passe chaque PR par la garde de chemins avant de fusionner", () => {
    expect(workflow).toContain("scripts/gardeChemins.mjs");
    expect(workflow).toMatch(/pulls\/\$numero\/files/);
    // La garde vient AVANT le merge, dans le même corps de boucle.
    expect(workflow.indexOf("gardeChemins.mjs")).toBeLessThan(workflow.indexOf("gh pr merge"));
  });

  it("se réveille quand un check EXTERNE (Vercel Agent Review) se termine", () => {
    // Un check_run externe ne déclenche aucun `workflow_run` : sans ce déclencheur, la PR
    // vue « en cours » n'était jamais réexaminée (PR #83, relancée à la main).
    expect(workflow).toMatch(/^ {2}check_run:\n {4}types: \[completed\]$/m);
    // Les check_run de GitHub Actions sont déjà couverts par workflow_run : on les exclut,
    // sinon chaque job de CI paierait une seconde exécution.
    expect(workflow).toContain("github.event.check_run.app.slug != 'github-actions'");
  });

  it("la concurrence et la branche gèrent aussi l'événement check_run", () => {
    expect(workflow.match(/github\.event\.check_run\.check_suite\.head_branch/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("n'appelle jamais gh pr ready", () => {
    expect(workflow).not.toMatch(/^\s*(?!#).*gh pr ready/m);
  });
});
