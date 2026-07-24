// lib/bento.ts — logique PURE de la mise en page bento (testable, sans rendu).
//
// Problème résolu : quand plusieurs widgets sont « riches » (beaucoup de métriques), ils
// prenaient TOUS 2 colonnes sur 3 et s'empilaient dans la colonne de gauche. Ici on crée
// une vraie hiérarchie : UN héros (grand), le reste en colonnes simples → ça pave proprement.

export interface BentoItem {
  ok: boolean;
  /** Nombre de métriques du summary (0 si l'app n'est pas « ok »). */
  metrics: number;
}

/** Index du widget « héros » : le plus riche en métriques parmi les OK, -1 si aucun. */
export function heroIndex(items: BentoItem[]): number {
  let best = -1;
  let bestN = 0; // un héros a au moins 1 métrique, sinon pas de héros
  items.forEach((it, i) => {
    if (it.ok && it.metrics > bestN) {
      bestN = it.metrics;
      best = i;
    }
  });
  return best;
}

export type WidgetSize = "widget--lg" | "widget--md" | "widget--sm";

/**
 * Taille bento d'un widget : le héros est grand (2×2), une app OK avec des métriques est
 * moyenne (1 colonne), le reste (vide / en erreur) est petit. Un seul grand → pas d'empilement.
 */
export function widgetSize(ok: boolean, metrics: number, featured: boolean): WidgetSize {
  if (featured) return "widget--lg";
  if (ok && metrics >= 1) return "widget--md";
  return "widget--sm";
}
