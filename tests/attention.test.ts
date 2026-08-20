// tests/attention.test.ts — ce qui demande une décision, rassemblé et trié.

import { describe, expect, it } from "vitest";
import type { HubAlert, HubSummary } from "@mokarade/hub-contract";
import type { HubSource } from "@/lib/sources";
import type { SummaryResult } from "@/lib/fetchSummary";
import { attentions, compteParGravite } from "@/lib/attention";

function source(id: string, name = id): HubSource {
  return {
    id,
    name,
    summaryUrl: `https://${id}.hubperso.com/hub/summary`,
    token: "jeton",
    hero: false,
  };
}

function ok(id: string, alerts: HubAlert[]): SummaryResult {
  const summary: HubSummary = {
    contractVersion: 1,
    app: { id, name: id.toUpperCase(), url: `https://${id}.hubperso.com`, color: "#123456" },
    generatedAt: new Date().toISOString(),
    status: "ok",
    metrics: [],
    alerts,
    actions: [],
  };
  return { state: "ok", source: source(id), summary };
}

describe("attentions — les alertes publiées", () => {
  it("rassemble les cinq apps et trie le plus grave d'abord", () => {
    const liste = attentions([
      ok("a", [{ label: "info a", severity: "info" }]),
      ok("b", [{ label: "grave b", severity: "alert" }]),
      ok("c", [{ label: "moyen c", severity: "warn" }]),
    ]);
    expect(liste.map((e) => e.libelle)).toEqual(["grave b", "moyen c", "info a"]);
  });

  it("garde un ordre STABLE à gravité égale — sinon la liste danse à chaque poll", () => {
    // Mutation : un tri instable réordonnerait ces deux lignes d'un rafraîchissement à
    // l'autre, et on ne pourrait plus cliquer sur celle qu'on vient de lire.
    const liste = attentions([
      ok("a", [{ label: "premier", severity: "alert" }]),
      ok("b", [{ label: "second", severity: "alert" }]),
    ]);
    expect(liste.map((e) => e.libelle)).toEqual(["premier", "second"]);
  });

  it("filtre les href : un lien non http(s) n'est pas rendu cliquable", () => {
    const liste = attentions([
      ok("a", [{ label: "x", severity: "info", href: "javascript:alert(1)" }]),
      ok("b", [{ label: "y", severity: "info", href: "https://ok.hubperso.com/x" }]),
    ]);
    expect(liste.find((e) => e.libelle === "x")!.href).toBeNull();
    expect(liste.find((e) => e.libelle === "y")!.href).toBe("https://ok.hubperso.com/x");
  });
});

describe("attentions — les apps MUETTES, qui sont tout l'intérêt", () => {
  it("fait entrer une app injoignable, qui ne publie aucune alerte", () => {
    // Le piège que cette fonction existe pour éviter : un agrégat qui ne lirait que les
    // `alerts` du contrat serait SILENCIEUX exactement quand une app tombe — et il aurait
    // l'air rassurant, ce qui est pire que rien.
    const liste = attentions([
      { state: "unreachable", source: source("driveai"), detail: "délai dépassé (9000 ms)" },
    ]);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ gravite: "alert", duHub: true });
    expect(liste[0]!.libelle).toContain("Injoignable");
  });

  it("classe « contrat trop récent » en warn, pas en alert — l'APP va bien", () => {
    const liste = attentions([
      { state: "contract-too-new", source: source("carai"), published: 2, supported: 1 },
    ]);
    expect(liste[0]!.gravite).toBe("warn");
    expect(liste[0]!.libelle).toContain("re-pinner le hub");
  });

  it("IGNORE une app non configurée — c'est un choix, pas une panne", () => {
    // Mutation : la faire entrer remplirait la liste d'un bruit permanent, et une liste
    // toujours pleine ne se lit plus.
    expect(attentions([{ state: "unconfigured", source: source("jobai") }])).toEqual([]);
  });

  it("un jeton refusé et une réponse hors contrat sont graves tous les deux", () => {
    const liste = attentions([
      { state: "unauthorized", source: source("a") },
      { state: "invalid", source: source("b"), detail: "app.color: attendu #rrggbb" },
    ]);
    expect(liste.every((e) => e.gravite === "alert")).toBe(true);
    expect(liste[1]!.libelle).toContain("app.color");
  });
});

describe("compteParGravite", () => {
  it("compte par niveau, zéro compris", () => {
    const liste = attentions([
      ok("a", [{ label: "1", severity: "alert" }, { label: "2", severity: "alert" }]),
      ok("b", [{ label: "3", severity: "warn" }]),
    ]);
    expect(compteParGravite(liste)).toEqual({ alert: 2, warn: 1, info: 0 });
  });

  it("rien à signaler ⇒ trois zéros, pas un objet vide", () => {
    expect(compteParGravite([])).toEqual({ alert: 0, warn: 0, info: 0 });
  });
});
