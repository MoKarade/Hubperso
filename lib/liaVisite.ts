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
): boolean {
  const deplacee = lia.allerVoir(carte, SECONDES_PRES_DE_LA_CARTE);
  planifier(() => {
    lia.dire(phrase);
  }, deplacee ? DELAI_ARRIVEE_MS : 0);
  return deplacee;
}
