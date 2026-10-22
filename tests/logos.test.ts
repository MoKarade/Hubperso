// tests/logos.test.ts — le logo de chaque app, et ce qui manque (Marc, 21/10/2026 : « s'il
// manque un logo, dis-le-moi »). HTML statique, fichier .ts : `createElement`.

import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOGOS, aUnLogo } from "@/lib/logos";
import { LogoApp } from "@/components/LogoApp";
import { AstreApp } from "@/components/ConstellationVivante";
import { dispositionAstres } from "@/lib/astres";
import type { SummaryResult } from "@/lib/fetchSummary";
import { SOURCE_DEFS, type HubSource } from "@/lib/sources";

const rendre = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);

// Les apps connues du hub (ids de `lib/sources.ts`). Un id ajouté là sans logo doit se VOIR ici.
const APPS_DU_HUB = SOURCE_DEFS.map((d) => d.id);
// Depuis la série A (Marc, 22/10/2026) les six apps ont un logo : la liste est vide.
const SANS_LOGO: string[] = [];

describe("logos des apps", () => {
  it("chaque app du hub a un logo, sauf celles listées ici (à dire à Marc)", () => {
    const manquants = APPS_DU_HUB.filter((id) => !aUnLogo(id));
    expect(manquants).toEqual(SANS_LOGO);
  });

  it("aUnLogo reconnaît les ids dessinés et rien d'autre (pas de propriété héritée)", () => {
    expect(aUnLogo("carai")).toBe(true);
    expect(aUnLogo("memoryai")).toBe(true);
    expect(aUnLogo("uneappsanslogo")).toBe(false);
    expect(aUnLogo("toString")).toBe(false);
  });

  it.each(Object.keys(LOGOS))("%s : un SVG décoratif, sans couleur en dur", (id) => {
    const html = rendre(h(LogoApp, { id: id as keyof typeof LOGOS }));
    expect(html).toContain("<svg");
    expect(html).toContain(`data-logo="${id}"`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\b(fill|stroke)="(?!none|currentColor)[^"]*"/);
  });

  it.each(Object.keys(LOGOS))("%s : grille de 64, un contour, et l'étincelle IA", (id) => {
    const html = rendre(h(LogoApp, { id: id as keyof typeof LOGOS }));
    expect(html).toContain('viewBox="0 0 64 64"');
    expect(html).toContain("logo__corps");
    // La signature commune de la série A : une étincelle par logo.
    expect(html.match(/logo__ia/g)).toHaveLength(1);
  });

  it("les parties qui bougent portent leur classe (la feuille de style les anime)", () => {
    const parties: Record<string, string[]> = {
      financeai: ["logo__dollar"],
      carai: ["logo__eclair", "logo__roue"],
      jobai: ["logo__balaie", "logo__gros"],
      batchchef: ["logo__couvercle", "logo__vapeur"],
      driveai: ["logo__flux", "logo__dossier"],
      memoryai: ["logo__strate"],
    };
    for (const [id, classes] of Object.entries(parties)) {
      const html = rendre(h(LogoApp, { id: id as keyof typeof LOGOS }));
      for (const c of classes) expect(html, `${id} : ${c}`).toContain(c);
    }
  });

  it("DriveAI : trois dossiers en cascade, MemoryAI : trois strates", () => {
    expect(rendre(h(LogoApp, { id: "driveai" })).match(/logo__dossier/g)).toHaveLength(3);
    expect(rendre(h(LogoApp, { id: "driveai" }))).toContain("--i:2");
    expect(rendre(h(LogoApp, { id: "memoryai" })).match(/logo__strate/g)).toHaveLength(3);
  });
});

describe("astre avec ou sans logo", () => {
  const source: HubSource = {
    id: "memoryai",
    name: "MemoryAI",
    summaryUrl: "https://exemple.invalid/hub/summary",
    accueilUrl: "https://exemple.invalid",
    couleur: "#336699",
    token: "jeton-fictif",
    hero: false,
  };
  const resultat = (id: string): SummaryResult => ({
    state: "ok",
    source: { ...source, id },
    summary: {
      contractVersion: 1,
      app: { id, name: "Exemple", url: "https://exemple.invalid/app", color: "#336699" },
      generatedAt: "2026-10-21T12:00:00.000Z",
      status: "ok",
      metrics: [],
      alerts: [],
      actions: [],
    },
  });
  const position = dispositionAstres(3)[0]!;
  const astre = (id: string) =>
    rendre(h("ul", null, h(AstreApp, { result: resultat(id), position, n: 0, total: 3, grand: false })));

  it("une app avec logo : le logo, pas d'initiale", () => {
    const html = astre("carai");
    expect(html).toContain('data-logo="carai"');
    expect(html).not.toContain("astre__initiale");
  });

  it("une app sans logo : son initiale, jamais un logo inventé", () => {
    const html = astre("uneappsanslogo");
    expect(html).toContain("astre__initiale");
    expect(html).not.toContain("data-logo=");
  });
});
