// tests/liaHubMouvement.test.ts — LIA du hub joue toutes ses animations, même quand le navigateur de
// Marc annonce `prefers-reduced-motion` (décision de Marc, 23/10/2026 : « je veux tout »).
// Verrou de source : l'option est lue une seule fois au montage par lia-ui, un test de rendu ne la verrait pas.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "..", "components", "LiaHub.tsx"), "utf8");

describe("LiaHub : mouvement", () => {
  it("passe quandMouvementReduit=\"complet\" à <Lia>", () => {
    expect(source).toContain('quandMouvementReduit="complet"');
  });

  it("n'a qu'un seul réglage de mouvement (pas de valeur contradictoire)", () => {
    expect(source.match(/quandMouvementReduit/g)).toHaveLength(1);
  });
});
