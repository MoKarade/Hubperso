// lib/visage/mouvement.ts — les mouvements du visage : tête, bouche, regard, clignement.
// Des fonctions pures du temps `t` (secondes) : aucune ne touche au canvas.

import type { Mouvement, MouvementBouche, Regard } from "@/lib/visage/expressions";

/** Mouvement de la tête : [dx, dy, rotation, échelle x, échelle y] (dx, dy en rayons). */
export type Pose = [number, number, number, number, number];

const { abs, sin, cos, max, min, pow, floor, PI } = Math;

export const TETE_MOUVEMENTS: Record<Mouvement, (t: number) => Pose> = {
  none: () => [0, 0, 0, 1, 1],
  breathe: (t) => {
    const k = 1 + 0.015 * sin(t * 1.3);
    return [0, 0, 0, k, k];
  },
  bob: (t) => [0, sin(t * 2.2) * 0.015, 0, 1, 1],
  nod: (t) => [0, 0.035 * max(0, sin(t * 3.6)), 0, 1, 1 - 0.02 * max(0, sin(t * 3.6))],
  shake: (t) => [sin(t * 9) * 0.03, 0, sin(t * 9) * 0.05, 1, 1],
  tilt: (t) => [0, 0, sin(t * 0.8) * 0.12, 1, 1],
  bounce: (t) => {
    const s = abs(sin(t * 4));
    return [0, -s * 0.06, 0, 1 + 0.05 * (1 - s), 1 - 0.05 * (1 - s)];
  },
  jump: (t) => {
    const s = max(0, sin(t * 4.2));
    return [0, -s * s * 0.11, 0, 1 - 0.03 * s, 1 + 0.05 * s];
  },
  tremble: (t) => [sin(t * 41) * 0.008, cos(t * 37) * 0.008, 0, 1, 1],
  shiver: (t) => [sin(t * 29) * 0.009, 0, sin(t * 23) * 0.015, 1, 1],
  sway: (t) => [sin(t * 1.5) * 0.03, 0, sin(t * 1.5) * 0.08, 1, 1],
  wobble: (t) => [0, 0, sin(t * 7) * 0.1, 1, 1],
  spin: (t) => [cos(t * 3) * 0.03, sin(t * 3) * 0.03, sin(t * 2) * 0.12, 1, 1],
  float: (t) => [0, sin(t * 1.1) * 0.025, sin(t * 0.7) * 0.03, 1, 1],
  lean: (t) => [0, 0.01, sin(t * 0.6) * 0.04, 1.06, 1.06],
  back: (t) => [0, 0.01, 0.05 + sin(t * 0.6) * 0.01, 0.95, 0.95],
  laugh: (t) => [0, -abs(sin(t * 9)) * 0.03, sin(t * 9) * 0.04, 1, 1],
  dance: (t) => [sin(t * 3) * 0.05, -abs(sin(t * 3)) * 0.04, sin(t * 3) * 0.12, 1, 1],
  sink: (t) => [0, 0.05 + sin(t) * 0.01, 0, 1.03, 0.96],
  sob: (t) => [0, abs(sin(t * 6)) * 0.02, sin(t * 3) * 0.02, 1, 1],
};

/** Ouverture de bouche AJOUTÉE à celle de l'expression (0 = rien). */
export const BOUCHE_MOUVEMENTS: Record<MouvementBouche, (t: number) => number> = {
  none: () => 0,
  talk: (t) => 0.35 * abs(sin(t * 7.3)) * (0.5 + 0.5 * sin(t * 2.1 + 1)),
  laugh: (t) => 0.3 * abs(sin(t * 9)),
  chew: (t) => 0.2 * abs(sin(t * 5)),
  yawn: (t) => {
    const k = min(1, ((t % 5) / 5) * 1.5);
    return 0.9 * pow(sin(PI * k), 1.5);
  },
  sing: (t) => 0.3 * (0.5 + 0.5 * sin(t * 3.1)),
  snore: (t) => 0.25 * (0.5 + 0.5 * sin(t * 1.6)),
  pant: (t) => 0.2 * abs(sin(t * 6)),
  grit: (t) => 0.05 * sin(t * 30),
};

/** Où l'assistant regarde : [x, y] dans -1..1. `angle` est celui de l'app visée (`follow`). */
export const REGARDS: Record<Regard, (t: number, angle: number) => [number, number]> = {
  none: () => [0, 0],
  wander: (t) => [sin(t * 0.5) * 0.5, sin(t * 0.37 + 1) * 0.35],
  scan: (t) => [sin(t * 1.4) * 0.9, 0],
  read: (t) => [((t * 0.9) % 1) * 1.6 - 0.8, 0.25],
  up: () => [-0.4, -0.8],
  upright: () => [0.5, -0.8],
  down: () => [0, 0.75],
  away: () => [0.75, 0.3],
  roll: (t) => [cos(t * 3) * 0.8, sin(t * 3) * 0.8],
  dart: (t) => {
    const k = floor(t * 3.2);
    return [sin(k * 12.9) * 0.85, sin(k * 7.3) * 0.5];
  },
  compare: (t) => [sin(t * 3) > 0 ? 0.8 : -0.8, 0],
  user: (t) => [0, 0.05 + sin(t * 0.6) * 0.04],
  follow: (_t, angle) => [cos(angle) * 0.9, sin(angle) * 0.9],
};

/** Paupière : 0 (ouvert) → 1 (fermé) → 0, pendant 0,2 s toutes les 4,4 à 5,8 s (décalé par `idx`). */
export function clignement(t: number, idx = 0): number {
  const periode = 4.4 + (idx % 3) * 0.7;
  const phase = t % periode;
  return phase < 0.2 ? sin((PI * phase) / 0.2) : 0;
}
