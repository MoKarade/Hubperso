// tests/pageAppMaquette.test.ts — la page d'une app selon la maquette du 22/10/2026 (#289) :
// retour à l'accueil, identité (logo, nom, état), LE chiffre, alertes et actions, puis le détail
// replié. Rien n'est inventé : on vérifie le rendu du bloc replié et les verrous qui empêchent
// de perdre l'essentiel (lien « Ouvrir l'app », blocs repliés, transition coupée si l'on a
// demandé moins de mouvement).

import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DetailPli } from "@/components/DetailContenu";

const lire = (chemin: string) => readFileSync(join(process.cwd(), chemin), "utf8");
const PAGE = lire("app/app/[id]/page.tsx");
const CSS = lire("app/globals.css");

describe("DetailPli (bloc replié)", () => {
  it("est un <details> natif, fermé par défaut, avec son titre et sa note", () => {
    const html = renderToStaticMarkup(
      h(DetailPli, { titre: "Technique", note: "cohérence et fraîcheur", children: h("p", null, "contenu") }),
    );
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Technique");
    expect(html).toContain("cohérence et fraîcheur");
    expect(html).toContain("contenu");
  });

  it("s'ouvre d'office quand on le demande (une anomalie ne se cache pas)", () => {
    const html = renderToStaticMarkup(h(DetailPli, { titre: "Technique", ouvert: true, children: h("p", null, "x") }));
    expect(html).toMatch(/<details[^>]*\sopen/);
  });
});

describe("page /app/[id]", () => {
  it("garde le lien « Ouvrir l’app » et le retour à l'accueil", () => {
    expect(PAGE).toContain("Ouvrir l’app");
    expect(PAGE).toContain("‹ Accueil");
  });

  it("replie le technique et ouvre d'office s'il y a une incohérence", () => {
    expect(PAGE).toMatch(/titre="Technique"[^>]*ouvert=\{incoherences\.length > 0\}/);
  });

  it("n'affiche le chiffre principal que si la carte en a un (jamais un chiffre inventé)", () => {
    expect(PAGE).toContain("etat?.heros &&");
  });
});

describe("CSS de la page d'app", () => {
  it("les titres repliés ont une cible d'au moins 44 px", () => {
    const bloc = CSS.slice(CSS.indexOf(".detail__pli-titre {"));
    expect(bloc.slice(0, bloc.indexOf("}"))).toContain("min-height: var(--cible)");
  });

  it("la transition de page est coupée si l'on demande moins de mouvement", () => {
    expect(CSS).toMatch(/@view-transition\s*\{\s*navigation:\s*auto;/);
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*@view-transition\s*\{\s*navigation:\s*none;/,
    );
  });
});
