import { describe, it, expect } from "vitest";
import { isAuthorizedEmail } from "../lib/authorized";

const PROPRIETAIRE = "proprietaire@exemple.com";

describe("isAuthorizedEmail", () => {
  it("accepte l'adresse autorisée (match exact)", () => {
    expect(isAuthorizedEmail("proprietaire@exemple.com", PROPRIETAIRE)).toBe(true);
  });

  it("normalise la casse et les espaces des deux côtés", () => {
    expect(isAuthorizedEmail("  Proprietaire@Exemple.com  ", PROPRIETAIRE)).toBe(true);
    expect(isAuthorizedEmail(PROPRIETAIRE, "  PROPRIETAIRE@EXEMPLE.COM ")).toBe(true);
  });

  it("refuse toute autre adresse", () => {
    expect(isAuthorizedEmail("intrus@gmail.com", PROPRIETAIRE)).toBe(false);
    expect(isAuthorizedEmail("proprietaire@exemple.org", PROPRIETAIRE)).toBe(false);
    expect(isAuthorizedEmail("proprietair@exemple.com", PROPRIETAIRE)).toBe(false);
  });

  it("refuse quand l'email candidat est absent ou vide", () => {
    expect(isAuthorizedEmail(null, PROPRIETAIRE)).toBe(false);
    expect(isAuthorizedEmail(undefined, PROPRIETAIRE)).toBe(false);
    expect(isAuthorizedEmail("", PROPRIETAIRE)).toBe(false);
    expect(isAuthorizedEmail("   ", PROPRIETAIRE)).toBe(false);
  });

  it("refuse si l'allowlist n'est pas configurée (jamais d'accès ouvert par défaut)", () => {
    expect(isAuthorizedEmail(PROPRIETAIRE, null)).toBe(false);
    expect(isAuthorizedEmail(PROPRIETAIRE, undefined)).toBe(false);
    expect(isAuthorizedEmail(PROPRIETAIRE, "")).toBe(false);
  });
});
