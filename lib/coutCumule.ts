// lib/coutCumule.ts — le coût API CUMULÉ des apps, en une réponse que le suivi peut lire.
// PUR : aucune base, aucun réseau (les derniers relevés se passent en paramètre).
//
// ── CE QUE C'EST ────────────────────────────────────────────────────────────────────
// La somme des `usage.cost` de période `total` que les apps publient déjà, relue depuis la
// mémoire du hub (le relevé tourne toutes les 30 min). Même règle que `lib/usage.ts` : on ne
// fusionne JAMAIS deux périodes. Une app qui publie un coût « mois » (DriveAI) ou « jour » ne
// contribue donc PAS au cumulé : elle est « non lisible » pour ce chiffre, comme une app sans
// coût du tout. Jamais un 0 : un 0 se lirait « rien dépensé » alors que la vérité est « je ne
// sais pas ».
//
// ── POURQUOI CE RÉSULTAT PEUT ÊTRE PUBLIC ───────────────────────────────────────────
// Il ne porte qu'un total en dollars, une heure de mesure et les identifiants des apps (déjà
// publics : ce sont les sous-domaines). Ni détail par app, ni personne, ni jeton.

import type { Releve } from "@/lib/historique";
import { toCad, USD_TO_CAD } from "@/lib/usage";

export interface CoutCumule {
  periode: "total";
  devise: "CAD";
  /** Taux USD→CAD appliqué : le chiffre est une ESTIMATION en CAD (voir `toCad`). */
  tauxUsdCad: number;
  /** Somme des apps lisibles, ou `null` si aucune ne l'est. Jamais 0 faute de mesure. */
  cumulCad: number | null;
  /**
   * La mesure la plus ANCIENNE parmi les apps lues (ISO 8601), ou `null`. On prend la plus
   * vieille et non la plus récente : le total n'est pas plus frais que son plus vieux terme.
   */
  dataAsOf: string | null;
  apps: {
    lues: number;
    /** Identifiants des apps qui n'entrent pas dans le cumulé, et qu'on ne compte pas comme 0. */
    nonLisibles: string[];
  };
}

/**
 * @param appIds les apps du hub (l'ensemble qu'on cherche à couvrir)
 * @param derniers le relevé le PLUS RÉCENT portant un coût, par app (au plus un par app)
 */
export function cumulerCouts(appIds: readonly string[], derniers: readonly Releve[]): CoutCumule {
  const parApp = new Map(derniers.map((r) => [r.appId, r]));
  let somme = 0;
  let lues = 0;
  let plusAncien: number | null = null;
  const nonLisibles: string[] = [];

  for (const id of appIds) {
    const releve = parApp.get(id);
    const cout = releve?.cout;
    if (!releve || !cout || cout.periode !== "total" || !(cout.montant >= 0)) {
      nonLisibles.push(id);
      continue;
    }
    somme += toCad(cout.montant, cout.devise);
    lues += 1;
    const mesure = releve.dataAsOf ?? releve.releveLe;
    plusAncien = plusAncien === null ? mesure : Math.min(plusAncien, mesure);
  }

  return {
    periode: "total",
    devise: "CAD",
    tauxUsdCad: USD_TO_CAD,
    cumulCad: lues === 0 ? null : Math.round(somme * 100) / 100,
    dataAsOf: plusAncien === null ? null : new Date(plusAncien).toISOString(),
    apps: { lues, nonLisibles },
  };
}
