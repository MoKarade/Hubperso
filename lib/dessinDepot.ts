// lib/dessinDepot.ts — la petite constellation propre à chaque dépôt (page /graphes).
//
// Un dessin DÉCORATIF : il donne à chaque carte un visage reconnaissable, il ne représente PAS
// le graphe du dépôt (pas de vrais nœuds, pas de vrais liens). Pur et déterministe : le même nom
// donne toujours le même dessin, sans hasard à l'exécution — donc le rendu serveur et le rendu
// client concordent, et un test peut le verrouiller.

interface PointDessin {
  x: number;
  y: number;
  /** Rayon, de 3 à 6 : quelques étoiles plus grosses que les autres. */
  r: number;
}

export interface DessinDepot {
  largeur: number;
  hauteur: number;
  points: PointDessin[];
  /** Paires d'indices dans `points`. */
  liens: [number, number][];
}

export const LARGEUR = 160;
export const HAUTEUR = 90;
const MARGE = 12;
const NOMBRE_DE_POINTS = 9;

/** FNV-1a 32 bits : de quoi tirer une graine stable d'un nom. */
function graine(nom: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < nom.length; i++) {
    h ^= nom.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 : un petit générateur seedé, rendu dans [0, 1). */
function generateur(depart: number): () => number {
  let a = depart;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const arrondi = (n: number): number => Math.round(n * 10) / 10;

export function dessinDepot(nom: string): DessinDepot {
  const alea = generateur(graine(nom));
  const points: PointDessin[] = [];
  for (let i = 0; i < NOMBRE_DE_POINTS; i++) {
    points.push({
      x: arrondi(MARGE + alea() * (LARGEUR - 2 * MARGE)),
      y: arrondi(MARGE + alea() * (HAUTEUR - 2 * MARGE)),
      r: 3 + Math.floor(alea() * 4),
    });
  }

  // Un arbre (chaque point s'accroche à son plus proche voisin déjà placé) : la constellation est
  // toujours d'un seul tenant. Puis deux liens de plus, pour qu'elle ne ressemble pas à un arbre.
  const liens: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    let meilleur = 0;
    let distance = Infinity;
    for (let j = 0; j < i; j++) {
      const d = (points[i]!.x - points[j]!.x) ** 2 + (points[i]!.y - points[j]!.y) ** 2;
      if (d < distance) {
        distance = d;
        meilleur = j;
      }
    }
    liens.push([meilleur, i]);
  }
  for (let k = 0; k < 2; k++) {
    const a = Math.floor(alea() * points.length);
    const b = Math.floor(alea() * points.length);
    const deja = liens.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (a !== b && !deja) liens.push([a, b]);
  }

  return { largeur: LARGEUR, hauteur: HAUTEUR, points, liens };
}
