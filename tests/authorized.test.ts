import { describe, it, expect } from "vitest";
import { isAuthorizedEmail } from "../lib/authorized";

const ALLOWED = "marc.richard4@gmail.com";

describe("isAuthorizedEmail", () => {
  it("accepte l'adresse autorisée (match exact)", () => {
    expect(isAuthorizedEmail("marc.richard4@gmail.com", ALLOWED)).toBe(true);
  });

  it("normalise la casse et les espaces des deux côtés", () => {
    expect(isAuthorizedEmail("  Marc.Richard4@Gmail.com  ", ALLOWED)).toBe(true);
    expect(isAuthorizedEmail(ALLOWED, "  MARC.RICHARD4@GMAIL.COM ")).toBe(true);
  });

  it("refuse toute autre adresse", () => {
    expect(isAuthorizedEmail("intrus@gmail.com", ALLOWED)).toBe(false);
    expect(isAuthorizedEmail("marc.richard4@outlook.com", ALLOWED)).toBe(false);
    expect(isAuthorizedEmail("marc.richard@gmail.com", ALLOWED)).toBe(false);
  });

  it("refuse quand l'email candidat est absent ou vide", () => {
    expect(isAuthorizedEmail(null, ALLOWED)).toBe(false);
    expect(isAuthorizedEmail(undefined, ALLOWED)).toBe(false);
    expect(isAuthorizedEmail("", ALLOWED)).toBe(false);
    expect(isAuthorizedEmail("   ", ALLOWED)).toBe(false);
  });

  it("refuse si l'allowlist n'est pas configurée (jamais d'accès ouvert par défaut)", () => {
    expect(isAuthorizedEmail(ALLOWED, null)).toBe(false);
    expect(isAuthorizedEmail(ALLOWED, undefined)).toBe(false);
    expect(isAuthorizedEmail(ALLOWED, "")).toBe(false);
  });
});
