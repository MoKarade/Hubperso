// lib/liaVisite.ts — ce que fait LIA quand Marc touche « Analyser » sur un point à regarder. PUR :
// la poignée de LIA et la minuterie sont passées en paramètre, rien ne touche au navigateur.
//
// ⚠️ ELLE PARLE MÊME QUAND ELLE NE PEUT PAS BOUGER. `allerVoir` rend `false` si elle ne peut pas se
// déplacer (mouvement réduit, chat ouvert, menu ouvert, on la tient) : la première version s'arrêtait
// là, donc rien n'était dit. Constaté en production le 23/10/2026 par le PC (capture et DOM) : après
// « Analyser » sur CarAI, la page défilait, LIA ne bougeait pas et la bulle restait vide. Ne pas bouger
// n'est pas une raison de se taire : Marc a demandé l'état de cette app, il l'a.

import type { LiaHandle } from "@mokarade/lia-ui";

/** Temps laissé à LIA pour arriver près de la carte avant de parler (elle parle aussitôt si elle reste). */
export const DELAI_ARRIVEE_MS = 1500;

/** Combien de secondes elle reste collée à la carte. */
export const SECONDES_PRES_DE_LA_CARTE = 14;

let numeroVisite = 0;

/**
 * Le liseré de la carte dont elle parle (`data-regard`, `app/globals.css`) : posé quand elle parle, retiré quand
 * elle s'en va. Chaque visite signe son liseré : une revisite avant la fin de la première ne se le fait pas
 * retirer par la minuterie de l'ancienne.
 */
function regarder(carte: Element, planifier: Planifier): void {
  carte.ownerDocument?.querySelectorAll("[data-regard]").forEach((e) => e.removeAttribute("data-regard"));
  const signature = String(++numeroVisite);
  carte.setAttribute("data-regard", signature);
  planifier(() => {
    if (carte.getAttribute("data-regard") === signature) carte.removeAttribute("data-regard");
  }, SECONDES_PRES_DE_LA_CARTE * 1000);
}

export type Planifier = (action: () => void, delaiMs: number) => void;

/**
 * LIA va voir `carte` si elle le peut, puis dit `phrase`. Rend `true` quand elle s'est déplacée,
 * `false` quand elle a parlé sans bouger.
 */
export function visiterCarte(
  lia: Pick<LiaHandle, "allerVoir" | "dire">,
  carte: Element,
  phrase: string,
  planifier: Planifier,
  /** Appelée juste après qu'elle a parlé : la carte garde alors son constat (`lib/constat.ts`). */
  apresDire?: () => void,
): boolean {
  const deplacee = lia.allerVoir(carte, SECONDES_PRES_DE_LA_CARTE);
  planifier(() => {
    // ⚠️ `allerVoir` ne pose JAMAIS `data-regard` (seul le « voir » spontané de lia-ui le fait) : sans ce
    // liseré, Marc ne voyait pas de quelle carte elle parlait (constat du PC, 23/10/2026).
    regarder(carte, planifier);
    lia.dire(phrase);
    apresDire?.();
  }, deplacee ? DELAI_ARRIVEE_MS : 0);
  return deplacee;
}
