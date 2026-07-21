import { describe, it, expect } from "vitest";
import { isAuthConfigured } from "../lib/authConfigured";

describe("isAuthConfigured", () => {
  it("true quand secret ET allowlist sont présents", () => {
    expect(
      isAuthConfigured({ AUTH_SECRET: "s3cret", AUTHORIZED_EMAIL: "marc@ex.com" }),
    ).toBe(true);
  });

  it("false quand AUTH_SECRET manque ou est vide (fail-closed)", () => {
    expect(isAuthConfigured({ AUTHORIZED_EMAIL: "marc@ex.com" })).toBe(false);
    expect(
      isAuthConfigured({ AUTH_SECRET: "   ", AUTHORIZED_EMAIL: "marc@ex.com" }),
    ).toBe(false);
  });

  it("false quand AUTHORIZED_EMAIL manque ou est vide (fail-closed)", () => {
    expect(isAuthConfigured({ AUTH_SECRET: "s3cret" })).toBe(false);
    expect(isAuthConfigured({ AUTH_SECRET: "s3cret", AUTHORIZED_EMAIL: "" })).toBe(
      false,
    );
  });

  it("false quand rien n'est configuré", () => {
    expect(isAuthConfigured({})).toBe(false);
  });
});
