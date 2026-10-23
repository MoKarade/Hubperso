// tests/carteMaquette.test.ts — la carte d'app selon la maquette validée par Marc (22/10) :
// un gros chiffre, un mot d'état, des mesures en lignes, deux boutons (Détail, Ouvrir).
//
// HTML statique (même méthode que tests/composantsAffichage.test.ts). Données fictives : les
// valeurs ne servent qu'à vérifier ce qui est rendu et ce qui NE l'est pas.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HubSummary } from "@mokarade/hub-contract";
import { AppWidget } from "@/components/AppWidget";
import type { SummaryResult } from "@/lib/fetchSummary";
import { hubSource, validSummary } from "./helpers";

vi.mock("@/app/actions", () => ({ actionDeclencher: vi.fn() }));

const MAINTENANT = Date.parse("2026-07-15T12:05:00.000Z");
const CSS = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

function rendre(result: SummaryResult): string {
  return renderToStaticMarkup(h(AppWidget, { result, maintenantMs: MAINTENANT })).replace(
    /<!-- -->/g,
    "",
  );
}
const ok = (over: Partial<HubSummary> = {}): SummaryResult => ({
  state: "ok",
  source: hubSource(),
  summary: validSummary(over),
});

describe("carte d'une app à jour", () => {
  const html = rendre(
    ok({
      metrics: [
        { label: "Valeur nette", value: 42, format: "number", primary: true },
        { label: "Comptes suivis", value: 6, format: "number" },
      ],
    }),
  );

  it("montre le gros chiffre, son libellé, le mot d'état et les mesures", () => {
    expect(html).toContain('class="heros__valeur">42<');
    expect(html).toContain("Valeur nette");
    expect(html).toContain("À jour");
    expect(html).toContain("Comptes suivis");
  });

  it("a deux boutons au pied : « Détail » dans le hub, « Ouvrir » vers l'app, sans onglet neuf", () => {
    expect(html).toContain('<footer class="widget__foot">');
    expect(html).toContain('class="widget__detail"');
    expect(html).toContain('href="/app/financeai"');
    expect(html).toContain('aria-label="Détail de FinanceAI"');
    expect(html).toContain('class="widget__ouvrir" href="https://finance.hubperso.com/"');
    expect(html).toContain('aria-label="Ouvrir FinanceAI"');
    // [PWA-ANDROID] : une navigation de premier niveau, pas un `_blank`.
    expect(html).not.toContain("target=");
  });

  it("l'écart est dit avant la courbe", () => {
    // Pas d'historique ici : la phrase d'attente, et aucune courbe inventée.
    expect(html).toContain("pas encore d’historique");
    expect(html).not.toContain("sparkline");
  });
});

describe("carte maigre : ni action ni recommandation, deux mesures au plus (Hubperso#363)", () => {
  const complete = ok({
    metrics: [
      { label: "Valeur nette", value: 42, format: "number", primary: true },
      { label: "Comptes", value: 6, format: "number" },
      { label: "Dettes", value: 2, format: "number" },
      { label: "Placements", value: 9, format: "number" },
      { label: "Budgets", value: 4, format: "number" },
    ],
    actions: [{ label: "Lancer la synchro", href: "https://finance.hubperso.com/sync", kind: "trigger" }],
    recommendation: { label: "Rééquilibrer", why: "Le REER dépasse la cible.", href: "https://finance.hubperso.com/reer" },
  });
  const html = rendre(complete);

  it("deux mesures secondaires, les autres sont comptées vers le détail", () => {
    expect(html).toContain("Comptes");
    expect(html).toContain("Dettes");
    expect(html).not.toContain("Placements");
    expect(html).not.toContain("Budgets");
    expect(html).toContain("+ 2 autres mesures dans le détail");
  });

  it("aucun bouton d'action ni bloc de recommandation sur la carte", () => {
    expect(html).not.toContain("Lancer la synchro");
    expect(html).not.toContain("Rééquilibrer");
    expect(html).not.toContain('class="actions"');
  });

  it("une app qui ne publie que des actions ou un conseil renvoie au détail, sans « aucune donnée »", () => {
    const seul = rendre(
      ok({
        metrics: [],
        actions: [{ label: "Lancer la synchro", href: "https://finance.hubperso.com/sync", kind: "link" }],
      }),
    );
    expect(seul).toContain("t’attendent dans le détail");
    expect(seul).not.toContain("Aucune donnée à afficher");
  });
});

describe("alertes : le bandeau rouge est réservé à la sévérité `alert`", () => {
  it("une simple info rejoint la liste en pastille, sans bandeau", () => {
    const html = rendre(ok({ alerts: [{ label: "Un relevé à classer", severity: "info" }] }));
    expect(html).not.toContain("bandeau");
    expect(html).toContain("alert__dot--info");
    expect(html).toContain("Un relevé à classer");
  });

  it("une alerte grave prend le bandeau, et les autres restent en liste", () => {
    const html = rendre(
      ok({
        alerts: [
          { label: "Synchronisation en échec", severity: "alert" },
          { label: "Quota proche", severity: "warn" },
        ],
      }),
    );
    expect(html).toContain('class="bandeau"');
    expect(html.match(/class="bandeau"/g)).toHaveLength(1);
    expect(html).toContain("Quota proche");
  });
});

describe("carte sans donnée à lire : aucun chiffre, jamais un zéro", () => {
  const cas: [string, SummaryResult, string][] = [
    ["injoignable", { state: "unreachable", source: hubSource(), detail: "délai dépassé" }, "délai dépassé"],
    ["non autorisée", { state: "unauthorized", source: hubSource() }, "n’a pas la bonne clé"],
    ["en construction", ok({ status: "building", metrics: [] }), "En construction"],
  ];
  for (const [nom, result, texte] of cas) {
    it(`${nom} : pas de gros chiffre, « Détail » présent`, () => {
      const html = rendre(result);
      expect(html).not.toContain("heros__valeur");
      expect(html).toContain(texte);
      expect(html).toContain('class="widget__detail"');
    });
  }

  it("une app qui ne répond pas n'offre pas « Ouvrir » (aucune URL sûre à ouvrir)", () => {
    const html = rendre({ state: "unreachable", source: hubSource(), detail: "x" });
    expect(html).not.toContain("widget__ouvrir");
  });
});

describe("la feuille de style tient la maquette", () => {
  const regle = (selecteur: string) => {
    const debut = CSS.search(new RegExp(`^${selecteur.replace(/[.>:,\s]/g, "\\$&")} \\{`, "m"));
    return debut === -1 ? "" : CSS.slice(debut, CSS.indexOf("}", debut));
  };

  it("le gros chiffre est fin (300) et ne descend jamais sous 2 rem", () => {
    expect(regle(".heros__valeur")).toContain("font-weight: 300");
    expect(regle(".heros__valeur")).toMatch(/font-size: clamp\(2rem,/);
  });

  it("« Détail » et « Ouvrir » sont des cibles de --cible, contourées", () => {
    const r = regle(".widget__detail,\n.widget__ouvrir");
    expect(r).toContain("min-height: var(--cible)");
    expect(r).toContain("border: 1px solid var(--border-fort)");
  });

  it("le pied n'est PAS positionné : la nappe de « Détail » se mesure sur la carte", () => {
    expect(regle(".widget__foot")).not.toMatch(/position:/);
    expect(regle(".widget__foot .widget__actions")).not.toMatch(/position:/);
  });
});
