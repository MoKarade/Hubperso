// tests/coutsCi.test.ts — réduction du coût CI (reprise de PR #87 après le conflit avec le kit
// auto-merge #89) : renommage `constellation` → `outil:constellation`, docs/couts.md, et la voie
// rapide doc-seule de ci.yml. Les tests d'épinglage SHA vivent dans kitAutoMerge.test.ts.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("le script npm est renommé outil:constellation", () => {
  const pkg = JSON.parse(lire("package.json")) as { scripts: Record<string, string> };

  it("package.json porte le nouveau nom, plus l'ancien", () => {
    expect(pkg.scripts["outil:constellation"]).toBe("tsx scripts/verifier-constellation.ts");
    expect(pkg.scripts).not.toHaveProperty("constellation");
  });

  it("constellation.yml appelle le nouveau nom", () => {
    expect(lire(".github/workflows/constellation.yml")).toContain("npm run outil:constellation");
    expect(lire(".github/workflows/constellation.yml")).not.toContain("npm run constellation\n");
  });

  it("la doc ne cite plus l'ancien nom (CLAUDE.md, la référence, l'ADR)", () => {
    for (const chemin of ["CLAUDE.md", "docs/reference-claude.md", "docs/adr/0003-le-hub-a-sa-propre-horloge.md"]) {
      expect(lire(chemin), chemin).not.toContain("npm run constellation");
      expect(lire(chemin), chemin).not.toMatch(/`constellation`\s*\n?\(6 apps/);
    }
  });
});

describe("docs/couts.md — les crons et leur coût", () => {
  it("existe et n'est pas vide", () => {
    expect(existsSync("docs/couts.md")).toBe(true);
    expect(lire("docs/couts.md").length).toBeGreaterThan(0);
  });

  const doc = lire("docs/couts.md");

  it("liste les quatre crons avec leur valeur réelle (celle des fichiers, pas une valeur inventée)", () => {
    expect(doc).toContain("*/30 * * * *");
    expect(doc).toContain("23 9 * * *");
    expect(doc).toContain("17 11 * * *");
    expect(doc).toContain("0 12 * * 1");
  });

  it("ne prétend aucun coût mesuré qu'on n'a pas — « à mesurer » partout où rien n'a été mesuré", () => {
    expect(doc).toContain("à mesurer");
  });

  it("documente la voie rapide doc-seule de ci.yml", () => {
    expect(doc).toMatch(/voie rapide/i);
    expect(doc).toContain("Sécurité");
  });

  it("dit honnêtement que ci.yml n'est pas encore épinglé", () => {
    expect(doc).toContain("`ci.yml` n'est PAS encore épinglé");
  });
});

describe("ci.yml — voie rapide doc seule (coût CI)", () => {
  const w = lire(".github/workflows/ci.yml");

  it("aucun `paths:` sur le déclencheur (sinon un contrôle requis ne tournerait jamais sur une PR de code)", () => {
    const entete = w.slice(0, w.indexOf("\nconcurrency:"));
    expect(entete).not.toMatch(/^\s*paths:/m);
  });

  it("garde son concurrency et son cancel-in-progress intacts", () => {
    expect(w).toContain("group: ci-${{ github.ref }}");
    expect(w).toContain("cancel-in-progress: true");
  });

  it("le job `fichiers` ne tourne que sur pull_request et lit les fichiers via l'API (pas de checkout)", () => {
    const bloc = w.slice(w.indexOf("\n  fichiers:"), w.indexOf("\n  gate:"));
    expect(bloc).toContain("if: github.event_name == 'pull_request'");
    expect(bloc).toContain("gh pr diff");
    expect(bloc).not.toContain("actions/checkout");
    expect(bloc).toContain("doc_seule");
  });

  it.each(["gate", "qualite", "audit"])("le job %s dépend de `fichiers` et se saute seulement sur doc_seule confirmé", (nom) => {
    const debut = w.indexOf(`\n  ${nom}:`);
    const finRecherche = nom === "qualite" ? "\n  securite:" : nom === "gate" ? "\n  audit:" : "\n  # ---";
    const bloc = w.slice(debut, w.indexOf(finRecherche));
    expect(bloc, nom).toContain("needs: fichiers");
    expect(bloc, nom).toContain("needs.fichiers.result != 'success'");
    expect(bloc, nom).toContain("needs.fichiers.outputs.doc_seule != 'true'");
  });

  it("le job securite ne dépend PAS de `fichiers` — jamais sauté sur une PR doc seule", () => {
    const bloc = w.slice(w.indexOf("\n  securite:"));
    expect(bloc).not.toContain("needs: fichiers");
    expect(bloc).not.toContain("doc_seule");
    expect(bloc).toContain("if: github.event_name != 'schedule'");
  });

  it("« La doc suit le code » vit dans un workflow séparé, jamais conditionné par doc_seule", () => {
    const doc = lire(".github/workflows/doc-a-jour.yml");
    expect(doc).not.toContain("doc_seule");
    expect(doc).toContain("La doc suit le code");
  });
});

describe("releve.yml et constellation.yml gardent leur cadence (décision de Marc non confirmée)", () => {
  it("releve.yml reste sur */30 — protégé, une décision de Marc est en attente ailleurs", () => {
    expect(lire(".github/workflows/releve.yml")).toContain('cron: "*/30 * * * *"');
  });

  it("constellation.yml reste quotidien — le passage à l'horaire n'a pas été confirmé par Marc", () => {
    expect(lire(".github/workflows/constellation.yml")).toContain('cron: "17 11 * * *"');
  });
});
