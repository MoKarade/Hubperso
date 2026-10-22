// lib/visage/couleur.ts — les couleurs du visage de l'assistant, en triplets [r, g, b].
//
// Un <canvas> ne lit pas les variables CSS : ses couleurs sont des nombres. Elles vivent ICI et
// nulle part ailleurs dans `lib/visage/`, et `rg` est le seul endroit qui écrit `rgba(` (exception
// nommée de `tests/theme.test.ts`). `MARQUE` et `TEXTE` doivent égaler `--marque` et `--text` de
// `app/globals.css` : `tests/visage.test.ts` le vérifie, pour que le canvas ne dérive pas du CSS.

export type RGB = readonly [number, number, number];

/** `--marque` : l'indigo du hub, teinte de l'assistant au repos. */
export const MARQUE: RGB = [147, 160, 255];
/** Blanc bleuté des traits du visage (yeux, bouche, sourcils). */
export const PLATINE: RGB = [238, 241, 255];
export const GRIS: RGB = [136, 150, 168];
export const CYAN: RGB = [120, 196, 255];
export const SOMBRE: RGB = [26, 30, 64];
/** Le fond de la tête : sert à « effacer » ce qui dépasse sous la paupière. */
export const TETE: RGB = [16, 20, 46];
export const NUIT: RGB = [8, 10, 24];

export const BLANC: RGB = [255, 255, 255];
export const BLANC_BLEU: RGB = [212, 220, 246];
export const PUPILLE: RGB = [6, 8, 22];
export const CONTOUR_OEIL: RGB = [8, 10, 28];
export const REFLET_BLEU: RGB = [170, 215, 255];
export const INTERIEUR_BOUCHE: RGB = [22, 6, 26];
export const LANGUE: RGB = [255, 112, 148];
export const JOUE: RGB = [255, 125, 165];
export const COEUR_ROSE: RGB = [255, 105, 150];
export const COEUR_FLOTTANT: RGB = [255, 120, 160];
export const OR: RGB = [255, 214, 90];
export const POINT_EXCLAMATION: RGB = [255, 205, 90];
export const AMPOULE: RGB = [255, 225, 120];
export const CULOT: RGB = [190, 196, 214];
export const LARME: RGB = [140, 200, 255];
export const SUEUR: RGB = [150, 210, 255];
export const COLERE: RGB = [248, 90, 90];
export const VAPEUR: RGB = [255, 225, 225];
export const FROID: RGB = [150, 200, 255];
export const MORNE: RGB = [120, 130, 200];
export const VALIDE: RGB = [110, 225, 160];
export const VERRES_FONCES: RGB = [8, 10, 22];

/** Les teintes que peut prendre une expression (`col`). */
export const TEINTES = {
  n: MARQUE,
  warm: [255, 196, 140],
  red: [248, 113, 113],
  blue: [110, 170, 255],
  green: [110, 220, 160],
  gold: [251, 191, 36],
  violet: [182, 150, 255],
  pink: [255, 140, 180],
  grey: GRIS,
  cyan: [105, 200, 255],
} as const satisfies Record<string, RGB>;
export type Teinte = keyof typeof TEINTES;

const borne = (a: number) => Math.max(0, Math.min(1, a));

/** Une couleur en chaîne CSS, avec son opacité (bornée à 0..1). */
export function rg(c: RGB, a: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${borne(a).toFixed(3)})`;
}

/** Mélange linéaire de deux couleurs : `t` = 0 donne `a`, 1 donne `b`. */
export function melange(a: RGB, b: RGB, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
