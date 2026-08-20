// lib/status.ts
//
// Traduit un SummaryResult (état de fetch + status du contrat) en un badge d'affichage
// unique : un ton sémantique + un libellé fr-CA. Source de vérité pour la couleur d'un
// widget, réutilisée par StatusBadge et le liseré de l'AppWidget.

import type { SummaryResult } from "./fetchSummary";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

export interface StatusBadgeInfo {
  tone: Tone;
  label: string;
}

export function statusBadge(result: SummaryResult): StatusBadgeInfo {
  switch (result.state) {
    case "unconfigured":
      return { tone: "neutral", label: "Non configurée" };
    case "unauthorized":
      return { tone: "danger", label: "Non autorisée" };
    case "unreachable":
      return { tone: "danger", label: "Injoignable" };
    case "invalid":
      return { tone: "danger", label: "Réponse invalide" };
    // `warn` et pas `danger` : l'app fonctionne, c'est le hub qui est en retard d'un re-pin.
    // Le ton dit à qui est le problème.
    case "contract-too-new":
      return { tone: "warn", label: "Contrat trop récent" };
    case "ok":
      // Résumé servi depuis le cache (app pas jointe à temps) : honnête, jamais « À jour ».
      if (result.stale) return { tone: "warn", label: "En cache" };
      switch (result.summary.status) {
        case "ok":
          return { tone: "ok", label: "À jour" };
        case "degraded":
          return { tone: "warn", label: "Données en retard" };
        case "error":
          return { tone: "danger", label: "En erreur" };
        case "building":
          return { tone: "info", label: "En construction" };
      }
  }
}

/** Ton d'une sévérité de métrique ou d'alerte du contrat. */
export function severityTone(severity: "ok" | "warn" | "alert" | "info"): Tone {
  switch (severity) {
    case "ok":
      return "ok";
    case "warn":
      return "warn";
    case "alert":
      return "danger";
    case "info":
      return "info";
  }
}
