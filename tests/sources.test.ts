import { describe, it, expect } from "vitest";
import { getSources } from "../lib/sources";

describe("getSources", () => {
  it("expose les cinq apps avec les URLs par défaut et aucun jeton", () => {
    const sources = getSources({});
    expect(sources.map((s) => s.id)).toEqual([
      "financeai",
      "driveai",
      "batchchef",
      "carai",
      "jobai",
    ]);
    expect(sources[0]?.summaryUrl).toBe("https://finance.hubperso.com/hub/summary");
    expect(sources[1]?.summaryUrl).toBe("https://drive.hubperso.com/hub/summary");
    expect(sources[2]?.summaryUrl).toBe("https://batchchef-glu8-chi.vercel.app/api/hub/summary");
    expect(sources[3]?.summaryUrl).toBe("https://carai.hubperso.com/hub/summary");
    expect(sources[4]?.summaryUrl).toBe("https://emploi.hubperso.com/api/hub/summary");
    expect(sources.every((s) => s.token === null)).toBe(true);
  });

  it("lit les jetons depuis l'environnement", () => {
    const sources = getSources({
      HUB_TOKEN_FINANCEAI: "jeton-finance",
      HUB_TOKEN_DRIVEAI: "jeton-drive",
      HUB_TOKEN_BATCHCHEF: "jeton-batch",
      HUB_TOKEN_CARAI: "jeton-car",
      HUB_TOKEN_JOBAI: "jeton-job",
    });
    expect(sources[0]?.token).toBe("jeton-finance");
    expect(sources[1]?.token).toBe("jeton-drive");
    expect(sources[2]?.token).toBe("jeton-batch");
    expect(sources[3]?.token).toBe("jeton-car");
    expect(sources[4]?.token).toBe("jeton-job");
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

  // VERROU DU RENDU EN FLUX. La grille réserve une tuile 2×2 pour le héros AVANT le moindre
  // fetch. S'il y en avait deux, deux tuiles doubles se disputeraient la place ; s'il n'y en
  // avait aucune, la grille perdrait sa hiérarchie sans que rien ne le signale. Ce test casse
  // le jour où quelqu'un ajoute une app en recopiant l'entrée de FinanceAI (`hero: true`)
  // sans l'enlever — l'erreur la plus probable en ajoutant une source.
  it("expose EXACTEMENT un héros", () => {
    const heroes = getSources({}).filter((s) => s.hero);
    expect(heroes).toHaveLength(1);
    expect(heroes[0]?.id).toBe("financeai");
  });

  it("le héros ne dépend ni de l'environnement ni des données", () => {
    const avecJetons = getSources({ HUB_TOKEN_DRIVEAI: "x", HUB_TOKEN_JOBAI: "y" });
    expect(avecJetons.filter((s) => s.hero).map((s) => s.id)).toEqual(["financeai"]);
  });
});
