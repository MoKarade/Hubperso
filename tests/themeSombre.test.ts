// tests/themeSombre.test.ts — le hub est en thème SOMBRE SEUL (décision de Marc, 26/09),
// avec l'accent de marque #93A0FF. Ce test lit le CSS réel et MESURE les contrastes
// (formule WCAG) : aucun choix « à l'œil ».

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("app/globals.css", "utf8");
const LAYOUT = readFileSync("app/layout.tsx", "utf8");
const MANIFEST = readFileSync("app/manifest.ts", "utf8");

/** Bloc `:root { ... }` (le premier, sans media query). */
function racine(): string {
  const m = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS);
  if (!m) throw new Error(":root introuvable");
  return m[1]!;
}

function jeton(nom: string): string {
  const m = new RegExp(`--${nom}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(racine());
  if (!m) throw new Error(`jeton --${nom} absent ou pas en #rrggbb`);
  return m[1]!.toUpperCase();
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
}

function contraste(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("thème sombre seul", () => {
  it("n'a plus aucun mode clair : ni prefers-color-scheme, ni bascule", () => {
    expect(CSS).not.toMatch(/prefers-color-scheme/);
    expect(CSS).not.toMatch(/data-theme/);
    expect(LAYOUT).not.toMatch(/prefers-color-scheme/);
  });

  it("déclare color-scheme: dark (barres de défilement, champs natifs)", () => {
    expect(racine()).toMatch(/color-scheme:\s*dark\s*;/);
  });

  it("reprend les valeurs de la référence : fond #07090D, surface #0E1014", () => {
    expect(jeton("bg")).toBe("#07090D");
    expect(jeton("surface")).toBe("#0E1014");
    expect(jeton("surface-2")).toBe("#15181E");
  });

  it("aligne la barre système et l'écran de démarrage sur le fond", () => {
    expect(LAYOUT).toMatch(/themeColor:\s*"#07090D"/);
    expect(MANIFEST).toMatch(/background_color:\s*"#07090D"/);
    expect(MANIFEST).toMatch(/theme_color:\s*"#07090D"/);
  });

  it("n'a plus de halo dégradé sur le fond (fond uni)", () => {
    const body = /\nbody\s*\{([\s\S]*?)\n\}/.exec(CSS)![1]!;
    expect(body).not.toMatch(/gradient/);
  });
});

describe("accent de marque du hub", () => {
  it("vaut #93A0FF (source unique : §6bis de la référence)", () => {
    expect(jeton("marque")).toBe("#93A0FF");
  });

  it("n'est JAMAIS l'accent d'une app : --accent reste celui du contrat", () => {
    // Le jeton de marque ne doit apparaître ni dans la règle .widget ni dans un --accent.
    expect(CSS).not.toMatch(/--accent:\s*var\(--marque\)/);
    const widget = /\n\.widget\s*\{([\s\S]*?)\n\}/.exec(CSS)![1]!;
    expect(widget).not.toMatch(/--marque/);
  });

  it("habille le sur-titre de page", () => {
    const eyebrow = /\.page__eyebrow\s*\{([\s\S]*?)\}/.exec(CSS)![1]!;
    expect(eyebrow).toMatch(/color:\s*var\(--marque\)/);
  });
});

describe("contrastes MESURÉS (texte ≥ 4,5:1 sur fond ET surface)", () => {
  const fonds = ["bg", "surface"] as const;
  const textes = ["text", "text-soft", "text-faint", "marque", "ok", "warn", "danger", "info"];

  for (const t of textes) {
    for (const f of fonds) {
      it(`--${t} sur --${f}`, () => {
        expect(contraste(jeton(t), jeton(f))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("--text-faint sur --surface-2 (survol, pastilles)", () => {
    expect(contraste(jeton("text-faint"), jeton("surface-2"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("repli neutre d'une carte sans couleur d'app", () => {
  it("le texte du bouton « Détail » contraste ≥ 4,5:1 avec le fond de repli", () => {
    // Une app « non configurée » n'a pas de couleur publiée : le repli #fff sur gris
    // moyen faisait ~3,6:1. Repli = fond clair + texte sombre (texteSur du repli).
    const fond = /\.widget\s*\{[\s\S]*?--accent:\s*(#[0-9A-Fa-f]{6})/.exec(CSS)![1]!;
    const texte = /color:\s*var\(--accent-texte,\s*(#[0-9A-Fa-f]{6})\)/.exec(CSS)![1]!;
    expect(contraste(fond, texte)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("le liseré d'une carte ne prend jamais la couleur d'état", () => {
  it("aucune règle .widget[data-gravite] ne redéfinit --teinte ni la bordure", () => {
    expect(CSS).not.toMatch(/\.widget\[data-gravite/);
  });
});

describe("police commune Outfit, auto-hébergée", () => {
  it("passe par @fontsource (jamais un CDN) et est en tête de --font", () => {
    expect(LAYOUT).toMatch(/import "@fontsource-variable\/outfit"/);
    expect(CSS).toMatch(/--font:\s*"Outfit Variable"/);
    expect(LAYOUT + CSS).not.toMatch(/fonts\.googleapis|fonts\.gstatic|geist/i);
  });
});
