import { execSync } from "child_process";
import { describe, expect, it } from "vitest";

describe("scripts/build-necessaire.sh", () => {
  it("affiche l'avertissement Vercel et sort avec 0 lorsque le build est ignoré", () => {
    // On mock git diff dans un sous-shell bash pour renvoyer uniquement des fichiers .md
    const command = `bash -c '
      git() {
        if [ "$1" = "rev-parse" ]; then return 0; fi
        if [ "$1" = "diff" ]; then echo "docs/test.md"; return 0; fi
        command git "$@"
      }
      export -f git
      bash scripts/build-necessaire.sh BASE TETE
    '`;

    const stdout = execSync(command, { encoding: "utf-8" });

    expect(stdout).toContain("build ignoré : documentation et tests uniquement");
    expect(stdout).toContain("Si une variable d'environnement a changé sur Vercel, un Redeploy de ce commit ne reconstruira pas");
    expect(stdout).toContain("Pousser un commit de code pour forcer le build");
  });
});
