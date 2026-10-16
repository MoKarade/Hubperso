// tests/securiteLiens.test.ts — contrôle d'exhaustivité et de sécurité des liens venus du contrat/summary.
//
// ══ POURQUOI CE TEST EXISTE ══════════════════════════════════════════════════════════
//
// Tous les liens venus des apps/summaries doivent impérativement passer par `safeHttpUrl`
// afin de filtrer les schémas dangereux (`javascript:`, `data:`, `file:`, etc.).
// Ce test vérifie à la fois :
// 1. Statiquement : que tous les composants et pages dans `components/` et `app/` qui
//    affichent des balises `<a href={...}>` alimentées par des données du summary passent par
//    `safeHttpUrl` (soit directement dans le composant/page, soit via un module purement
//    testé comme `lib/carte.ts` ou `lib/attention.ts`).
// 2. Par rendu : que le rendu des composants recevant une URL malveillante (`javascript:…`)
//    ne produit JAMAIS de balise `<a href="javascript:...">` ou autre protocole non http(s).

import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HubAction, HubAlert, HubSummary } from "@mokarade/hub-contract";

vi.mock("@/app/actions", () => ({ actionDeclencher: vi.fn() }));

import { ActionList } from "@/components/ActionList";
import { AlertBanner } from "@/components/AlertBanner";
import { AlertList } from "@/components/AlertList";
import { DetailAlertes } from "@/components/DetailAlertes";
import { Recommandation } from "@/components/Recommandation";
import { etatCarte } from "@/lib/carte";
import { safeHttpUrl } from "@/lib/url";

const RACINE = join(__dirname, "..");

/** Récupère tous les fichiers .tsx sous un dossier. */
function fichiersTsx(depuis: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(depuis)) {
    const chemin = join(depuis, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersTsx(chemin));
    else if (entree.endsWith(".tsx")) trouves.push(chemin);
  }
  return trouves;
}

/** URL dangereuse d'essai. */
const URL_MALVEILLANTE = "javascript:alert('xss')";

describe("exhaustivité statique des liens <a href=...> dans JSX", () => {
  const fichiers = [
    ...fichiersTsx(join(RACINE, "components")),
    ...fichiersTsx(join(RACINE, "app")),
  ];

  it("retrouve les fichiers JSX à examiner", () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(10);
  });

  it("aucun composant ne rend un href dynamique de summary sans safeHttpUrl", () => {
    for (const fichier of fichiers) {
      const code = readFileSync(fichier, "utf8");
      const nomRelatif = fichier.replace(RACINE + "/", "");

      // Balise <a ... href={variable}>
      const matches = code.matchAll(/<a\b[^>]*?\bhref=\{([^}]+)\}/gs);
      for (const m of matches) {
        const exprHref = m[1]!.trim();

        // Si l'expression est un littéral ou un template string interne (ex: `/app/${id}`)
        if (
          exprHref.startsWith('"') ||
          exprHref.startsWith("'") ||
          exprHref.startsWith("`/app/") ||
          exprHref.startsWith("`/")
        ) {
          continue;
        }

        // Si c'est un champ d'objet ou une variable, on vérifie qu'elle est filtrée par safeHttpUrl
        // soit dans le fichier (import et appel safeHttpUrl), soit issue de type pré-filtré documenté.
        const utiliseSafeHttpUrlDirectement = code.includes("safeHttpUrl(");
        const estChampFiltreEnAmont =
          (nomRelatif === "components/Recommandation.tsx" && exprHref.includes("reco.href")) ||
          (nomRelatif === "app/attention/page.tsx" && exprHref.includes("entree.href"));

        expect(
          utiliseSafeHttpUrlDirectement || estChampFiltreEnAmont,
          `${nomRelatif} rend <a href={${exprHref}}> mais ne passe pas par safeHttpUrl (directement ou filtré en amont).`,
        ).toBe(true);
      }
    }
  });
});

describe("filtrage au rendu des composants pour les adresses dangereuses", () => {
  it("ActionList ne rend pas de lien javascript:", () => {
    const action: HubAction = { label: "Action piège", kind: "link", href: URL_MALVEILLANTE };
    const html = renderToStaticMarkup(h(ActionList, { actions: [action], appId: "test" }));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("action action--disabled");
  });

  it("AlertBanner ne rend pas de lien javascript:", () => {
    const alert: HubAlert = { label: "Alerte piège", severity: "alert", href: URL_MALVEILLANTE };
    const html = renderToStaticMarkup(h(AlertBanner, { alert }));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });

  it("AlertList ne rend pas de lien javascript:", () => {
    const alert: HubAlert = { label: "Alerte piège", severity: "alert", href: URL_MALVEILLANTE };
    const html = renderToStaticMarkup(h(AlertList, { alerts: [alert] }));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });

  it("DetailAlertes ne rend pas de lien javascript:", () => {
    const alert: HubAlert = { label: "Alerte piège", severity: "alert", href: URL_MALVEILLANTE };
    const html = renderToStaticMarkup(h(DetailAlertes, { alerts: [alert] }));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });

  it("etatCarte et Recommandation ne rendent pas de lien javascript:", () => {
    const summary: HubSummary = {
      contractVersion: 1,
      status: "ok",
      generatedAt: "2026-09-15T12:00:00Z",
      app: { id: "test", name: "TestApp", url: URL_MALVEILLANTE, color: "#123456" },
      dataAsOf: "2026-09-15T12:00:00Z",
      metrics: [],
      alerts: [],
      actions: [],
      recommendation: { label: "Reco piège", href: URL_MALVEILLANTE },
    };
    const carte = etatCarte(summary, [], Date.now());
    expect(carte.recommandation?.href).toBeNull();

    if (carte.recommandation) {
      const html = renderToStaticMarkup(h(Recommandation, { reco: carte.recommandation }));
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("<a ");
      expect(html).toContain("Reco piège");
    }
  });

  it("safeHttpUrl écarte les URL javascript: directes pour les alertes", () => {
    const hrefAlerte = URL_MALVEILLANTE ? safeHttpUrl(URL_MALVEILLANTE) : null;
    expect(hrefAlerte).toBeNull();
  });
});
