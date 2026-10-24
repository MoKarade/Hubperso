// lib/liaElement.ts — ce que le hub dit à LIA de l'élément sur lequel Marc fait un clic droit. PUR : rien ne touche
// au réseau, à la base ni au navigateur autrement qu'en LISANT l'élément qu'on lui passe.
//
// lia-ui ouvre déjà le menu à quatre entrées (« Explique-moi ça », « Que peut-on changer ici ? », « Regarde ça avec
// moi », « Poser une question… ») sur n'importe quel élément. Sa description par défaut ne connaît pas le hub : elle
// lit `data-lia-app` (l'identifiant « driveai », pas le nom) et le texte brut, sans dire que c'est un chiffre, une
// alerte ou une jauge. Ici le hub décrit SES éléments, en français, et nomme l'app par son nom.
//
// ⚠️ Ce qui sort d'ici finit dans la question envoyée au modèle : c'est une DONNÉE sur la page, jamais une consigne.
// Le texte d'un élément vient d'une app (libellé d'alerte, nom d'une métrique), donc de quelqu'un d'autre que Marc :
// `<` et `>` retirés, caractères de contrôle retirés, longueur bornée. Aucun lien (`href`), aucun attribut, aucun
// HTML ne sort. La description n'est ni journalisée ni mise en cache (`app/api/lia/ask/route.ts` : `no-store`, jamais
// la question dans un journal).

import type { DescriptionElement } from "@mokarade/lia-ui";
import { APPS_DEMANDE, NOM_PAR_DEFAUT, type AppDemande, type DepotDemande, type GenreDemande } from "@/lib/demandes";

/** Longueur maximale du texte lu (lia-ui coupe aussi à 300 : on borne avant, pour ne rien dépendre de lui). */
export const TEXTE_ELEMENT_MAX = 300;

/** Ce que le module lit d'un élément. Un `Element` du navigateur convient ; un faux objet aussi, dans les tests. */
export interface LecteurElement {
  matches(selecteur: string): boolean;
  closest(selecteur: string): LecteurElement | null;
  /** Facultatif : seul `cibleDemandeHub` lit `data-lia-app` (l'identifiant de l'app de la carte). */
  getAttribute?(nom: string): string | null;
  querySelector(selecteur: string): { textContent: string | null } | null;
  /** Le texte VISIBLE quand le navigateur le sait (`innerText` ignore ce qui est caché) ; sinon `textContent`. */
  readonly innerText?: string;
  readonly textContent: string | null;
}

/**
 * Les éléments du hub qu'on sait nommer, du plus précis au plus large. Le plus PROCHE ancêtre qui correspond gagne
 * (un chiffre dans une carte est « le chiffre principal », pas « la carte ») ; à égalité de niveau, l'ordre ci-dessous.
 * Les sélecteurs sont les classes réelles des composants (`components/*.tsx`) : si l'une est renommée, le test de
 * `tests/liaElement.test.ts` qui les lit dans les sources le dit.
 */
export const GENRES_HUB: ReadonlyArray<{ selecteur: string; genre: string; categorie: GenreDemande }> = [
  // `categorie` : le genre que MemoryAI accepte pour une demande « Que peut-on changer ici ? » (`lib/demandes.ts`).
  { selecteur: ".constat", genre: "le constat de LIA sur une carte", categorie: "texte" },
  { selecteur: ".heros__courbe, .metric__courbe, .sparkline", genre: "une courbe d’évolution", categorie: "graphique" },
  { selecteur: ".heros", genre: "le chiffre principal d’une carte", categorie: "tuile" },
  { selecteur: ".metric", genre: "une mesure d’une app", categorie: "tuile" },
  { selecteur: ".alert, .bandeau", genre: "une alerte", categorie: "texte" },
  { selecteur: ".badge", genre: "l’état d’une app", categorie: "autre" },
  { selecteur: ".widget__logo", genre: "le logo d’une app", categorie: "autre" },
  { selecteur: ".resume__point", genre: "un point à regarder", categorie: "texte" },
  { selecteur: ".resume__phrase", genre: "la phrase d’état du hub", categorie: "texte" },
  { selecteur: ".bandeau-attention", genre: "le bandeau d’attention", categorie: "texte" },
  { selecteur: ".couts-panneau__quota, .couts-panneau__jauge", genre: "une jauge de quota", categorie: "graphique" },
  { selecteur: ".couts-panneau__bloc", genre: "un bloc de coûts", categorie: "tuile" },
  { selecteur: ".widget", genre: "la carte d’une app", categorie: "tuile" },
  { selecteur: ".nav, .barre", genre: "la navigation", categorie: "page" },
];

const TOUS = GENRES_HUB.map((g) => g.selecteur).join(", ");

/** Le texte à joindre à la question : une ligne, sans `<` ni `>`, sans caractère de contrôle, borné. */
export function nettoyerTexte(brut: string | null | undefined): string {
  const net = (brut ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return net.length > TEXTE_ELEMENT_MAX ? `${net.slice(0, TEXTE_ELEMENT_MAX - 1).trimEnd()}…` : net;
}

/** Le nom affiché de l'app à laquelle appartient l'élément (le titre de sa carte), ou `undefined`. */
function nomDeLApp(el: LecteurElement): string | undefined {
  const carte = el.closest("[data-lia-app]");
  const nom = nettoyerTexte(carte?.querySelector(".widget__title")?.textContent);
  return nom === "" ? undefined : nom;
}

/**
 * ⚠️ La nappe de la carte. Le lien « Détail » recouvre TOUTE la carte (`.widget__detail::after`, `app/globals.css`) : un clic
 * droit sur le chiffre, la courbe ou une alerte sans lien tombe donc sur ce lien, pas sur l'élément qu'on voit. Viser
 * « Détail » voudrait dire « un lien » ; ce que Marc montre, c'est la carte : c'est elle qu'on décrit.
 */
function pointe(el: LecteurElement): LecteurElement {
  return el.matches(".widget__detail") ? (el.closest(".widget") ?? el) : el;
}

/** Les grands conteneurs : y viser un détail qu'on ne sait pas nommer, c'est viser CE détail, pas tout le conteneur. */
const CONTENEURS = ".widget, .couts-panneau__bloc, .nav, .barre";

/**
 * La description de `el` pour LIA. Le hub nomme ses blocs connus (chiffre, mesure, alerte, jauge, courbe…) ; pour un
 * détail dans un grand conteneur (un mot dans le pied d'une carte), `repli` décrit l'élément PRÉCIS (lia-ui sait dire
 * « un texte », « un bouton ») et on lui ajoute le nom de l'app. Sans `repli`, c'est le conteneur qui est décrit.
 * `repli` rend `null` pour dire « pas cet élément » : le menu du navigateur reste.
 */
export function decrireElementHub<E extends LecteurElement>(
  el: E,
  repli?: (el: E) => DescriptionElement | null,
): DescriptionElement | null {
  const proche = pointe(el).closest(TOUS);
  const genre = proche ? GENRES_HUB.find((g) => proche.matches(g.selecteur))?.genre : undefined;
  if (!proche || genre === undefined) return repli ? repli(el) : null;

  if (repli && proche !== pointe(el) && proche.matches(CONTENEURS)) {
    const precis = repli(el);
    if (precis === null) return null;
    // Le repli est celui de lia-ui : on repasse son texte, son genre et son nom par le même nettoyage.
    // Le NOM affiché de l'app l'emporte sur l'identifiant que lia-ui lit dans `data-lia-app` (« driveai »).
    const nomPropre = nettoyerTexte(precis.nom);
    const nom = nomDeLApp(proche) ?? (nomPropre !== "" ? nomPropre : undefined);
    const texte = nettoyerTexte(precis.texte);
    return { genre: nettoyerTexte(precis.genre), ...(nom !== undefined && { nom }), ...(texte !== "" && { texte }) };
  }

  const texte = nettoyerTexte(proche.innerText ?? proche.textContent);
  const nom = nomDeLApp(proche);
  return { genre, ...(nom !== undefined && { nom }), ...(texte !== "" && { texte }) };
}

/**
 * Ce qu'on GARDE quand Marc demande « Que peut-on changer ici ? » sur `el` (`lib/demandes.ts`, MemoryAI). Jamais le texte
 * de l'élément : `nom` est la phrase du hub qui le décrit (`GENRES_HUB`), `app` l'identifiant de la carte qui le contient
 * (`hub` hors d'une carte d'app ou si l'identifiant n'est pas celui d'une app du parc), `genre` la catégorie de MemoryAI.
 * Un élément que le hub ne sait pas nommer reste une demande honnête : « un élément de la page », genre « autre ».
 * Même résolution que `decrireElementHub` : « Détail » (la nappe) vaut la carte ; un détail dans une carte vaut la carte.
 */
export function cibleDemandeHub(el: LecteurElement): DepotDemande {
  const id = el.closest("[data-lia-app]")?.getAttribute?.("data-lia-app") ?? "";
  const app: AppDemande = (APPS_DEMANDE as readonly string[]).includes(id) && id !== "hub" ? (id as AppDemande) : "hub";
  const proche = pointe(el).closest(TOUS);
  const entree = proche ? GENRES_HUB.find((g) => proche.matches(g.selecteur)) : undefined;
  return entree ? { app, genre: entree.categorie, nom: entree.genre } : { app, genre: "autre", nom: NOM_PAR_DEFAUT };
}
