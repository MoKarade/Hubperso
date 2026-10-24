// lib/chantier.ts — affichage de l'état du relevé Gantt pour la page Chantier.
//
// PUR : aucun appel I/O, aucune base de données.
// Reçoit le relevé lu en base (ou `null`, ou une erreur) et produit les libellés
// exacts pour l'affichage propriétaire de la page `/chantier`.
//
// ── NO FAKE DATA ─────────────────────────────────────────────────────────────────────
//
// - Sans ligne en base : « Aucun relevé reçu pour l'instant » (jamais une date inventée).
// - Base injoignable : « Le relevé est indisponible : <détail> » (ne fait pas passer une
//   panne pour une absence de données).
// - Avec un relevé : affiche uniquement l'heure de réception par le hub et l'heure d'envoi
//   par le PC, à l'heure du Québec (`FUSEAU`, via `formatDateTime`).
// - AUCUN contenu du relevé (titres de tâches privés) n'est traité ni exposé.

import { formatDateTime } from "./format";

export type LigneGanttSimple = {
  recuLe: Date | string;
  envoyeLe: Date | string;
};

export type EtatChantier =
  | {
      type: "ok";
      recuTexte: string;
      envoyeTexte: string;
    }
  | {
      type: "aucun";
      message: string;
    }
  | {
      type: "indisponible";
      message: string;
    };

/**
 * Calcule l'état d'affichage pour la page Chantier à partir du relevé Gantt lu en base.
 */
export function etatChantier(
  releve: LigneGanttSimple | null,
  erreur?: unknown,
): EtatChantier {
  if (erreur !== undefined && erreur !== null) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    return {
      type: "indisponible",
      message: `Le relevé est indisponible : ${detail}`,
    };
  }

  if (!releve) {
    return {
      type: "aucun",
      message: "Aucun relevé reçu pour l'instant",
    };
  }

  const recuIso =
    typeof releve.recuLe === "string"
      ? releve.recuLe
      : releve.recuLe.toISOString();
  const envoyeIso =
    typeof releve.envoyeLe === "string"
      ? releve.envoyeLe
      : releve.envoyeLe.toISOString();

  const recuFormate = formatDateTime(recuIso);
  const envoyeFormate = formatDateTime(envoyeIso);

  return {
    type: "ok",
    recuTexte: `Dernier relevé reçu à ${recuFormate}`,
    envoyeTexte: `Envoyé par le PC le ${envoyeFormate}`,
  };
}
