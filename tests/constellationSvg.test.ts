// tests/constellationSvg.test.ts — test du composant ConstellationSvg (page /graphes).

import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConstellationSvg } from "@/components/ConstellationSvg";
import { HAUTEUR, LARGEUR, dessinDepot } from "@/lib/dessinDepot";

describe("ConstellationSvg", () => {
  it("rend un SVG décoratif avec les bons attributs et viewBox", () => {
    const html = renderToStaticMarkup(h(ConstellationSvg, { nom: "depot-fictif-a" }));
    expect(html.startsWith("<svg")).toBe(true);
    expect(html).toContain('class="constellation"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain(`viewBox="0 0 ${LARGEUR} ${HAUTEUR}"`);
  });

  it("rend autant de <line> que de liens et autant de <circle> que de points", () => {
    const nom = "depot-fictif-a";
    const dessin = dessinDepot(nom);
    const html = renderToStaticMarkup(h(ConstellationSvg, { nom }));

    const nbLines = (html.match(/<line\b/g) || []).length;
    const nbCircles = (html.match(/<circle\b/g) || []).length;

    expect(nbLines).toBe(dessin.liens.length);
    expect(nbCircles).toBe(dessin.points.length);
  });

  it("porte les bonnes coordonnées sur le premier point et le premier lien", () => {
    const nom = "depot-fictif-a";
    const dessin = dessinDepot(nom);
    const html = renderToStaticMarkup(h(ConstellationSvg, { nom }));

    const premierPoint = dessin.points[0]!;
    expect(html).toContain(`cx="${premierPoint.x}"`);
    expect(html).toContain(`cy="${premierPoint.y}"`);
    expect(html).toContain(`r="${premierPoint.r}"`);

    const premierLien = dessin.liens[0]!;
    const pA = dessin.points[premierLien[0]]!;
    const pB = dessin.points[premierLien[1]]!;
    expect(html).toContain(`x1="${pA.x}"`);
    expect(html).toContain(`y1="${pA.y}"`);
    expect(html).toContain(`x2="${pB.x}"`);
    expect(html).toContain(`y2="${pB.y}"`);
  });

  it("chaque <line> et <circle> porte sa classe et sa variable d'animation --n croissante", () => {
    const nom = "depot-fictif-a";
    const dessin = dessinDepot(nom);
    const html = renderToStaticMarkup(h(ConstellationSvg, { nom }));

    for (let i = 0; i < dessin.liens.length; i++) {
      expect(html).toContain(`class="constellation__lien" style="--n:${i}"`);
    }
    for (let i = 0; i < dessin.points.length; i++) {
      expect(html).toContain(`class="constellation__point" style="--n:${i}"`);
    }
  });

  it("est déterministe : même nom donne deux fois le même HTML, deux noms différents donnent deux HTML différents", () => {
    const htmlA1 = renderToStaticMarkup(h(ConstellationSvg, { nom: "depot-fictif-a" }));
    const htmlA2 = renderToStaticMarkup(h(ConstellationSvg, { nom: "depot-fictif-a" }));
    const htmlB = renderToStaticMarkup(h(ConstellationSvg, { nom: "depot-fictif-b" }));

    expect(htmlA1).toBe(htmlA2);
    expect(htmlA1).not.toBe(htmlB);
  });
});
