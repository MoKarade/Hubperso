// lib/tauxChangeDb.ts — lire le taux USD→CAD du dernier relevé du PC. L'I/O, séparée du raisonnement (`lib/tauxChange.ts` est PUR).
//
// Un relevé illisible ne fait jamais tomber une page de coûts : le repli s'applique, avec sa cause, et l'erreur est écrite au journal.

import { baseConfiguree } from "@/lib/db";
import { lireQuotaGantt } from "@/lib/ganttDb";
import { maintenantMs } from "@/lib/horloge";
import { lireTaux, type TauxChange } from "@/lib/tauxChange";

export async function lireTauxCourant(): Promise<TauxChange> {
  if (!baseConfiguree()) return lireTaux(null, maintenantMs());
  try {
    return lireTaux(await lireQuotaGantt(), maintenantMs());
  } catch (erreur) {
    console.error("[taux] le dernier relevé du PC n'est pas lisible", erreur);
    return { ...lireTaux(null, maintenantMs()), motif: "le relevé du PC n'a pas pu être lu" };
  }
}
