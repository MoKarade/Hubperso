// tests/constellationVivante.test.ts — le ciel de l'accueil : ce que Marc voit et ce que le
// hub s'interdit. HTML statique (`renderToStaticMarkup`), fichier .ts : `createElement`.
// Aucune donnée réelle : noms, adresses et couleurs sont fictifs.

import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SummaryResult } from "@/lib/fetchSummary";
import type { HubSource } from "@/lib/sources";
import { dispositionAstres } from "@/lib/astres";
import { AstreApp, AstreAttente, ConstellationVivante } from "@/components/ConstellationVivante";

const source: HubSource = {
  id: "exemple",
  name: "Exemple",
  summaryUrl: "https://exemple.invalid/hub/summary",
  accueilUrl: "https://exemple.invalid",
  couleur: "#336699",
  token: "jeton-fictif",
  hero: false,
};
const position = dispositionAstres(3)[1]!;

const resumeOk = (status: "ok" | "degraded" | "error" | "building"): SummaryResult => ({
  state: "ok",
  source,
  summary: {
    contractVersion: 1,
    app: { id: "exemple", name: "Exemple", url: "https://exemple.invalid/app", color: "#336699" },
    generatedAt: "2026-10-21T12:00:00.000Z",
    status,
    metrics: [],
    alerts: [],
    actions: [],
  },
});

const rendre = (result: SummaryResult, grand = false) =>
  renderToStaticMarkup(h("ul", null, h(AstreApp, { result, position, n: 1, total: 3, grand })));

describe("AstreApp", () => {
  it("dit le nom et l'état de la carte, et porte le genre en attribut (la forme de l'anneau)", () => {
    const html = rendre(resumeOk("ok"));
    expect(html).toContain('aria-label="Exemple : À jour"');
    expect(html).toContain('data-etat="vivant"');
    expect(html).toContain("Exemple");
  });

  it("une app qui répond s'ouvre elle-même, SANS nouvel onglet (verrou PWA)", () => {
    const html = rendre(resumeOk("ok"));
    expect(html).toContain('href="https://exemple.invalid/app"');
    expect(html).not.toContain("_blank");
  });

  it("une app en panne mène au détail du hub et n'est jamais « vivante »", () => {
    const html = rendre({ state: "unreachable", source, detail: "délai dépassé" });
    expect(html).toContain('href="/app/exemple"');
    expect(html).toContain('data-etat="panne"');
    expect(html).not.toContain('data-etat="vivant"');
    // Aucune cause réseau ni valeur affichée dans l'astre : elles vivent dans le détail.
    expect(html).not.toContain("délai dépassé");
  });

  it("les quatre autres états ont chacun leur genre", () => {
    expect(rendre(resumeOk("degraded"))).toContain('data-etat="retard"');
    expect(rendre(resumeOk("error"))).toContain('data-etat="panne"');
    expect(rendre(resumeOk("building"))).toContain('data-etat="construction"');
    expect(rendre({ state: "unconfigured", source, manque: [] })).toContain('data-etat="absent"');
  });

  it("pose la position, la couleur de l'app et la taille de l'astre héros", () => {
    const html = rendre(resumeOk("ok"), true);
    expect(html).toContain(`--x:${position.x}%`);
    expect(html).toContain(`--lx:${position.lx}%`);
    expect(html).toContain("--accent:#336699");
    expect(html).toContain('data-grand="oui"');
    expect(rendre(resumeOk("ok"), false)).not.toContain("data-grand");
  });

  it("dessine un fil par format d'écran, du cœur vers l'astre", () => {
    const html = rendre(resumeOk("ok"));
    expect(html).toContain("ciel__fil--rond");
    expect(html).toContain("ciel__fil--rangee");
    expect(html.match(/<line /g)).toHaveLength(2);
  });
});

describe("AstreApp : les détails disent quelque chose de vrai", () => {
  const avecAlertes = (n: number): SummaryResult => {
    const base = resumeOk("ok") as Extract<SummaryResult, { state: "ok" }>;
    return {
      ...base,
      summary: {
        ...base.summary,
        alerts: Array.from({ length: n }, (_, i) => ({ label: `a${i}`, severity: "warn" as const })),
      },
    };
  };

  it("un satellite par alerte, et le vrai nombre dit au lecteur d'écran", () => {
    const html = rendre(avecAlertes(2));
    expect(html.match(/class="astre__sat"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Exemple : À jour, 2 alertes"');
    expect(rendre(avecAlertes(1))).toContain(", 1 alerte\"");
    expect(rendre(avecAlertes(0))).not.toContain("astre__sat");
  });

  it("au-delà de cinq alertes, cinq satellites mais le total réel dans le nom", () => {
    const html = rendre(avecAlertes(8));
    expect(html.match(/class="astre__sat"/g)).toHaveLength(5);
    expect(html).toContain("8 alertes");
  });

  it("le paquet de lumière ne part que vers une app à jour", () => {
    expect(rendre(resumeOk("ok"))).toContain("ciel__paquet");
    expect(rendre(resumeOk("degraded"))).not.toContain("ciel__paquet");
    expect(rendre({ state: "unreachable", source, detail: "x" })).not.toContain("ciel__paquet");
  });

  it("chaque app a son segment d'anneau, à la teinte de son état", () => {
    const html = rendre(resumeOk("error"));
    expect(html).toContain('class="ciel__segment"');
    expect(html).toContain('data-etat="panne"');
  });

  it("le mot d'état reste dans la page (lecteurs d'écran, survol) mais le disque porte une pastille", () => {
    const html = rendre(resumeOk("degraded"));
    expect(html).toContain('class="astre__mot">Données en retard<');
    expect(html).toContain("astre__pastille");
  });
});

describe("AstreAttente et ConstellationVivante", () => {
  it("l'attente n'affirme aucun état : pas de lien, pas de mot d'état", () => {
    const html = renderToStaticMarkup(
      h("ul", null, h(AstreAttente, { source, position, n: 0, total: 3, grand: false })),
    );
    expect(html).toContain('data-etat="attente"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("À jour");
  });

  it("la scène est une région nommée qui contient une liste", () => {
    const html = renderToStaticMarkup(
      h(ConstellationVivante, null, h(AstreAttente, { source, position, n: 0, total: 3, grand: false })),
    );
    expect(html).toContain('aria-label="État des apps"');
    expect(html).toContain("<ul");
    expect(html).toContain('role="listitem"');
  });

  it("le fond est décoratif : étoiles et orbites cachées aux lecteurs d'écran", () => {
    const html = renderToStaticMarkup(h(ConstellationVivante, null));
    expect(html).toMatch(/class="ciel__fond" aria-hidden/);
    expect(html.match(/class="ciel__etoile"/g)).toHaveLength(56);
    expect(html.match(/ciel__orbite ciel__orbite--/g)).toHaveLength(3);
  });
});
