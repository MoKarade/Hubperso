// lib/grapheVue3d.ts — les pièces de la vue 3D des graphes (constantes, choix de vue, bouton 3D).
//
// La vue 3D n'est PAS le `graph.html` du dépôt : c'est le visualiseur du hub (`public/graphes/vue3d.js`)
// qui lit les nœuds et les liens que la route sert en JSON inerte (`?vue=donnees`, voir
// `lib/grapheDonnees.ts`). Le contenu du dépôt n'y est que des CHAÎNES, posées par `textContent` :
// aucune couleur, aucun HTML, aucun script du dépôt. Les couleurs et les styles vivent dans le
// fichier statique, qui ne lit pas `globals.css`.
//
// Le `graph.html` d'origine (vis-network, en bac à sable) reste servi par `?vue=2d`, avec un bouton
// « 3D » qui ramène à /graphes, où le graphe s'ouvre sur place.

const LIB3D_VERSION = "1.80.1";
export const LIB3D = `/vendor/3d-force-graph-${LIB3D_VERSION}.min.js`;
/** Empreinte sha384 de la copie locale, identique à celle du paquet npm 3d-force-graph (test). */
export const LIB3D_SRI = "sha384-i98VDQKdpyVrtyuFn0fjUWJBLBmxnqHqOANcvYe9HLJUgT2wPixa4ZkLd7Dh3VEk";
export const VISUALISEUR3D = "/graphes/vue3d.js";
export const BASCULE_2D = "/graphes/bascule.js";

export type VueGraphe = "2d" | "donnees";

/** `?vue=donnees` demande le JSON de la 3D ; tout le reste (absent, inconnu) donne la page 2D d'origine. */
export function vueDemandee(valeur: string | null): VueGraphe {
  return valeur === "donnees" ? "donnees" : "2d";
}

function echapperHtml(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Ajoute à la page 2D d'origine le bouton « 3D » (et, si on y est retombé, la raison). Le bouton est
 * posé par un script du hub, pas par du HTML en ligne : les styles n'ont pas à vivre ici.
 * `id` est l'identifiant d'URL du dépôt (`idDepot`), celui de la carte à ouvrir sur /graphes.
 */
export function avecBascule3d(html: string, id: string, cause?: string): string {
  const attributs = ` data-depot="${echapperHtml(id)}"` + (cause ? ` data-cause="${echapperHtml(cause)}"` : "");
  const balise = `<script src="${BASCULE_2D}"${attributs}></script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => `${balise}</body>`) : html + balise;
}
