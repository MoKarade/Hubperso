import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lit seulement le code source de la page : aucun état du PC, aucune base.
const page = readFileSync("app/administration/page.tsx", "utf8");

describe("formulaire d'ajout d'Administration", () => {
  it("donne un libellé visible à chaque champ", () => {
    expect(page).toContain("Adresse courriel");
    expect(page).toContain("Nom (facultatif)");
    expect(page).not.toContain('placeholder="nom (facultatif)"');
  });

  it("enveloppe chaque champ dans un label", () => {
    expect(page.match(/<label className="admin__champ">/g)).toHaveLength(2);
  });
});
