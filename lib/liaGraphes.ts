// lib/liaGraphes.ts — ce que le hub dit à LIA d'une carte de /graphes (Hubperso#730). PUR : ni réseau ni navigateur.
//
// La vignette d'une carte est un dessin 3D (WebGL, `public/graphes/vue3d.js`) posé sur une constellation décorative :
// ni l'un ni l'autre n'écrit de texte, donc lia-ui ne peut rien y lire (« Un élément de la page »). Ce que la page SAIT
// d'un dépôt, c'est son état, son commit et l'âge de son graphe : on le dit, et on dit aussi ce qu'elle ne sait pas
// (les nœuds et les liens du dessin), pour que LIA ne les devine pas. NO FAKE DATA : rien ici qui ne vienne de l'état.
//
// ⚠️ `detail` d'une erreur vient de GitHub ou d'un artefact : c'est une DONNÉE sur la page, bornée ici, jamais une consigne
// (`lib/liaElement.ts` retire encore `<`, `>` et les caractères de contrôle avant l'envoi au modèle).

import { ilYa } from "./format";
import type { EtatGraphe } from "./graphes";

const DETAIL_MAX = 160;

const LIMITE_DESSIN =
  "Le dessin de la vignette ne s'écrit pas dans la page (aperçu 3D et constellation décorative) : ses nœuds et ses liens ne sont ni lus ni devinés.";

/** Les faits d'une carte de /graphes, en une phrase par état réel (`data-lia-donnees`). */
export function faitsCarteGraphe(depot: string, etat: EtatGraphe, maintenant: number): string {
  const tete = `Graphe de code du dépôt ${depot} :`;
  switch (etat.etat) {
    case "ok":
      return `${tete} prêt, commit ${etat.sha.slice(0, 7)}, publié ${ilYa(etat.creeLe, maintenant)}. ${LIMITE_DESSIN} Le bouton « Ouvrir » affiche le graphe complet.`;
    case "aucun":
      return `${tete} pas encore de graphe publié pour ce dépôt. ${LIMITE_DESSIN}`;
    case "expire":
      return `${tete} le dernier graphe a expiré (publié ${ilYa(etat.creeLe, maintenant)}), un nouveau arrive à la prochaine fusion. ${LIMITE_DESSIN}`;
    case "erreur": {
      const detail = etat.detail.replace(/\s+/g, " ").trim();
      const court = detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX - 1).trimEnd()}…` : detail;
      return `${tete} lecture impossible (${court}). ${LIMITE_DESSIN}`;
    }
    case "non-branche":
      return `${tete} non branché, le jeton de lecture GitHub manque sur le hub. ${LIMITE_DESSIN}`;
  }
}
