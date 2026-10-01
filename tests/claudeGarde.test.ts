// tests/claudeGarde.test.ts — la garde de correction automatique (scripts/claude-garde.mjs).
// Diffs construits en mémoire, au format `git diff` ; aucune donnée réelle.

import { describe, expect, it } from "vitest";
import { dejaCorrige, juger, motifsCodeowners } from "../scripts/claude-garde.mjs";

interface Fichier {
  chemin: string;
  mode?: string;
  nouveau?: boolean;
  supprime?: boolean;
  de?: string; // renommage
  plus?: number;
  moins?: number;
}

function diff(...fichiers: Fichier[]): string {
  return (
    fichiers
      .map((f) => {
        const de = f.de ?? f.chemin;
        const t = [`diff --git a/${de} b/${f.chemin}`];
        if (f.nouveau) t.push(`new file mode ${f.mode ?? "100644"}`);
        if (f.supprime) t.push(`deleted file mode ${f.mode ?? "100644"}`);
        if (f.de) t.push("similarity index 90%", `rename from ${de}`, `rename to ${f.chemin}`);
        t.push(`index 1111111..2222222${f.nouveau || f.supprime || f.de ? "" : ` ${f.mode ?? "100644"}`}`);
        t.push(`--- a/${de}`, `+++ b/${f.chemin}`, "@@ -1,3 +1,3 @@", " contexte");
        for (let i = 0; i < (f.plus ?? 1); i++) t.push(`+ligne ajoutée ${i}`);
        for (let i = 0; i < (f.moins ?? 1); i++) t.push(`-ligne retirée ${i}`);
        return t.join("\n");
      })
      .join("\n") + "\n"
  );
}

const refuse = (d: string, motif: RegExp) => {
  const v = juger(d);
  expect(v.ok).toBe(false);
  expect(v.raisons.join("\n")).toMatch(motif);
};

describe("diffs acceptés", () => {
  it("un diff ordinaire (code applicatif + test)", () => {
    const v = juger(diff({ chemin: "lib/format.ts" }, { chemin: "tests/format.test.ts" }));
    expect(v).toMatchObject({ ok: true, lignes: 4 });
  });
  it("exactement 120 lignes", () => {
    expect(juger(diff({ chemin: "lib/format.ts", plus: 60, moins: 60 })).ok).toBe(true);
  });
  it("un fichier de test ajouté ou renommé dans les tests", () => {
    expect(juger(diff({ chemin: "tests/b.test.ts", de: "tests/a.test.ts" })).ok).toBe(true);
  });
});

describe("chemins protégés", () => {
  it.each([
    ".github/workflows/ci.yml",
    ".husky/pre-commit",
    ".huskyrc",
    "node_modules/.bin/tsc",
    "package.json",
    "package-lock.json",
    "scripts/fumee.mjs",
    "scripts/hooks/commit-gate.mjs",
    "qualite/seuils.json",
    "vitest.config.ts",
    "eslint.config.mjs",
    "tsconfig.json",
    ".lintstagedrc.json",
    "lint-staged.config.js",
    "outil.sh",
    "racine.mjs",
    "middleware.ts",
    "lib/authGuard.ts",
    "CLAUDE.md",
    ".claude/settings.json",
  ])("refuse %s", (chemin) => {
    refuse(diff({ chemin }), /protégé|secret|configuration/);
  });
  it.each([".env", ".env.local", "cle.pem", "app/prod.key", "config/secrets.json", "lib/token.txt"])(
    "refuse le secret %s",
    (chemin) => refuse(diff({ chemin }), /secret|protégé/),
  );
  it("refuse un fichier exécutable (mode 100755), même ordinaire", () => {
    refuse(diff({ chemin: "lib/outil.ts", mode: "100755" }), /exécutable/);
    refuse(diff({ chemin: "lib/neuf.ts", nouveau: true, mode: "100755" }), /exécutable/);
  });
  it("refuse un changement de mode", () => {
    const d = "diff --git a/lib/x.ts b/lib/x.ts\nold mode 100644\nnew mode 100755\n";
    refuse(d, /exécutable/);
  });
  it("refuse un lien symbolique et un sous-module", () => {
    refuse(diff({ chemin: "lib/lien.ts", nouveau: true, mode: "120000" }), /lien symbolique/);
    refuse(diff({ chemin: "lib/sub", nouveau: true, mode: "160000" }), /sous-module/);
  });
  it("accepte un fichier de lib/ ordinaire dont le nom ressemble à une config", () => {
    expect(juger(diff({ chemin: "lib/configuration.ts" })).ok).toBe(true);
  });
});

describe("taille, tests, renommages", () => {
  it("121 lignes refusées", () => {
    refuse(diff({ chemin: "lib/format.ts", plus: 61, moins: 60 }), /121 lignes/);
  });
  it("le nombre de lignes cumule tous les fichiers", () => {
    refuse(diff({ chemin: "lib/a.ts", plus: 40, moins: 0 }, { chemin: "lib/b.ts", plus: 40, moins: 0 }, { chemin: "lib/c.ts", plus: 41, moins: 0 }), /121/);
  });
  it("test supprimé refusé", () => {
    refuse(diff({ chemin: "tests/format.test.ts", supprime: true }), /test supprimé/);
    refuse(diff({ chemin: "lib/x.spec.ts", supprime: true }), /test supprimé/);
  });
  it("renommage vers un chemin interdit refusé", () => {
    refuse(diff({ chemin: ".github/workflows/x.yml", de: "lib/x.ts" }), /protégé/);
    refuse(diff({ chemin: "package.json", de: "lib/x.ts" }), /protégé/);
  });
  it("renommage DEPUIS un chemin protégé refusé", () => {
    refuse(diff({ chemin: "lib/x.ts", de: "package.json" }), /protégé/);
  });
  it("un test sorti du dossier de tests est refusé", () => {
    refuse(diff({ chemin: "lib/a.ts", de: "tests/a.test.ts" }), /sorti des tests/);
  });
});

describe("échec fermé", () => {
  it.each([
    ["chemin avec ..", "lib/../package.json"],
    ["chemin avec antislash", "lib\\x.ts"],
    ["chemin cité", '"lib/\\303\\251.ts"'],
  ])("%s", (_nom, chemin) => {
    expect(juger(diff({ chemin })).ok).toBe(false);
  });
  it.each(["", "   \n", "n'importe quoi\n"])("diff vide ou illisible : %j", (d) => {
    expect(juger(d).ok).toBe(false);
  });
  it("diff binaire refusé", () => {
    const d = "diff --git a/public/i.png b/public/i.png\nindex 1..2 100644\nBinary files a/public/i.png and b/public/i.png differ\n";
    refuse(d, /binaire/);
    refuse("diff --git a/lib/x.ts b/lib/x.ts\nindex 1..2 100644\nGIT binary patch\nliteral 3\n", /binaire/);
  });
  it("en-tête inconnu refusé", () => {
    refuse("diff --git a/lib/x.ts b/lib/x.ts\nbizarre\n", /inconnu/);
  });
  it("diff énorme refusé", () => {
    refuse(diff({ chemin: "lib/x.ts" }) + "x".repeat(2_100_000), /énorme/);
  });
  it("ligne inattendue dans un bloc refusée", () => {
    refuse(diff({ chemin: "lib/x.ts" }) + "?parasite\n", /inattendue/);
  });
  it("une ligne retirée qui ressemble à un en-tête compte comme une ligne", () => {
    const d = diff({ chemin: "lib/x.ts", plus: 0, moins: 0 }) + "--- a/package.json\n+++ b/package.json\n";
    const v = juger(d);
    expect(v.ok).toBe(true);
    expect(v.lignes).toBe(2);
  });
});

describe("sortie sans secret", () => {
  it("les raisons ne contiennent que des chemins, jamais le contenu", () => {
    const d = diff({ chemin: ".env" }).replace("+ligne ajoutée 0", "+TOKEN=abc123-valeur-secrete");
    const v = juger(d);
    expect(v.ok).toBe(false);
    expect(v.raisons.join("\n")).not.toContain("abc123");
  });
});

describe("CODEOWNERS", () => {
  const co = "# commentaire\n/docs/securite/ @proprio\n/lib/specifique.ts @proprio\n*.md @proprio\n";
  it("lit les motifs simples et ignore les jokers", () => {
    expect(motifsCodeowners(co)).toEqual({
      toutLeDepot: false,
      prefixes: ["docs/securite/"],
      exacts: ["lib/specifique.ts"],
    });
  });
  it("ajoute ces chemins aux chemins protégés", () => {
    expect(juger(diff({ chemin: "docs/securite/a.md" }), { codeowners: co }).ok).toBe(false);
    expect(juger(diff({ chemin: "lib/specifique.ts" }), { codeowners: co }).ok).toBe(false);
    expect(juger(diff({ chemin: "lib/autre.ts" }), { codeowners: co }).ok).toBe(true);
  });
  it("« * » protège tout", () => {
    expect(juger(diff({ chemin: "lib/autre.ts" }), { codeowners: "* @proprio\n" }).ok).toBe(false);
  });
});

describe("dejaCorrige (anti-boucle)", () => {
  it("vrai pour l'identité de l'agent, avec ou sans [bot]", () => {
    expect(dejaCorrige("atelier-agents")).toBe(true);
    expect(dejaCorrige("atelier-agents[bot]")).toBe(true);
    expect(dejaCorrige("Atelier-Agents[bot]")).toBe(true);
  });
  it("faux pour un autre auteur", () => {
    expect(dejaCorrige("MoKarade")).toBe(false);
    expect(dejaCorrige("atelier-agents-imitation")).toBe(false);
  });
  it("auteur inconnu : échec fermé, pas de 2e essai", () => {
    expect(dejaCorrige(undefined)).toBe(true);
    expect(dejaCorrige("")).toBe(true);
  });
});
