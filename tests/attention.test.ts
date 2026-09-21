// tests/attention.test.ts — ce qui demande une décision, rassemblé et trié.

import { describe, expect, it } from "vitest";
import type { HubAlert, HubSummary } from "@mokarade/hub-contract";
import type { HubSource } from "@/lib/sources";
import type { SummaryResult } from "@/lib/fetchSummary";
import { attentions, compteParGravite } from "@/lib/attention";

/** T0 fixe : `attentions` est pure, la date se passe en paramètre. */
const T0 = Date.UTC(2026, 8, 14, 15, 0, 0);

function source(id: string, name = id): HubSource {
  return {
    id,
    name,
    summaryUrl: `https://${id}.hubperso.com/hub/summary`,
    accueilUrl: `https://${id}.hubperso.com`,
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
    ], T0);
    expect(liste.map((e) => e.libelle)).toEqual(["grave b", "moyen c", "info a"]);
  });

  it("garde un ordre STABLE à gravité égale — sinon la liste danse à chaque poll", () => {
    // Mutation : un tri instable réordonnerait ces deux lignes d'un rafraîchissement à
    // l'autre, et on ne pourrait plus cliquer sur celle qu'on vient de lire.
    const liste = attentions([
      ok("a", [{ label: "premier", severity: "alert" }]),
      ok("b", [{ label: "second", severity: "alert" }]),
    ], T0);
    expect(liste.map((e) => e.libelle)).toEqual(["premier", "second"]);
  });

  it("filtre les href : un lien non http(s) n'est pas rendu cliquable", () => {
    const liste = attentions([
      ok("a", [{ label: "x", severity: "info", href: "javascript:alert(1)" }]),
      ok("b", [{ label: "y", severity: "info", href: "https://ok.hubperso.com/x" }]),
    ], T0);
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
    ], T0);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ gravite: "alert", duHub: true });
    expect(liste[0]!.libelle).toContain("Injoignable");
  });

  it("classe « contrat trop récent » en warn, pas en alert — l'APP va bien", () => {
    const liste = attentions([
      { state: "contract-too-new", source: source("carai"), published: 2, supported: 1 },
    ], T0);
    expect(liste[0]!.gravite).toBe("warn");
    expect(liste[0]!.libelle).toContain("re-pinner le hub");
  });

  it("IGNORE une app non configurée — c'est un choix, pas une panne", () => {
    // Mutation : la faire entrer remplirait la liste d'un bruit permanent, et une liste
    // toujours pleine ne se lit plus.
    expect(attentions([{ state: "unconfigured", manque: ["jeton"] as const, source: source("jobai") }], T0)).toEqual([]);
  });

  it("un jeton refusé et une réponse hors contrat sont graves tous les deux", () => {
    const liste = attentions([
      { state: "unauthorized", source: source("a") },
      { state: "invalid", source: source("b"), detail: "app.color: attendu #rrggbb" },
    ], T0);
    expect(liste.every((e) => e.gravite === "alert")).toBe(true);
    expect(liste[1]!.libelle).toContain("app.color");
  });
});

describe("compteParGravite", () => {
  it("compte par niveau, zéro compris", () => {
    const liste = attentions([
      ok("a", [{ label: "1", severity: "alert" }, { label: "2", severity: "alert" }]),
      ok("b", [{ label: "3", severity: "warn" }]),
    ], T0);
    expect(compteParGravite(liste)).toEqual({ alert: 2, warn: 1, info: 0 });
  });

  it("rien à signaler ⇒ trois zéros, pas un objet vide", () => {
    expect(compteParGravite([])).toEqual({ alert: 0, warn: 0, info: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// L'app qui répond très bien en servant de la donnée morte. Elle n'a aucun état d'échec et
// ne publie aucune alerte : sans ces cas, la liste reste vide et a l'air rassurante.
// ─────────────────────────────────────────────────────────────────────────────────────────

const HEURE = 3_600_000;

function okDate(
  id: string,
  dataAsOfMs: number,
  expectedMaxAgeSec?: number,
  extra: Partial<SummaryResult & { state: "ok" }> = {},
): SummaryResult {
  const base = ok(id, []);
  if (base.state !== "ok") throw new Error("impossible");
  return {
    ...base,
    summary: {
      ...base.summary,
      dataAsOf: new Date(dataAsOfMs).toISOString(),
      ...(expectedMaxAgeSec === undefined ? {} : { expectedMaxAgeSec }),
    },
    ...extra,
  };
}

describe("attentions — la donnée figée d'une app qui va bien", () => {
  it("inscrit une app dont la donnée dépasse le seuil qu'ELLE déclare", () => {
    const liste = attentions([okDate("carai", T0 - 7 * HEURE, 3600)], T0);
    expect(liste).toHaveLength(1);
    expect(liste[0]!.gravite).toBe("warn");
    expect(liste[0]!.duHub).toBe(true);
    // Les deux nombres : l'âge réel ET le seuil déclaré. L'un sans l'autre ne permet pas
    // de décider s'il faut agir.
    expect(liste[0]!.libelle).toContain("7 h");
    expect(liste[0]!.libelle).toContain("1 h");
  });

  it("n'inscrit RIEN quand la donnée est dans les limites annoncées", () => {
    expect(attentions([okDate("carai", T0 - 30 * 60_000, 3600)], T0)).toEqual([]);
  });

  it("n'inscrit RIEN quand l'app n'a pas déclaré son rythme, même très vieille", () => {
    // Discriminant : un seuil par défaut écrit dans le hub ferait apparaître ici une
    // fausse alerte pour toutes les apps pas encore re-pinnées sur la v1.3 — et ce serait
    // de la connaissance d'app codée en dur, ce que le principe n°1 interdit.
    expect(attentions([okDate("batchchef", T0 - 30 * 24 * HEURE)], T0)).toEqual([]);
  });

  it("signale une horloge d'app en avance : elle désarme toute la détection", () => {
    const liste = attentions([okDate("jobai", T0 + 5 * HEURE, 3600)], T0);
    expect(liste).toHaveLength(1);
    expect(liste[0]!.libelle).toContain("en avance");
  });

  it("ne juge PAS la fraîcheur d'un résumé servi depuis le cache de résilience", () => {
    // Le `dataAsOf` d'un résumé en cache est celui du dernier instantané REÇU. Le juger
    // accuserait l'app d'un gel qui est en réalité une panne de réponse — déjà affichée
    // ailleurs par le badge « En cache ».
    const liste = attentions(
      [okDate("driveai", T0 - 7 * HEURE, 3600, { stale: true, cachedAgeMs: 10 * 60_000 })],
      T0,
    );
    expect(liste).toEqual([]);
  });

  it("le gel s'ajoute aux alertes publiées, il ne les remplace pas", () => {
    const base = ok("carai", [{ label: "pneus bas", severity: "alert" }]);
    if (base.state !== "ok") throw new Error("impossible");
    const avecDate: SummaryResult = {
      ...base,
      summary: {
        ...base.summary,
        dataAsOf: new Date(T0 - 7 * HEURE).toISOString(),
        expectedMaxAgeSec: 3600,
      },
    };
    const liste = attentions([avecDate], T0);
    expect(liste.map((e) => e.gravite)).toEqual(["alert", "warn"]);
    expect(liste[0]!.libelle).toBe("pneus bas");
  });
});
