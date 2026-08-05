// Mise en page bento : taille dérivée du contenu, héros DÉCLARÉ (plus élu à l'exécution).

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
