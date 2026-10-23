// tests/liaContexte.test.ts — le bilan d'état des apps joint à l'assistant LIA.
//
// Un historique vide doit donner « sans historique (aucun relevé lu) » pour chaque app,
// le texte commence par l'en-tête du bilan et sa longueur reste sous CONTEXTE_MAX.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/historiqueDb", () => ({
  lireHistoriqueTous: async () => new Map(),
}));

vi.mock("@/lib/horloge", () => ({
  maintenantMs: () => Date.parse("2026-10-16T14:00:00Z"),
}));

import { CONTEXTE_MAX } from "@/lib/bilanEtat";
import { contexteEtatApps } from "@/lib/liaContexte";
import { SOURCE_DEFS } from "@/lib/sources";

describe("contexteEtatApps", () => {
  it("rend un bilan sans historique pour chaque app quand la base est vide, sous CONTEXTE_MAX", async () => {
    const texte = await contexteEtatApps();

    expect(texte.startsWith("Bilan d'état des apps d'après les relevés du hub")).toBe(true);

    for (const d of SOURCE_DEFS) {
      expect(texte).toContain(`${d.name} : sans historique (aucun relevé lu).`);
    }

    expect(texte.length).toBeLessThanOrEqual(CONTEXTE_MAX);
  });
});
