// lib/bento.ts — logique PURE de la mise en page bento (testable, sans rendu).
//
// Problème résolu : quand plusieurs widgets sont « riches » (beaucoup de métriques), ils
// prenaient TOUS 2 colonnes sur 3 et s'empilaient dans la colonne de gauche. Ici on crée
// une vraie hiérarchie : UN héros (grand), le reste en colonnes simples → ça pave proprement.
//
// Le héros n'est PLUS élu ici. Il est déclaré dans `lib/sources.ts` (`hero: true`), pour que
// la grille soit connue AVANT les données — condition nécessaire au rendu en flux : une carte
// qui arrive après les autres doit tomber dans un emplacement déjà réservé, sinon la page
// saute sous les yeux. L'ancienne élection (`heroIndex`, « le plus de métriques ») imposait
// d'attendre la réponse de TOUTES les apps pour savoir quoi dessiner.

export type WidgetSize = "widget--lg" | "widget--md" | "widget--sm";

/**
 * Taille bento d'un widget : le héros est grand (2×2), une app OK avec des métriques est
 * moyenne (1 colonne), le reste (vide / en erreur) est petit. Un seul grand → pas d'empilement.
 *
 * ⚠️ `--md` et `--sm` occupent la MÊME place dans la grille (`grid-column: span 1`) : la
 * distinction est sémantique et sert au style, jamais à la géométrie. C'est ce qui rend la
 * mise en page décidable sans les données — seul `featured` change la géométrie.
 */
export function widgetSize(ok: boolean, metrics: number, featured: boolean): WidgetSize {
  if (featured) return "widget--lg";
  if (ok && metrics >= 1) return "widget--md";
  return "widget--sm";
}
