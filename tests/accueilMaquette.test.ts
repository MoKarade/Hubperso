// tests/accueilMaquette.test.ts — l'accueil selon la maquette de base (Marc, 22/10/2026) :
// résumé en lignes d'action, cartes, PUIS coûts et quotas. Ce qui compte ici n'est pas le détail
// du style (verrouillé ailleurs) mais ce que la maquette ne doit pas laisser dériver : l'ordre,
// la colonne de LIA qui reste vide tant qu'elle n'existe pas, et l'honnêteté du panneau.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HubSummary } from "@mokarade/hub-contract";
import { CostsCard } from "@/components/CostsCard";
import { ResumeHub } from "@/components/ResumeHub";
import type { SummaryResult } from "@/lib/fetchSummary";
import { formatEnteteAccueil } from "@/lib/format";
import { resumeHub } from "@/lib/resume";
import { aggregateUsage } from "@/lib/usage";
import { hubSource, validSummary } from "./helpers";

const NOW = Date.parse("2026-10-22T20:27:00.000Z");
const texte = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function ok(id: string, usage?: HubSummary["usage"]): SummaryResult {
  return {
    state: "ok",
    source: hubSource({ id, name: id }),
    summary: validSummary({
      app: { id, name: id.toUpperCase(), url: `https://${id}.exemple.invalid`, color: "#336699" },
      usage,
    }),
  };
}

describe("ordre de la page d'accueil", () => {
  const page = readFileSync(join(__dirname, "..", "app", "page.tsx"), "utf8");
  const dans = (motif: string) => page.lastIndexOf(motif);

  it("le résumé, puis les cartes, puis les coûts", () => {
    const resume = page.indexOf("<StreamedAttention");
    const cartes = page.indexOf('aria-label="Widgets des apps"');
    const couts = page.indexOf("<StreamedCosts");
    expect(resume).toBeGreaterThan(0);
    expect(cartes).toBeGreaterThan(resume);
    expect(couts).toBeGreaterThan(cartes);
    // Le panneau est servi par son propre Suspense, jamais devant les cartes.
    expect(dans("couts-panneau--attente")).toBeGreaterThan(cartes);
  });
});

describe("en-tête daté de l'accueil", () => {
  it("jour et heure du Québec, pas ceux du serveur", () => {
    expect(formatEnteteAccueil(NOW)).toBe("jeudi 22 octobre · 16 h 27");
    // Minuit passé au Québec = déjà le lendemain en UTC… et pas l'inverse.
    expect(formatEnteteAccueil(Date.parse("2026-10-23T03:30:00Z"))).toBe("jeudi 22 octobre · 23 h 30");
  });
});

describe("colonne de LIA", () => {
  const resultats = [ok("a")];
  const rendre = (lia?: string) =>
    renderToStaticMarkup(
      h(ResumeHub, { resume: resumeHub(resultats, []), liste: [], maintenant: NOW, lia: lia ? h("p", null, lia) : undefined }),
    );

  it("rien n'est dessiné tant que son composant n'existe pas", () => {
    const html = rendre();
    expect(html).not.toContain("accueil__lia");
    expect(html).not.toContain("accueil--lia");
  });

  it("quand il arrive, il prend la colonne de gauche sans toucher au reste", () => {
    const html = rendre("LIA");
    expect(html).toContain("accueil__lia");
    expect(html).toContain("accueil--lia");
    expect(texte(html)).toContain("L’app est à jour.");
  });
});

describe("panneau « Coûts et quotas » (rendu)", () => {
  const rendre = (resultats: SummaryResult[]) =>
    renderToStaticMarkup(h(CostsCard, { digest: aggregateUsage(resultats), maintenant: NOW }));

  it("deux périodes : deux blocs, l'explication du pourquoi, aucun total unique", () => {
    const html = rendre([
      ok("a", { cost: { amount: 10, currency: "CAD", period: "total" } }),
      ok("b", { cost: { amount: 3, currency: "CAD", period: "mois" } }),
    ]);
    expect(html.match(/couts-panneau__montant/g)).toHaveLength(2);
    expect(texte(html)).toContain("Depuis le début · cumul");
    expect(texte(html)).toContain("Ce mois-ci");
    expect(texte(html)).toContain("Pas de total unique");
  });

  it("une seule période : la note de devise remplace l'explication", () => {
    const html = rendre([ok("a", { cost: { amount: 10, currency: "CAD", period: "total" } })]);
    expect(texte(html)).toContain("taux fixe");
    expect(texte(html)).not.toContain("Pas de total unique");
  });

  it("aucun plafond de dépense inventé", () => {
    const html = texte(
      rendre([ok("a", { cost: { amount: 10, currency: "CAD", period: "total" } })]),
    );
    expect(html).not.toMatch(/plafond de|budget|\/ 20/i);
  });

  it("quota : jauge avec valeur, remise à zéro future dite, plafond inconnu sans barre", () => {
    const html = rendre([
      ok("a", {
        quotas: [
          { label: "Gmail", used: 90, limit: 100, resetAt: "2026-10-31T12:00:00Z" },
          { label: "Libre", used: 7, limit: null },
        ],
      }),
    ]);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="90"');
    expect(html).toContain('data-niveau="warn"');
    expect(texte(html)).toContain("se remet à zéro dans 9 j");
    expect(texte(html)).toContain("plafond non publié");
    expect(html.match(/role="progressbar"/g)).toHaveLength(1);
    expect(texte(html)).toContain("1 quota à surveiller");
  });

  it("une app sans coût est nommée, pas comptée", () => {
    const html = rendre([ok("a", { cost: { amount: 1, currency: "CAD", period: "total" } }), ok("b", { quotas: [{ label: "Q", used: 1, limit: 10 }] })]);
    expect(texte(html)).toContain("Pas de coût publié : B.");
  });
});

describe("LIA dans la colonne de gauche", () => {
  const page = readFileSync(join(__dirname, "..", "app", "page.tsx"), "utf8");
  const composant = readFileSync(join(__dirname, "..", "components", "LiaHub.tsx"), "utf8");

  it("la page passe LiaHub à la colonne réservée du résumé", () => {
    expect(page).toContain("lia={<LiaHub />}");
  });

  it("la question passe par la route du hub, jamais par une réponse écrite ici", () => {
    expect(composant).toContain("ask={ask}");
    expect(composant).toContain("poserQuestion(");
    // Aucun texte de réponse inventé dans le composant : tout vient de `/api/lia/ask`.
    expect(composant).not.toMatch(/text:\s*["'`]/);
  });

  it("le menu ne mène qu'à des pages du hub", async () => {
    const { ENTREES_LIA } = await import("@/lib/lia");
    expect(ENTREES_LIA.length).toBeGreaterThan(0);
    for (const e of ENTREES_LIA) expect(e.href).toMatch(/^\/[a-z]/);
  });
});
