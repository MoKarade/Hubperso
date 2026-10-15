import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lit seulement la feuille de style du dépôt : aucun état du PC.
const css = readFileSync("app/globals.css", "utf8");

describe("ligne du quota sur la carte Coûts", () => {
  it("passe à la ligne et garde un espace entre le nom et le chiffre", () => {
    const regle = css.match(/\.couts__quotatop\s*\{[^}]*\}/)?.[0] ?? "";
    expect(regle).toMatch(/flex-wrap:\s*wrap/);
    expect(regle).toMatch(/gap:/);
  });
});
