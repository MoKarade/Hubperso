// lib/astres.ts — la constellation vivante de l'accueil : un astre par app.
//
// PUR : tout ce qui se décide sans écran. L'état d'un astre vient du MÊME `statusBadge` que le
// badge de la carte (une seule source de vérité) : l'astre ne juge rien lui-même, il montre ce
// que le hub sait. Il n'y a donc jamais un astre « vivant » pour une app que la carte dit en panne.

import type { SummaryResult } from "./fetchSummary";
import { statusBadge } from "./status";
import { safeHttpUrl } from "./url";

/**
 * Cinq genres d'état, et chacun a une FORME différente à l'écran (anneau plein, tiret, pointillé
 * qui tourne), pas seulement une couleur : l'état se lit sans distinguer les teintes.
 */
export type GenreAstre = "vivant" | "retard" | "panne" | "construction" | "absent";

export interface EtatAstre {
  genre: GenreAstre;
  /** Le mot du badge de la carte (« À jour », « Injoignable »…), tel quel. */
  mot: string;
}

/** Ton du badge → genre. Exhaustif : un nouveau ton casserait la compilation ici. */
const GENRE_DU_TON = {
  ok: "vivant",
  warn: "retard",
  danger: "panne",
  info: "construction",
  neutral: "absent",
} as const satisfies Record<ReturnType<typeof statusBadge>["tone"], GenreAstre>;

export function etatAstre(result: SummaryResult): EtatAstre {
  const badge = statusBadge(result);
  return { genre: GENRE_DU_TON[badge.tone], mot: badge.label };
}

/**
 * Où mène un astre. Une app qui répond s'ouvre elle-même (sans `target="_blank"`, voir le
 * verrou PWA de `AppWidget`) ; une app qui ne répond pas mène à son détail dans le hub, là où
 * la cause est écrite. Jamais d'adresse inventée : `accueilUrl` est écrite en dur dans
 * `lib/sources.ts`, `app.url` est filtrée par `safeHttpUrl`.
 */
export function destinationAstre(result: SummaryResult): { href: string; externe: boolean } {
  if (result.state === "ok" && !result.stale) {
    const url = safeHttpUrl(result.summary.app.url) ?? safeHttpUrl(result.source.accueilUrl);
    if (url) return { href: url, externe: true };
  }
  return { href: `/app/${result.source.id}`, externe: false };
}

/**
 * Deux dispositions, une par format d'écran, que le CSS choisit (la scène change de proportions
 * à 700 px, et un seul dessin ne sert pas les deux) :
 * - `x`, `y` : sur une ellipse autour du cœur, pour le téléphone (presque carré) ;
 * - `lx`, `ly` : en rangée qui zigzague, pour l'écran large (les noms ont la place de s'étaler).
 * Tout est en pourcentage de la scène, centre du DISQUE de l'astre.
 */
export interface PositionAstre {
  x: number;
  y: number;
  lx: number;
  ly: number;
}

const RAYON_X = 36;
const RAYON_Y = 33;
const HAUT = 22;
const BAS = 74;

const arrondi = (n: number): number => Math.round(n * 100) / 100;

/**
 * Répartit `n` astres : le premier en haut de l'ellipse et à gauche de la rangée. Ne dépend QUE
 * du nombre d'apps déclarées, jamais des données : la scène est dessinée avant la moindre
 * réponse (condition du rendu en flux, voir `app/page.tsx`).
 */
export function dispositionAstres(n: number): PositionAstre[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`nombre d'astres invalide : ${n}`);
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return {
      x: arrondi(50 + RAYON_X * Math.cos(angle)),
      y: arrondi(50 + RAYON_Y * Math.sin(angle)),
      lx: n === 1 ? 50 : arrondi(10 + (80 * i) / (n - 1)),
      ly: i % 2 === 0 ? HAUT : BAS,
    };
  });
}

/** Ton d'un satellite : celui de l'alerte du contrat (`alert` se dit `danger` dans les jetons). */
type TonSatellite = "danger" | "warn" | "info";

const TON_DE_GRAVITE = { alert: "danger", warn: "warn", info: "info" } as const;
const RANG_DU_TON: Record<TonSatellite, number> = { danger: 0, warn: 1, info: 2 };

/** Au plus cinq satellites dessinés : au-delà, le disque serait un essaim illisible. */
export const SATELLITES_MAX = 5;

export interface SatellitesAstre {
  /** Les satellites dessinés, les plus graves d'abord (cinq au plus). */
  tons: TonSatellite[];
  /** Le nombre RÉEL d'alertes publiées par l'app : dit au lecteur d'écran, jamais tronqué. */
  total: number;
}

/**
 * Un satellite par alerte publiée par l'app. Seule une app qui répond a des alertes : une app
 * injoignable ou en cache n'en montre aucune (le hub ne sait pas), jamais « 0 alerte ».
 */
export function satellitesAstre(result: SummaryResult): SatellitesAstre {
  if (result.state !== "ok" || result.stale) return { tons: [], total: 0 };
  const alertes = result.summary.alerts;
  const tons = alertes
    .map((a) => TON_DE_GRAVITE[a.severity])
    .sort((a, b) => RANG_DU_TON[a] - RANG_DU_TON[b])
    .slice(0, SATELLITES_MAX);
  return { tons, total: alertes.length };
}

export interface Etoile {
  /** En pourcentage de la scène. */
  x: number;
  y: number;
  /** Rayon en pixels, de 0,5 à 1,5. */
  r: number;
  /** Décalage du scintillement, en secondes (négatif : l'animation est déjà en cours). */
  d: number;
}

/** Mulberry32, graine fixe : le même ciel au rendu serveur et au rendu client, et testable. */
function aleaSemee(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Le fond d'étoiles : DÉCOR pur, déterministe, qui ne représente rien (aucune donnée). Une
 * étoile ne s'allume jamais pour dire quelque chose : le mouvement qui parle est celui des astres.
 */
export function etoiles(n: number): Etoile[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`nombre d'étoiles invalide : ${n}`);
  const alea = aleaSemee(0x48ab21);
  return Array.from({ length: n }, () => ({
    x: arrondi(alea() * 100),
    y: arrondi(alea() * 100),
    r: arrondi(0.5 + alea()),
    d: -arrondi(alea() * 8),
  }));
}
