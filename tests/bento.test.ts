// Mise en page bento : taille dérivée du contenu, héros DÉCLARÉ (plus élu à l'exécution).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { widgetSize } from "../lib/bento";

describe("widgetSize", () => {
  it("héros → grand, OK avec métriques → moyen, reste → petit", () => {
    expect(widgetSize(true, 5, true)).toBe("widget--lg");
    expect(widgetSize(true, 3, false)).toBe("widget--md");
    expect(widgetSize(true, 0, false)).toBe("widget--sm");
    expect(widgetSize(false, 0, false)).toBe("widget--sm");
  });

  it("le héros reste grand même sans donnée — c'est ce qui rend la grille décidable avant les fetchs", () => {
    // Verrou du rendu en flux : le squelette (ok=false, metrics=0) et la carte réelle
    // (ok=true, metrics=N) d'une même source héros donnent la MÊME classe de géométrie.
    // Sans ça, la grille sauterait au moment où la carte remplace son squelette.
    expect(widgetSize(false, 0, true)).toBe("widget--lg");
    expect(widgetSize(true, 9, true)).toBe("widget--lg");
  });
});

describe("la carte large répartit son surplus de hauteur (#252)", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const regle = (selecteur: string) => {
    // Début de ligne : `.actions {` ne doit pas se confondre avec `… > .actions {`.
    const debut = css.search(new RegExp(`^${selecteur.replace(/[.>:]/g, "\\$&")} \\{`, "m"));
    return debut === -1 ? "" : css.slice(debut, css.indexOf("}", debut));
  };

  it("le corps de la carte large répartit entre ses blocs, et `.actions` ne ramasse plus tout", () => {
    expect(regle(".widget--lg .widget__body")).toContain("justify-content: space-between");
    expect(regle(".widget--lg .widget__body > .actions")).toContain("margin-top: 0");
  });

  it("une carte normale garde `margin-top: auto` sur `.actions` (elle ne doit pas changer)", () => {
    expect(regle(".actions")).toContain("margin-top: auto");
    expect(regle(".widget__body")).not.toContain("space-between");
  });

  it("sans historique, la courbe de la carte large ne réserve aucune hauteur", () => {
    expect(regle(".widget--lg .heros__courbe:empty")).toContain("height: 0");
  });
});
