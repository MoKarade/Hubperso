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
  renderToStaticMarkup(h("ul", null, h(AstreApp, { result, position, n: 1, grand })));

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

describe("AstreAttente et ConstellationVivante", () => {
  it("l'attente n'affirme aucun état : pas de lien, pas de mot d'état", () => {
    const html = renderToStaticMarkup(
      h("ul", null, h(AstreAttente, { source, position, n: 0, grand: false })),
    );
    expect(html).toContain('data-etat="attente"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("À jour");
  });

  it("la scène est une région nommée qui contient une liste", () => {
    const html = renderToStaticMarkup(
      h(ConstellationVivante, null, h(AstreAttente, { source, position, n: 0, grand: false })),
    );
    expect(html).toContain('aria-label="État des apps"');
    expect(html).toContain("<ul");
    expect(html).toContain('role="listitem"');
  });
});
