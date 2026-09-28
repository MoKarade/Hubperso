// .github/workflows/constellation.yml doit interroger TOUTES les apps déclarées dans
// lib/sources.ts, pas seulement celles qui existaient au moment où le workflow a été
// écrit.
//
// ── POURQUOI CE TEST EXISTE ─────────────────────────────────────────────────────────
//
// MemoryAI a été ajoutée à `lib/sources.ts` (`tokenEnv: "HUB_TOKEN_MEMORYAI"`), mais
// `constellation.yml` ne passait que les cinq jetons des apps précédentes à
// `npm run constellation` — oubli confirmé par pole-architecture (vague 2, 28/09/2026).
// Le script (`scripts/verifier-constellation.ts`) lit `process.env` : sans la ligne `env:`
// correspondante dans le workflow, MemoryAI serait simplement absente du contrôle
// quotidien de cohérence, sans qu'aucun test ne le voie — même genre d'écart que celui que
// `tests/envExample.test.ts` empêche pour `.env.example`. Ce test fait la même chose pour
// le workflow.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SOURCE_DEFS } from "../lib/sources";

const workflow = readFileSync(
  fileURLToPath(new URL("../.github/workflows/constellation.yml", import.meta.url)),
  "utf8",
);

describe("constellation.yml interroge toutes les apps déclarées", () => {
  it("passe le jeton de chaque app en variable d'environnement", () => {
    const manquants = SOURCE_DEFS.filter((d) => !workflow.includes(d.tokenEnv)).map(
      (d) => d.tokenEnv,
    );
    expect(manquants).toEqual([]);
  });

  it("lit chaque jeton depuis les secrets du dépôt, pas une valeur en dur", () => {
    for (const d of SOURCE_DEFS) {
      expect(workflow).toContain(`${d.tokenEnv}: \${{ secrets.${d.tokenEnv} }}`);
    }
  });

  it("anti-vacuité : il y a bien plusieurs apps à vérifier", () => {
    expect(SOURCE_DEFS.length).toBeGreaterThanOrEqual(6);
  });
});
