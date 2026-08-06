// lib/alertes.ts — quelle alerte mérite un bandeau, et laquelle reste dans la liste.
//
// Logique PURE (testable sans rendu), et surtout GÉNÉRIQUE : la décision ne repose que sur
// la `severity` du contrat, jamais sur l'app ni sur le texte de l'alerte. Le hub ne connaît
// aucune app en particulier — ajouter une sixième app ne demande rien ici.
//
// POURQUOI SEULEMENT `alert`, ET PAS `warn`. Le contrat a trois niveaux : info, warn, alert.
// Un bandeau sur `warn` en produirait presque en permanence (un coût qui monte, une donnée
// un peu en retard), et un bandeau permanent cesse d'être lu — c'est le même raisonnement
// qui a fait sortir l'audit de sécurité du gate de CI dans ce dépôt : « on prendrait
// l'habitude du rouge ». `alert` est le niveau que les apps réservent à ce qui demande une
// action ; c'est celui qui mérite d'interrompre le regard.
//
// Les états d'ÉCHEC DE FETCH (injoignable, non autorisée, réponse invalide) ne passent pas
// par ici : une app qui ne répond pas n'a pas d'alertes à remonter. Ils ont déjà leur badge
// de statut et leur message dans le corps de la carte.

import type { HubAlert } from "@mokarade/hub-contract";

export interface AlertesSeparees {
  /** L'alerte promue en bandeau, ou `null` si aucune n'atteint la sévérité `alert`. */
  bandeau: HubAlert | null;
  /** Les autres, dans l'ordre d'origine — le bandeau n'y est jamais répété. */
  reste: HubAlert[];
}

/**
 * Sépare la première alerte de sévérité `alert` du reste.
 *
 * PREMIÈRE et non « la pire » : le contrat n'ordonne pas les alertes entre elles au-delà de
 * la sévérité, et l'app les publie déjà dans l'ordre où ELLE juge utile de les lire. Prendre
 * la première respecte ce choix au lieu de le réinventer.
 *
 * Une seule est promue : deux bandeaux sur une même carte recréeraient la liste qu'on essaie
 * justement de faire ressortir.
 */
export function separerAlertes(alerts: HubAlert[]): AlertesSeparees {
  const index = alerts.findIndex((a) => a.severity === "alert");
  if (index === -1) return { bandeau: null, reste: alerts };
  return {
    bandeau: alerts[index] ?? null,
    reste: alerts.filter((_, i) => i !== index),
  };
}
