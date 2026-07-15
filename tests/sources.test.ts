import { describe, it, expect } from "vitest";
import { getSources } from "../lib/sources";

describe("getSources", () => {
  it("expose financeai et driveai avec les URLs par défaut et aucun jeton", () => {
    const sources = getSources({});
    expect(sources.map((s) => s.id)).toEqual(["financeai", "driveai"]);
    expect(sources[0]?.summaryUrl).toBe("https://finance.hubperso.com/hub/summary");
    expect(sources[1]?.summaryUrl).toBe("https://drive.hubperso.com/hub/summary");
    expect(sources.every((s) => s.token === null)).toBe(true);
  });

  it("lit les jetons depuis l'environnement", () => {
    const sources = getSources({
      HUB_TOKEN_FINANCEAI: "jeton-finance",
      HUB_TOKEN_DRIVEAI: "jeton-drive",
    });
    expect(sources[0]?.token).toBe("jeton-finance");
    expect(sources[1]?.token).toBe("jeton-drive");
  });

  it("permet de surcharger l'URL (app pas encore sur son domaine final)", () => {
    const sources = getSources({
      FINANCEAI_SUMMARY_URL: "https://financeai-mcp.run.app/hub/summary",
    });
    expect(sources[0]?.summaryUrl).toBe("https://financeai-mcp.run.app/hub/summary");
  });

  it("ignore les valeurs vides ou en espaces (retombe sur le défaut / null)", () => {
    const sources = getSources({ HUB_TOKEN_FINANCEAI: "  ", FINANCEAI_SUMMARY_URL: "" });
    expect(sources[0]?.token).toBeNull();
    expect(sources[0]?.summaryUrl).toBe("https://finance.hubperso.com/hub/summary");
  });
});
