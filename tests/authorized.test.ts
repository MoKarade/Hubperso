import { describe, it, expect } from "vitest";
import { isAuthorizedEmail } from "../lib/authorized";

const PROPRIETAIRE = "marc.richard4@gmail.com";

describe("isAuthorizedEmail", () => {
  it("accepte l'adresse autorisée (match exact)", () => {
    expect(isAuthorizedEmail("marc.richard4@gmail.com", PROPRIETAIRE)).toBe(true);
  });

  it("normalise la casse et les espaces des deux côtés", () => {
    expect(isAuthorizedEmail("  Marc.Richard4@Gmail.com  ", PROPRIETAIRE)).toBe(true);
    expect(isAuthorizedEmail(PROPRIETAIRE, "  MARC.RICHARD4@GMAIL.COM ")).toBe(true);
  });

  it("refuse toute autre adresse", () => {
    expect(isAuthorizedEmail("intrus@gmail.com", PROPRIETAIRE)).toBe(false);
    expect(isAuthorizedEmail("marc.richard4@outlook.com", PROPRIETAIRE)).toBe(false);
    expect(isAuthorizedEmail("marc.richard@gmail.com", PROPRIETAIRE)).toBe(false);
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
