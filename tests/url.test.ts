import { describe, it, expect } from "vitest";
import { safeHttpUrl } from "../lib/url";

describe("safeHttpUrl", () => {
  it("accepte http et https", () => {
    expect(safeHttpUrl("https://finance.hubperso.com")).toBe("https://finance.hubperso.com/");
    expect(safeHttpUrl("http://x.test/a")).toBe("http://x.test/a");
  });

  it("rejette les schémas dangereux (javascript:, data:, file:)", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejette un chemin relatif (pas d'URL absolue)", () => {
    expect(safeHttpUrl("/imports")).toBeNull();
  });

  it("rejette null, undefined et vide", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
  });
});
