// tests/detailApp.test.ts — rendu des blocs de la page de détail (/app/[id]), un par un.
//
// La page était une seule fonction de 400 lignes, impossible à rendre en test (garde, fetchs
// et base de données mêlés au JSX). Ses blocs sont désormais des composants purs : on les
// rend en HTML statique (`renderToStaticMarkup`, sans navigateur) et on vérifie ce que Marc
// lit à l'écran. Fichier .ts (la config ne prend que `tests/**/*.test.ts`) : `createElement`
// plutôt que du JSX.

import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailMetriques } from "@/components/DetailMetriques";
import { DetailAlertes } from "@/components/DetailAlertes";
import { DetailCouts } from "@/components/DetailCouts";
import {
  DetailRecommandation,
  DetailSections,
} from "@/components/DetailContenu";
import {
  BandeauPerime,
  DetailCoherence,
  DetailFraicheur,
  DetailProbleme,
} from "@/components/DetailEtat";
import { SEUIL_INCHANGE_MS, recommandation } from "@/lib/carte";
import type { Releve } from "@/lib/historique";
import { hubSource, validSummary } from "./helpers";

/** Le texte visible, sans balises ni séparateurs `<!-- -->` que React insère entre textes. */
function texte(html: string): string {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const T0 = Date.UTC(2026, 8, 1, 12);
const releve = (decalageMs: number, valeur: number): Releve => ({
  appId: "financeai",
  releveLe: T0 + decalageMs,
  etat: "ok",
  dataAsOf: null,
  metriques: [{ label: "Valeur nette", value: valeur, format: "number" }],
  cout: null,
});

describe("DetailMetriques", () => {
  it("dit qu'il n'y a aucune métrique plutôt que de rendre une liste vide", () => {
    const html = renderToStaticMarkup(
      h(DetailMetriques, { metrics: [], historique: [], maintenantMs: T0 }),
    );
    expect(texte(html)).toContain("Métriques (0/6)");
    expect(texte(html)).toContain("Cette app ne publie aucune métrique.");
    expect(html).not.toContain("detail__metriques");
  });

  it("sans mémoire : « pas encore d’historique », jamais une courbe inventée", () => {
    const html = renderToStaticMarkup(
      h(DetailMetriques, {
        metrics: [
          {
            label: "Valeur nette",
            value: 42,
            format: "number",
            severity: "warn",
            trend: -2,
          },
        ],
        historique: [],
        maintenantMs: T0,
      }),
    );
    expect(texte(html)).toContain("Métriques (1/6)");
    expect(texte(html)).toContain("pas encore d’historique");
    expect(html).toContain('data-tone="warn"');
    expect(html).toContain('class="metric__trend" data-dir="down"');
    expect(html).not.toContain("detail__fige");
  });

  it("avec mémoire figée : la note « inchangé depuis » apparaît au-delà du seuil", () => {
    const html = renderToStaticMarkup(
      h(DetailMetriques, {
        metrics: [{ label: "Valeur nette", value: 10, format: "number" }],
        historique: [releve(0, 10), releve(1000, 10)],
        maintenantMs: T0 + SEUIL_INCHANGE_MS * 3,
      }),
    );
    expect(texte(html)).toContain("inchangé depuis 3 j");
  });
});

describe("DetailAlertes", () => {
  it("aucune alerte : le dit comme une bonne nouvelle", () => {
    const html = renderToStaticMarkup(h(DetailAlertes, { alerts: [] }));
    expect(texte(html)).toContain("Alertes (0/10)");
    expect(texte(html)).toContain("Aucune alerte — c’est une bonne nouvelle.");
  });

  it("un lien http(s) devient cliquable, un lien refusé laisse le texte seul", () => {
    const html = renderToStaticMarkup(
      h(DetailAlertes, {
        alerts: [
          {
            label: "Synchro en retard",
            severity: "warn",
            href: "https://finance.hubperso.com/synchro",
          },
          {
            label: "Lien douteux",
            severity: "alert",
            href: "javascript:alert(1)",
          },
        ],
      }),
    );
    expect(texte(html)).toContain("Alertes (2/10)");
    expect(html).toContain('href="https://finance.hubperso.com/synchro"');
    expect(html).not.toContain("javascript:");
    expect((html.match(/<a /g) ?? []).length).toBe(1);
    expect(html).toContain("alert__dot--danger");
    expect(texte(html)).toContain("Lien douteux alert");
  });
});

describe("DetailCouts", () => {
  it("« Non suivi » et jamais « 0 $ » quand l'app ne publie pas d'usage", () => {
    const html = renderToStaticMarkup(h(DetailCouts, { usage: undefined }));
    expect(texte(html)).toContain("Non suivi par cette app.");
    expect(html).not.toContain("$");
  });

  it("signale la conversion depuis USD et borne la barre d'un quota dépassé", () => {
    const html = renderToStaticMarkup(
      h(DetailCouts, {
        usage: {
          cost: { amount: 10, currency: "USD", period: "mois" },
          quotas: [
            { label: "Appels", used: 150, limit: 100, unit: "appels" },
            { label: "Stockage", used: 4, limit: null },
          ],
        },
      }),
    );
    expect(texte(html)).toContain("(mois — converti depuis USD)");
    expect(texte(html)).toContain("Appels — 150 / 100 appels");
    expect(html).toContain("width:100%");
    expect(html).toContain("couts__barfill--warn");
    // Sans plafond, pas de barre : une seule dans ce rendu.
    expect((html.match(/couts__bar"/g) ?? []).length).toBe(1);
  });
});

describe("DetailProbleme et BandeauPerime", () => {
  it("dit ce qui ne va pas et l'endpoint interrogé", () => {
    const source = hubSource();
    const html = renderToStaticMarkup(
      h(DetailProbleme, {
        result: { state: "unauthorized", source },
        summaryUrl: source.summaryUrl,
      }),
    );
    expect(texte(html)).toContain("Jeton refusé (401).");
    expect(html).toContain(`<code>${source.summaryUrl}</code>`);
  });

  it("une source sans URL le dit, sans <code> vide", () => {
    const source = hubSource({ summaryUrl: null });
    const html = renderToStaticMarkup(
      h(DetailProbleme, {
        result: { state: "unconfigured", source, manque: ["url"] },
        summaryUrl: null,
      }),
    );
    expect(texte(html)).toContain("aucun (non configuré)");
    expect(html).not.toContain("<code>");
  });

  it("le bandeau périmé est une alerte annoncée", () => {
    const html = renderToStaticMarkup(h(BandeauPerime));
    expect(html).toContain('role="alert"');
    expect(texte(html)).toContain("dernier résumé connu");
    // Le triangle du hub (un dessin), pas un « ! » tapé au clavier.
    expect(html).toContain("<svg");
    expect(texte(html)).not.toMatch(/^\s*!/);
  });
});

describe("DetailCoherence et DetailFraicheur", () => {
  it("concordance : une phrase ; divergence : une ligne par incohérence, avec sa gravité", () => {
    expect(
      texte(renderToStaticMarkup(h(DetailCoherence, { incoherences: [] }))),
    ).toContain("Ce que le hub déclare et ce que l’app publie concordent.");
    const html = renderToStaticMarkup(
      h(DetailCoherence, {
        incoherences: [
          {
            source: "financeai",
            gravite: "bloquant",
            genre: "identite-divergente",
            detail: "id publié différent",
          },
        ],
      }),
    );
    expect(html).toContain('data-gravite="bloquant"');
    expect(texte(html)).toContain("identite-divergente id publié différent");
  });

  it("sans dataAsOf, dit qu'on ne peut pas savoir si les chiffres sont à jour", () => {
    const html = renderToStaticMarkup(
      h(DetailFraicheur, {
        summary: validSummary(),
        summaryUrl: "https://finance.hubperso.com/hub/summary",
      }),
    );
    expect(texte(html)).toContain(
      "non publié par l’app — impossible de savoir si les chiffres sont à jour",
    );
    expect(html).toContain(
      "<code>https://finance.hubperso.com/hub/summary</code>",
    );
  });
});

describe("DetailRecommandation et DetailSections", () => {
  it("un lien de recommandation refusé est signalé, le texte reste", () => {
    const summary = validSummary({
      recommendation: { label: "Ranger les reçus", href: "ftp://x" },
    });
    const html = renderToStaticMarkup(
      h(DetailRecommandation, { reco: recommandation(summary)!, summary }),
    );
    expect(texte(html)).toContain("Ranger les reçus");
    expect(html).toContain("detail__note");
  });

  it("un lien valide n'affiche pas l'avertissement", () => {
    const summary = validSummary({
      recommendation: {
        label: "Ranger les reçus",
        href: "https://finance.hubperso.com/recus",
      },
    });
    const html = renderToStaticMarkup(
      h(DetailRecommandation, { reco: recommandation(summary)!, summary }),
    );
    expect(html).not.toContain("detail__note");
  });

  it("rend chaque section publiée, dans l'ordre de l'app, et rien sans details", () => {
    expect(
      renderToStaticMarkup(h(DetailSections, { details: undefined })),
    ).toBe("");
    const html = renderToStaticMarkup(
      h(DetailSections, {
        details: [
          {
            title: "Comptes",
            items: [{ label: "Épargne", value: 1, format: "number" }],
          },
          {
            title: "Campagnes",
            items: [{ label: "Tri", value: "en cours", format: "text" }],
          },
        ],
      }),
    );
    expect(html.indexOf("Comptes")).toBeLessThan(html.indexOf("Campagnes"));
    expect(html).toContain('aria-label="Campagnes"');
  });
});
