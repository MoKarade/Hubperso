// lib/liaContexte.ts — ce que le hub joint à une question de LIA : le bilan d'état des apps, tiré des
// relevés (`lib/bilanEtat.ts`). L'I/O est ici, le calcul reste pur de l'autre côté.
//
// Une donnée DATÉE, jamais une consigne (ADR 0006). Elle ne part qu'après le contrôle du propriétaire :
// la route ne l'appelle qu'une fois la demande acceptée. Elle ne fait JAMAIS échouer la question : une
// lecture impossible laisse un contexte où chaque app est dite « sans historique (aucun relevé lu) »,
// ce qui reste vrai (rien n'a été lu) sans prétendre que l'app n'a jamais eu de coupure.

import { bilanApp, texteBilans } from "./bilanEtat";
import { lireHistoriqueTous } from "./historiqueDb";
import { maintenantMs } from "./horloge";
import { SOURCE_DEFS } from "./sources";

/** Le bilan daté de toutes les apps du hub, prêt pour le champ `contexte` du corps hub → MemoryAI. */
export async function contexteEtatApps(): Promise<string> {
  const maintenant = maintenantMs();
  const ids = SOURCE_DEFS.map((d) => d.id);
  const historiques = await lireHistoriqueTous(ids);
  const bilans = SOURCE_DEFS.map((d) => bilanApp(d.id, d.name, historiques.get(d.id) ?? [], maintenant));
  return texteBilans(bilans, maintenant);
}
