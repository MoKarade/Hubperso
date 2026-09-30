// tests/ecransSombre.test.ts — les écrans « détail d'une app », attention, coûts et
// administration suivent le thème sombre seul (Marc, 26/09) avec la même méthode que
// login et accueil : cibles tactiles, pleine largeur sous 560 px, couleur d'app réservée au
// liseré/lavis, contrastes MESURÉS sur le lavis réel. Lit le CSS réel, ne simule rien.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSources } from "../lib/sources";
import { luminanceRelative, rapportContraste } from "../lib/couleur";

const CSS = readFileSync("app/globals.css", "utf8");

/** La couleur officielle de chaque projet, lue dans la table unique des apps (lib/sources.ts). */
const COULEURS: Record<string, string> = Object.fromEntries(
  getSources({}).map((s) => [s.id, s.couleur ?? ""]),
);

/** Corps de la première règle dont le sélecteur contient exactement `.classe`. */
function regle(selecteur: string): string {
  const esc = selecteur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|\\n)${esc}\\s*(,[^{]*)?\\{([^}]*)\\}`).exec(CSS);
  if (!m) throw new Error(`règle ${selecteur} introuvable`);
  return m[3]!;
}

/** Bloc `@media (max-width: 560px) { ... }` contenant --cible: 48px (accolades équilibrées). */
function mobile(): string {
  const debut = CSS.indexOf("@media (max-width: 560px) {\n  :root {\n    --cible: 48px;");
  if (debut < 0) throw new Error("bloc mobile 560px introuvable");
  let prof = 0;
  for (let i = CSS.indexOf("{", debut); i < CSS.length; i++) {
    if (CSS[i] === "{") prof++;
    if (CSS[i] === "}" && --prof === 0) return CSS.slice(debut, i + 1);
  }
  throw new Error("bloc mobile non fermé");
}

function jeton(nom: string): string {
  const m = new RegExp(`--${nom}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(CSS);
  if (!m) throw new Error(`jeton --${nom} absent`);
  return m[1]!;
}

function lum(hex: string): number {
  return luminanceRelative(hex)!;
}

/** Mélange sRGB de `part` de `a` avec le reste de `b` (approche du color-mix du CSS). */
function melange(a: string, part: number, b: string): string {
  const c = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const ch = [1, 3, 5].map((i) =>
    Math.round(c(a, i) * part + c(b, i) * (1 - part))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${ch.join("")}`;
}

describe("administration : tout ce qui se touche atteint --cible", () => {
  it("le champ de saisie fait au moins --cible de haut", () => {
    expect(regle(".admin__input")).toMatch(/min-height:\s*var\(--cible\)/);
  });
  it("les bascules d'accès par app (className calculé, hors du test de recensement)", () => {
    expect(regle(".admin__app-toggle")).toMatch(/min-height:\s*var\(--cible\)/);
  });
});

describe("administration : sous 560 px, boutons et champs pleine largeur", () => {
  const m = () => mobile();
  it("le formulaire d'ajout s'empile et ses champs prennent toute la largeur", () => {
    expect(m()).toMatch(/\.admin__input\s*\{[^}]*flex:\s*1 1 100%/);
  });
  it("les actions d'une personne s'étirent d'un bord à l'autre", () => {
    expect(m()).toMatch(/\.admin__personne-actions[^{]*\{[^}]*(width:\s*100%|align-self:\s*stretch)/);
    expect(m()).toMatch(/\.admin__personne-actions form[^{]*\{[^}]*flex:\s*1/);
  });
  it("le bouton d'ajout est pleine largeur", () => {
    expect(m()).toMatch(/\.admin__ajout \.btn[^{]*\{[^}]*flex:\s*1 1 100%/);
  });
});

describe("plus de reliquat du thème clair", () => {
  it("aucun repli rouge foncé (#b91c1c ~3:1 sur fond sombre) : --danger est toujours défini", () => {
    expect(CSS).not.toMatch(/#b91c1c/i);
  });
});

describe("la couleur de l'app n'habille que liseré/lavis, jamais la marque du hub", () => {
  for (const sel of [".detail__bloc", ".couts__app"]) {
    it(`${sel} n'utilise pas --marque`, () => {
      expect(regle(sel)).not.toMatch(/--marque/);
    });
  }
  it("le sur-titre de page reste --marque (page détail comprise)", () => {
    expect(regle(".page__eyebrow")).toMatch(/color:\s*var\(--marque\)/);
  });
});

describe("contrastes MESURÉS sur le lavis réel d'une carte (détail, coûts)", () => {
  // Lavis = 12 % de la couleur de l’app sur --surface ; on teste à 14 % (marge sur
  // l'écart entre le mélange sRGB ci-dessous et le color-mix oklch du CSS).
  const textes = ["text", "text-soft", "text-faint", "ok", "warn", "danger", "info"];
  for (const [id, couleur] of Object.entries(COULEURS)) {
    const fond = melange(couleur, 0.14, jeton("surface"));
    for (const t of textes) {
      it(`--${t} sur le lavis ${id}`, () => {
        expect(rapportContraste(lum(jeton(t)), lum(fond))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("le tracé de la courbe reste visible sur --surface (≥ 3:1, élément graphique)", () => {
  for (const [id, couleur] of Object.entries(COULEURS)) {
    it(`${id}`, () => {
      expect(rapportContraste(lum(couleur), lum(jeton("surface")))).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("administration : l'erreur « base injoignable » est rouge comme ailleurs", () => {
  it(".admin__vide[role=\"alert\"] prend --danger (texte et bordure)", () => {
    const m = /\.admin__vide\[role="alert"\]\s*\{([^}]*)\}/.exec(CSS);
    expect(m, "règle .admin__vide[role=\"alert\"] absente").not.toBeNull();
    expect(m![1]).toMatch(/color:\s*var\(--danger\)/);
    expect(m![1]).toMatch(/border-color:[^;]*var\(--danger\)/);
  });
});
