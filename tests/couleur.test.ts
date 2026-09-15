// tests/couleur.test.ts — le contraste du texte sur la couleur d'une app.
//
// C'est la SEULE partie du lot « UI » du 15/09 qui puisse être silencieusement fausse : un
// bouton mal contrasté s'affiche parfaitement, il est juste illisible. Le reste du lot
// (lavis, tailles, grille) se juge à l'œil et n'a pas de test ici — dit franchement.

import { describe, expect, it } from "vitest";
import {
  contrasteRetenu,
  luminanceRelative,
  rapportContraste,
  texteSur,
} from "@/lib/couleur";

/** Les six couleurs réellement publiées au 15/09/2026. */
const APPS: ReadonlyArray<[string, string, "#000000" | "#ffffff"]> = [
  ["CarAI", "#db2777", "#ffffff"],
  ["BatchChef", "#c2410c", "#ffffff"],
  ["FinanceAI", "#0f766e", "#ffffff"],
  ["MemoryAI", "#7c3aed", "#ffffff"],
  // ⚠️ LES DEUX QUI JUSTIFIENT TOUT LE MODULE : le blanc y tombe à ~2,1, donc illisible.
  ["JobAI", "#f2a31b", "#000000"],
  ["DriveAI", "#8ab4f8", "#000000"],
];

describe("texteSur — les couleurs réelles de l'écosystème", () => {
  for (const [nom, couleur, attendu] of APPS) {
    it(`${nom} (${couleur}) porte du texte ${attendu === "#ffffff" ? "blanc" : "noir"}`, () => {
      expect(texteSur(couleur)).toBe(attendu);
    });
  }

  it("les deux couleurs claires refusent le blanc — c'est la raison d'être du module", () => {
    // Sans ce cas, on pourrait croire que le module ne sert à rien : quatre couleurs sur six
    // prennent du blanc, et un `color: #fff` codé en dur passerait pour correct.
    for (const claire of ["#f2a31b", "#8ab4f8"]) {
      const l = luminanceRelative(claire)!;
      expect(rapportContraste(l, 1)).toBeLessThan(4.5); // le blanc échoue
      expect(texteSur(claire)).toBe("#000000");
    }
  });

  it("chaque app atteint le seuil AA de 4,5:1", () => {
    for (const [nom, couleur] of APPS) {
      expect(contrasteRetenu(couleur), `${nom} ${couleur}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("texteSur — la garantie qui dispense de faire confiance aux apps", () => {
  // ⚠️ L'INVARIANT QUI COMPTE. Le hub ne connaît aucune app : une nouvelle peut publier
  // n'importe quelle couleur demain. Prendre le meilleur du noir et du blanc rend TOUJOURS
  // au moins 4,58:1 — le pire cas est la luminance où les deux s'égalisent (L ≈ 0,179).
  // Ce test le vérifie sur 4 096 couleurs plutôt que de le déduire d'un raisonnement.
  it("aucune couleur ne descend sous 4,5:1, quelle qu'elle soit", () => {
    let pire = Infinity;
    let pireCouleur = "";
    for (let r = 0; r < 256; r += 16) {
      for (let g = 0; g < 256; g += 16) {
        for (let b = 0; b < 256; b += 16) {
          const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
          const c = contrasteRetenu(hex)!;
          if (c < pire) {
            pire = c;
            pireCouleur = hex;
          }
        }
      }
    }
    expect(pire, `pire cas : ${pireCouleur}`).toBeGreaterThanOrEqual(4.5);
    // Anti-vacuité : si la boucle n'avait rien parcouru, `pire` serait resté à l'infini.
    expect(pire).toBeLessThan(6);
  });

  it("le pire cas théorique (L ≈ 0,179) rend bien ~4,58", () => {
    // La luminance où noir et blanc s'égalisent : sqrt(1,05 × 0,05) − 0,05.
    const lEgalite = Math.sqrt(1.05 * 0.05) - 0.05;
    expect(rapportContraste(lEgalite, 1)).toBeCloseTo(4.58, 1);
    expect(rapportContraste(lEgalite, 0)).toBeCloseTo(4.58, 1);
  });
});

describe("texteSur — ce qui n'est pas une couleur ne devient pas une supposition", () => {
  // Le contrat n'accepte que `#rrggbb` (vérifié : `#abc`, `red`, `rgb()` sont refusés par
  // `validateSummary`). Ces cas ne devraient donc jamais arriver — mais un `#000000` par
  // défaut serait invisible sur un fond sombre, alors qu'un `null` laisse le bouton neutre.
  it.each([
    ["chaîne vide", ""],
    ["nom CSS", "red"],
    ["forme courte", "#abc"],
    ["fonction CSS", "rgb(1,2,3)"],
    ["hex trop long", "#db27771"],
    ["hex invalide", "#gggggg"],
    ["undefined", undefined],
    ["null", null],
  ])("%s → null, aucune couleur posée", (_nom, valeur) => {
    expect(texteSur(valeur as string | null | undefined)).toBeNull();
    expect(luminanceRelative(valeur as string | null | undefined)).toBeNull();
  });

  it("la casse et les espaces ne changent rien", () => {
    expect(texteSur("#DB2777")).toBe(texteSur("#db2777"));
    expect(texteSur("  #db2777  ")).toBe("#ffffff");
  });

  it("les deux extrêmes sont cohérents", () => {
    expect(luminanceRelative("#000000")).toBe(0);
    expect(luminanceRelative("#ffffff")).toBeCloseTo(1, 6);
    expect(texteSur("#000000")).toBe("#ffffff");
    expect(texteSur("#ffffff")).toBe("#000000");
  });
});
