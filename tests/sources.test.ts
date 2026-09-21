import { describe, it, expect } from "vitest";
import { getSources } from "../lib/sources";

describe("getSources", () => {
  it("expose les six apps avec les URLs par défaut et aucun jeton", () => {
    const sources = getSources({});
    expect(sources.map((s) => s.id)).toEqual([
      "financeai",
      "driveai",
      "batchchef",
      "carai",
      "jobai",
      "memoryai",
    ]);
    // ⚠️ FinanceAI : `null`, PAS une URL. Voir le bloc dédié plus bas.
    expect(sources[0]?.summaryUrl).toBeNull();
    expect(sources[1]?.summaryUrl).toBe("https://drive.hubperso.com/hub/summary");
    expect(sources[2]?.summaryUrl).toBe("https://batchchef.hubperso.com/api/hub/summary");
    expect(sources[3]?.summaryUrl).toBe("https://carai.hubperso.com/hub/summary");
    expect(sources[4]?.summaryUrl).toBe("https://emploi.hubperso.com/api/hub/summary");
    expect(sources[5]?.summaryUrl).toBe("https://memoryai.hubperso.com/hub/summary");
    expect(sources.every((s) => s.token === null)).toBe(true);
  });

  it("lit les jetons depuis l'environnement", () => {
    const sources = getSources({
      HUB_TOKEN_FINANCEAI: "jeton-finance",
      HUB_TOKEN_DRIVEAI: "jeton-drive",
      HUB_TOKEN_BATCHCHEF: "jeton-batch",
      HUB_TOKEN_CARAI: "jeton-car",
      HUB_TOKEN_JOBAI: "jeton-job",
      HUB_TOKEN_MEMORYAI: "jeton-memoire",
    });
    expect(sources[0]?.token).toBe("jeton-finance");
    expect(sources[1]?.token).toBe("jeton-drive");
    expect(sources[2]?.token).toBe("jeton-batch");
    expect(sources[3]?.token).toBe("jeton-car");
    expect(sources[4]?.token).toBe("jeton-job");
    expect(sources[5]?.token).toBe("jeton-memoire");
  });

  it("permet de surcharger l'URL (app pas encore sur son domaine final)", () => {
    const sources = getSources({
      FINANCEAI_SUMMARY_URL: "https://financeai-mcp.run.app/hub/summary",
    });
    expect(sources[0]?.summaryUrl).toBe("https://financeai-mcp.run.app/hub/summary");
  });

  it("ignore les valeurs vides ou en espaces (retombe sur le défaut / null)", () => {
    const sources = getSources({ HUB_TOKEN_DRIVEAI: "  ", DRIVEAI_SUMMARY_URL: "" });
    expect(sources[1]?.token).toBeNull();
    expect(sources[1]?.summaryUrl).toBe("https://drive.hubperso.com/hub/summary");
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

  // ── FinanceAI n'a PAS d'URL de résumé par défaut ────────────────────────────────────
  //
  // POURQUOI (21/09/2026, mesuré) : ce champ valait `https://finance.hubperso.com/hub/summary`
  // — le SITE de l'app, pas son endpoint de contrat. FinanceAI ne publie pas son résumé
  // depuis son site : les données ne quittent pas la machine de Marc, donc le résumé vient
  // d'un serveur MCP auto-hébergé. L'URL par défaut répondait donc **200 avec `<!DOCTYPE
  // html>`**, et le hub affichait « réponse non conforme au contrat » : un diagnostic qui
  // accuse l'app et envoie corriger le mauvais dépôt.
  //
  // ⚠️ Ces assertions portent le FAIT (« sans la variable, on n'interroge RIEN »), pas la
  // forme : une future URL stable se poserait ici en connaissance de cause, en réécrivant
  // ce bloc — pas en le contournant.
  describe("FinanceAI : aucune URL par défaut, par décision", () => {
    it("n'a pas d'URL tant que FINANCEAI_SUMMARY_URL n'est pas posée", () => {
      const sans = getSources({ HUB_TOKEN_FINANCEAI: "jeton" })[0];
      expect(sans?.summaryUrl).toBeNull();
      // Et surtout : l'ancien défaut ne doit REVENIR par aucun chemin.
      expect(JSON.stringify(getSources({}))).not.toContain(
        "finance.hubperso.com/hub/summary",
      );
    });

    it("CONTRÔLE NÉGATIF : la variable posée rend bien la source interrogeable", () => {
      // Sans ce cas, « summaryUrl est null » serait aussi vrai d'un champ qu'on aurait
      // simplement cassé.
      const avec = getSources({
        HUB_TOKEN_FINANCEAI: "jeton",
        FINANCEAI_SUMMARY_URL: "https://mcp.example/hub/summary",
      })[0];
      expect(avec?.summaryUrl).toBe("https://mcp.example/hub/summary");
    });

    it("garde quand même l'adresse HUMAINE de l'app (la palette en a besoin)", () => {
      // C'est la moitié qu'un simple `defaultUrl: null` aurait PERDUE : la palette de
      // commandes ouvre la page de l'app avant tout fetch, et elle la dérivait de l'URL
      // de résumé. Deux besoins, deux champs.
      expect(getSources({})[0]?.accueilUrl).toBe("https://finance.hubperso.com");
    });
  });

  it("toute app AUTRE que FinanceAI garde une URL de résumé par défaut", () => {
    // Anti-vacuité de la règle ci-dessus : si un lot futur mettait tous les défauts à
    // `null`, les assertions de FinanceAI resteraient vertes et le hub n'interrogerait
    // plus personne.
    const autres = getSources({}).filter((s) => s.id !== "financeai");
    expect(autres.length).toBeGreaterThan(0);
    expect(autres.every((s) => typeof s.summaryUrl === "string")).toBe(true);
  });

  it("le héros ne dépend ni de l'environnement ni des données", () => {
    const avecJetons = getSources({ HUB_TOKEN_DRIVEAI: "x", HUB_TOKEN_JOBAI: "y" });
    expect(avecJetons.filter((s) => s.hero).map((s) => s.id)).toEqual(["financeai"]);
  });
});
