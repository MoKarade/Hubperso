// tests/tuileGraphes.test.ts — l'entrée de l'accueil vers /graphes.
//
// Prouve : la tuile mène à /graphes, porte son nom accessible et une constellation décorative ;
// et que l'accueil ne la montre QU'AU PROPRIÉTAIRE (les graphes décrivent des dépôts privés).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TuileGraphes } from "../components/TuileGraphes";

describe("TuileGraphes", () => {
  const html = renderToStaticMarkup(TuileGraphes({ nombre: 10 }));

  it("est un lien vers /graphes, nommé pour les lecteurs d'écran", () => {
    expect(html).toContain('href="/graphes"');
    expect(html).toContain('aria-label="Ouvrir les graphes de code"');
  });

  it("annonce le nombre de dépôts en peu de mots, avec un dessin décoratif", () => {
    expect(html).toContain("Graphes de code");
    expect(html).toContain("10 dépôts");
    expect(html).toMatch(/<svg[^>]*aria-hidden/);
  });
});

describe("l'accueil", () => {
  const source = readFileSync(join(__dirname, "..", "app", "page.tsx"), "utf8");

  it("ne montre la tuile qu'au propriétaire, jugé sur la session déjà vérifiée", () => {
    expect(source).toContain("const session = await exigerAccesHub()");
    expect(source).toContain("estProprietaire(session.user?.email)");
    expect(source).toMatch(/\{proprietaire && <TuileGraphes /);
  });
});
