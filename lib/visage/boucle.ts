// lib/visage/boucle.ts — la boucle d'animation du visage, sans rien savoir du navigateur.
//
// Tout ce qui vient du navigateur (image suivante, densité de pixels, mouvement réduit, taille et
// visibilité de l'élément) entre par `Environnement` : le composant lui donne les vrais,
// `tests/visage.test.ts` en donne de faux et fait tourner la boucle à la main.
//
// Règles : une seule boucle par visage ; elle ne dessine que si le visage est à l'écran ; le
// canvas fait 230 % de l'élément (le halo et les accessoires débordent) et sa définition suit la
// densité de pixels (2 au plus : au-delà, le coût monte sans que l'œil le voie) ; avec le
// mouvement réduit, une image fixe est dessinée, puis plus rien ne tourne.

import { avancer, changerEtat, creerVisage, viser as viserVisage, type Visage } from "@/lib/visage/moteur";
import { dessiner } from "@/lib/visage/dessin";
import type { EtatAssistant } from "@/lib/visage/etats";

/** Le canvas déborde de l'élément : 230 % de sa largeur. */
export const DEBORD = 2.3;
/** Pas de temps maximal : un onglet qui se réveille ne fait pas un bond. */
const PAS_MAX = 0.05;
const DENSITE_MAX = 2;

export interface Environnement {
  image(rappel: (horodatage: number) => void): number;
  annulerImage(id: number): void;
  densite(): number;
  mouvementReduit(): boolean;
  /** Appelle `rappel(largeur)` à chaque changement de largeur ; renvoie la fonction d'arrêt. */
  observerTaille(hote: HTMLElement, rappel: (largeur: number) => void): () => void;
  /** Appelle `rappel(visible)` quand l'élément entre ou sort de l'écran ; renvoie l'arrêt. */
  observerVisibilite(hote: HTMLElement, rappel: (visible: boolean) => void): () => void;
}

export interface Pilote {
  etat(etat: EtatAssistant): void;
  viser(angle: number): void;
  imposer(expression: string | null): void;
  arreter(): void;
}

export interface Depart {
  etat: EtatAssistant;
  expression?: string | null;
  cible?: number;
}

export function lancerVisage(hote: HTMLElement, toile: HTMLCanvasElement, env: Environnement, depart: Depart): Pilote {
  const c = toile.getContext("2d");
  const reduit = env.mouvementReduit();
  const v: Visage = creerVisage(depart.etat, { reduit, imposee: depart.expression ?? null });
  if (depart.cible !== undefined) viserVisage(v, depart.cible);
  let largeur = 0;
  let densite = 1;
  let visible = true;
  let id: number | null = null;
  let dernier = 0;
  let arrete = false;

  function dimensionner(l: number): void {
    largeur = l;
    densite = Math.min(env.densite(), DENSITE_MAX);
    const cote = Math.round(l * DEBORD * densite);
    if (toile.width !== cote) {
      toile.width = cote;
      toile.height = cote;
    }
  }

  function image(horodatage: number): void {
    id = null;
    if (arrete) return;
    const dt = reduit ? 0 : dernier ? Math.min(PAS_MAX, (horodatage - dernier) / 1000) : 0.016;
    dernier = horodatage;
    if (c && visible && largeur > 0) {
      avancer(v, dt);
      dessiner(c, largeur, densite, v);
      // Le CSS retire la sphère de repli dès qu'une vraie image est dessinée.
      toile.dataset.pret = "oui";
    }
    // Mouvement réduit ou hors écran : on s'arrête là, `planifier` en redemande une au prochain changement.
    if (!reduit && visible) planifier();
  }

  function planifier(): void {
    if (id === null && !arrete) id = env.image(image);
  }

  const arretTaille = env.observerTaille(hote, (l) => {
    dimensionner(l);
    planifier();
  });
  const arretVisible = env.observerVisibilite(hote, (vis) => {
    visible = vis;
    dernier = 0;
    planifier();
  });

  planifier();
  return {
    etat(etat) {
      changerEtat(v, etat);
      planifier();
    },
    viser(angle) {
      viserVisage(v, angle);
      planifier();
    },
    imposer(expression) {
      v.imposee = expression;
      planifier();
    },
    arreter() {
      arrete = true;
      if (id !== null) env.annulerImage(id);
      id = null;
      arretTaille();
      arretVisible();
    },
  };
}
