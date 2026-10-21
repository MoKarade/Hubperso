// lib/grapheVue3d.ts — la page 3D d'un dépôt, et le lien 2D ↔ 3D de la page d'origine.
//
// La vue 3D n'est PAS le `graph.html` du dépôt : c'est une page du hub (coque minuscule) qui charge
//   - `/vendor/3d-force-graph-1.80.1.min.js`  — bibliothèque auto-hébergée, empreinte verrouillée ;
//   - `/graphes/vue3d.js`                      — le visualiseur du hub, relu comme le reste du code ;
// et reçoit les nœuds et les liens en JSON inerte (`<script type="application/json">`, jamais
// exécuté). Le contenu du dépôt n'y est donc que des CHAÎNES, posées par `textContent` : aucune
// couleur, aucun HTML, aucun script du dépôt. Même CSP que la page 2D (route `/api/graphes/[depot]`).
//
// Les couleurs et les styles vivent dans le fichier statique : la page est servie en bac à sable
// (origine opaque), elle ne voit ni `globals.css` ni ses variables.

import type { DonneesGraphe } from "./grapheDonnees";

export const LIB3D_VERSION = "1.80.1";
export const LIB3D = `/vendor/3d-force-graph-${LIB3D_VERSION}.min.js`;
/** Empreinte sha384 de la copie locale, identique à celle du paquet npm 3d-force-graph (test). */
export const LIB3D_SRI = "sha384-i98VDQKdpyVrtyuFn0fjUWJBLBmxnqHqOANcvYe9HLJUgT2wPixa4ZkLd7Dh3VEk";
export const VISUALISEUR3D = "/graphes/vue3d.js";
export const BASCULE_2D = "/graphes/bascule.js";

export type VueGraphe = "2d" | "3d";

/** `?vue=2d` demande la vue 2D ; tout le reste (absent, inconnu) donne la 3D, la vue par défaut. */
export function vueDemandee(valeur: string | null): VueGraphe {
  return valeur === "2d" ? "2d" : "3d";
}

function echapperHtml(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** JSON sûr à poser dans un `<script>` : plus aucun `<` (donc pas de `</script>`) ni de U+2028/9. */
export function jsonPourScript(valeur: unknown): string {
  return JSON.stringify(valeur)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export interface IdentiteGraphe {
  depot: string;
  sha: string;
}

export function pageVue3d(id: IdentiteGraphe, donnees: DonneesGraphe): string {
  const charge = jsonPourScript({
    depot: id.depot,
    sha: id.sha.slice(0, 7),
    noeuds: donnees.noeuds,
    liens: donnees.liens,
  });
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>${echapperHtml(id.depot)} — graphe 3D</title>
</head>
<body>
<script type="application/json" id="donnees">${charge}</script>
<script src="${LIB3D}"></script>
<script src="${VISUALISEUR3D}"></script>
<noscript>Le graphe 3D demande JavaScript.</noscript>
</body>
</html>
`;
}

/**
 * Ajoute à la page 2D d'origine le bouton « 3D » (et, si on y est retombé, la raison). Le bouton est
 * posé par un script du hub, pas par du HTML en ligne : les styles n'ont pas à vivre ici.
 */
export function avecBascule3d(html: string, cause?: string): string {
  const attribut = cause ? ` data-cause="${echapperHtml(cause)}"` : "";
  const balise = `<script src="${BASCULE_2D}"${attribut}></script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => `${balise}</body>`) : html + balise;
}
