// tests/vercelJson.test.ts — pas de préversion pour les branches d'agents et de Dependabot.
// Syntaxe vérifiée dans la doc Vercel (git.deploymentEnabled, motifs minimatch) : `*` ne franchit
// pas `/`, donc `agence/*` ne couvrirait pas `agence/<session>/<sujet>` — d'où `**`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vercel.json", () => {
  const conf = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    git: { deploymentEnabled: Record<string, boolean> };
    ignoreCommand?: string;
  };

  it("ne déploie ni claude/*, ni agence/**, ni dependabot/**", () => {
    expect(conf.git.deploymentEnabled).toMatchObject({
      "claude/*": false,
      "agence/**": false,
      "dependabot/**": false,
    });
  });

  it("garde l'ignoreCommand existant (docs seules : pas de build)", () => {
    expect(conf.ignoreCommand).toBe("bash scripts/build-necessaire.sh");
  });
});
