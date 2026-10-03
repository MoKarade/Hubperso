// lib/courbeCout.ts — la courbe d'évolution du coût d'UNE app (H-09). PURE : pas de base, pas
// d'horloge (le « maintenant » est passé par l'appelant), donc testée sans rien.
//
// ⚠️ Une courbe = UNE période ET UNE devise (`serieCout`), et les deux sont renvoyées avec la
// courbe pour être AFFICHÉES : jamais d'agrégat entre unités incomparables, ni dans le temps
// (total / mois / jour) ni entre devises. Moins de deux points ⇒ `null` : on écrit « pas
// encore d'historique » plutôt que de tracer une ligne plate qui affirmerait une stabilité.

import { serieCout, type CoutReleve, type Point, type Releve } from "@/lib/historique";

export const FENETRE_7J_MS = 7 * 24 * 3_600_000;

interface Sur7j {
  debut: number;
  fin: number;
  /** `fin - debut`, négatif possible (remise à zéro d'un mois, par exemple). */
  delta: number;
}

interface CourbeCout {
  periode: CoutReleve["periode"];
  devise: CoutReleve["devise"];
  points: Point[];
  /** Chemin SVG dans un viewBox 100x100 (y = 0 en haut). */
  trace: string;
  min: number;
  max: number;
  premier: number;
  dernier: number;
  /** Premier et dernier instant (ms), pour écrire l'étendue de temps. */
  debutMs: number;
  finMs: number;
  /** Le prix sur les 7 derniers jours ; `null` sans deux relevés dans la fenêtre. */
  sur7j: Sur7j | null;
}

export function courbeCout(
  releves: Releve[],
  periode: CoutReleve["periode"],
  devise: CoutReleve["devise"],
  maintenantMs: number,
): CourbeCout | null {
  const points = serieCout(releves, periode, devise);
  const premierPoint = points[0];
  const dernierPoint = points[points.length - 1];
  if (points.length < 2 || !premierPoint || !dernierPoint) return null;

  const valeurs = points.map((p) => p.v);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const etendue = max - min;
  const t0 = premierPoint.t;
  const duree = dernierPoint.t - t0;

  const trace = points
    .map((p, i) => {
      const x = duree === 0 ? (i / (points.length - 1)) * 100 : ((p.t - t0) / duree) * 100;
      const y = etendue === 0 ? 50 : 100 - ((p.v - min) / etendue) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const fenetre = points.filter((p) => p.t >= maintenantMs - FENETRE_7J_MS);
  const debut7 = fenetre[0];
  const fin7 = fenetre[fenetre.length - 1];
  const sur7j =
    fenetre.length >= 2 && debut7 && fin7
      ? { debut: debut7.v, fin: fin7.v, delta: fin7.v - debut7.v }
      : null;

  return {
    periode,
    devise,
    points,
    trace,
    min,
    max,
    premier: premierPoint.v,
    dernier: dernierPoint.v,
    debutMs: t0,
    finMs: dernierPoint.t,
    sur7j,
  };
}
