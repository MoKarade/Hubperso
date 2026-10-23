// tests/liaHubMouvement.test.ts — LIA est UNE seule, identique dans toutes les apps (Marc, 23/10/2026) :
// le mouvement et la pastille d'humeur viennent de lia-ui, le hub n'en règle aucun.
// Verrou de source : ces options ne sont lues qu'au montage par lia-ui, un test de rendu ne les verrait pas.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "..", "components", "LiaHub.tsx"), "utf8");
const paquet = readFileSync(join(__dirname, "..", "package.json"), "utf8");

describe("LiaHub : réglages communs", () => {
  it("ne règle ni le mouvement réduit ni la pastille d'humeur (défauts du paquet)", () => {
    expect(source).not.toContain("quandMouvementReduit");
    expect(source).not.toContain("humeurVisible");
  });

  it("utilise lia-ui v0.11.1 ou plus récent (mouvement complet par défaut, pastille d'humeur)", () => {
    const m = /"@mokarade\/lia-ui": "github:MoKarade\/lia-ui#v(\d+)\.(\d+)\.(\d+)"/.exec(paquet);
    expect(m).not.toBeNull();
    const [, major, minor, patch] = (m ?? []).map(Number);
    expect([major, minor, patch]).toSatisfy((v: number[]) => v[0] > 0 || v[1] > 11 || (v[1] === 11 && v[2] >= 1));
  });
});
