// tests/gardeChemins.test.ts — la garde technique : une PR qui touche un chemin sensible
// (hooks, workflows, réglages, garde de commit, .claude, CODEOWNERS, copies de modèles) ne
// s'auto-fusionne JAMAIS, quel que soit l'état de ses checks.
//
// Modèle : `atelier/modeles/auto-merge/chemins-interdits.json` (source unique côté Atelier),
// porté ici avec la même logique de comparaison (sans casse, séparateurs Windows, renommage
// = ancien ET nouveau chemin, chemin douteux = refus).

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
    // Sensibles propres à Hubperso : auth, jetons, API, configuration servie, base, build/CI.
    "auth.ts",
    "middleware.ts",
    "lib/authGuard.ts",
    "lib/gardeHub.ts",
    "lib/sessionPartagee.ts",
    "lib/jetonApp.ts",
    "lib/jetonsGoogle.ts",
    "app/api/acces/route.ts",
    "app/api/cron/releve/route.ts",
    "vercel.json",
    "next.config.mjs",
    "drizzle/0002_x.sql",
    "drizzle.config.ts",
    "scripts/build-necessaire.sh",
    "qualite/portes.mjs",
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

describe("examinerChemins — le commentaire fixe posé sur la PR refusée", () => {
  it("un chemin sensible donne un corps constant qui nomme le chemin et « attend Marc »", () => {
    const r = examinerChemins([".github/workflows/x.yml"]);
    expect(r.ok).toBe(false);
    expect(r.corps).toContain("`.github/workflows/x.yml`");
    expect(r.corps).toContain("attend Marc");
    expect(r.corps).toContain(r.marqueur);
    expect(r.marqueur).toMatch(/^<!-- auto-merge-garde:[0-9a-f]{16} -->$/);
  });

  it("le marqueur est stable : même chemin = même marqueur (pas de doublon aux relances)", () => {
    expect(examinerChemins([".claude/a.json"]).marqueur).toBe(examinerChemins([".claude/a.json"]).marqueur);
    expect(examinerChemins([".claude/a.json"]).marqueur).not.toBe(examinerChemins([".claude/b.json"]).marqueur);
  });

  it("le texte ne contient rien d'autre que le chemin nettoyé : pas d'injection par un nom de fichier", () => {
    const r = examinerChemins([".github/@gerant [x](evil) `oups`.yml"]);
    expect(r.corps).not.toContain("`oups`");
    // Le chemin est dans UN seul segment de code inline : ni lien ni mention active hors de ce segment.
    const horsCode = (r.corps ?? "").replace(/`[^`]*`/g, "");
    expect(horsCode).not.toMatch(/@|\]\(|http/);
  });

  it("un chemin très long est borné", () => {
    const r = examinerChemins([".github/" + "a".repeat(500)]);
    expect((r.corps ?? "").length).toBeLessThan(400);
  });

  it("un refus qui n'est pas un chemin sensible (liste illisible) ne commente pas", () => {
    expect(examinerChemins(undefined).corps).toBeUndefined();
    expect(examinerChemins([]).corps).toBeUndefined();
  });

  it("un chemin accepté n'a ni corps ni marqueur", () => {
    expect(examinerChemins(["lib/a.ts"]).corps).toBeUndefined();
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

  it("sur refus : crée le label validation-marc, le pose, et ne commente qu'une fois", () => {
    expect(workflow).toContain('gh label create "validation-marc"');
    expect(workflow).toContain("--add-label validation-marc");
    expect(workflow).toContain("gh pr comment");
    // Le corps vient de la garde (texte fixe), jamais du titre / corps / branche de la PR.
    expect(workflow).toContain('--body "$corps"');
    expect(workflow).not.toContain("headRefName");
    expect(workflow).not.toContain("--json title");
    // Un seul commentaire : on regarde d'abord les commentaires existants pour le marqueur.
    expect(workflow).toContain("--json comments");
  });

  it("les chemins sensibles propres à Hubperso existent encore (liste non périmée)", () => {
    for (const f of ["auth.ts", "middleware.ts", "lib/authGuard.ts", "lib/gardeHub.ts", "lib/sessionPartagee.ts", "lib/jetonApp.ts", "lib/jetonsGoogle.ts", "vercel.json", "next.config.mjs", "drizzle.config.ts", "scripts/build-necessaire.sh"]) {
      expect(existsSync(f), f).toBe(true);
    }
  });

  it("TOCTOU : relit le SHA juste avant la fusion et le verrouille avec --match-head-commit", () => {
    expect(workflow).toContain("headRefOid");
    expect(workflow).toContain("SHA changé : pas de merge");
    expect(workflow).toContain('--match-head-commit "$sha"');
    // Ordre : garde de chemins, puis relecture du SHA, puis le merge lui-même.
    const garde = workflow.indexOf("examinerChemins");
    const relecture = workflow.indexOf("SHA changé : pas de merge");
    const merge = workflow.indexOf("gh pr merge");
    expect(garde).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(relecture);
    expect(relecture).toBeLessThan(merge);
  });

  it("épingle les actions par SHA de commit (le tag en commentaire)", () => {
    const usages = [...workflow.matchAll(/^\s*- uses: (\S+)(.*)$/gm)];
    expect(usages.length).toBeGreaterThanOrEqual(2);
    for (const u of usages) {
      expect(u[1], u[0]).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(u[2], u[0]).toMatch(/#\s*v\d/);
    }
  });

  it("n'appelle jamais gh pr ready", () => {
    expect(workflow).not.toMatch(/^\s*(?!#).*gh pr ready/m);
  });
});
