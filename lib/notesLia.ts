// lib/notesLia.ts — le NOMBRE de notes que LIA a laissées au coordinateur et qu'il n'a pas lues.
//
// MemoryAI (ADR 0022) publie ce nombre dans son résumé, sous la métrique « Notes de LIA non lues » (jamais le contenu,
// le genre ni l'app). Le hub n'a rien de neuf à détenir : il lit ce résumé avec le `HUB_TOKEN` qu'il a déjà, et le PC
// de Marc, qui n'a que `GANTT_SECRET`, lui demande ce nombre par `/api/chantier/notes-lia`.
//
// Pur : le résultat d'un fetch entre, un nombre ou `null` sort. `null` = « je ne sais pas » (app injoignable, résumé
// invalide, métrique absente parce que MemoryAI n'a pas pu compter) ; jamais 0 pour masquer une panne.

import type { SummaryResult } from "./fetchSummary";

/** Le libellé EXACT que publie MemoryAI (MemoryAI#399) ; un libellé qui change côté MemoryAI doit casser ici, pas se taire. */
export const LIBELLE_NOTES_LIA = "Notes de LIA non lues";

export function notesLiaNonLues(resultat: SummaryResult): number | null {
  if (resultat.state !== "ok" || resultat.stale) return null;
  const metrique = resultat.summary.metrics.find((m) => m.label === LIBELLE_NOTES_LIA);
  if (!metrique || typeof metrique.value !== "number") return null;
  return Number.isInteger(metrique.value) && metrique.value >= 0 ? metrique.value : null;
}
