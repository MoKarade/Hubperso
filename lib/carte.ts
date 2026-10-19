// lib/carte.ts — ce qu'une carte AFFICHE, décidé sans rendu. PUR : pas de base, pas de
// réseau, le « maintenant » en paramètre.
//
// Le composant ne fait que peindre. Tout ce qui relève du jugement — quelle métrique domine,
// que dire de sa fraîcheur, quelle alerte remonte — se décide ici, où ça se teste.
//
// ── UNE DÉCISION QUI MÉRITE D'ÊTRE EXPLIQUÉE : « INCHANGÉ » N'EST PAS UNE ALERTE ─────
//
// La mémoire sait dire « ce chiffre n'a pas bougé depuis 14 jours ». La tentation est d'en
// faire un avertissement automatique. On ne le fait PAS, et c'est délibéré.
//
// Beaucoup de métriques ne bougent légitimement jamais : « 3 véhicules », « 2 comptes »,
// « 1 200 recettes au catalogue » un jour sans import. Les peindre en orange apprendrait à
// Marc à ignorer l'orange — et le jour où une campagne se bloque vraiment, l'avertissement
// serait déjà devenu du bruit.
//
// Surtout : décider qu'une métrique DEVRAIT bouger demande de savoir ce qu'elle mesure.
// C'est précisément la connaissance app par app que le hub s'interdit (§1, « générique par
// le contrat »). L'information est donc affichée, NEUTRE, à côté de la courbe : « inchangé
// depuis 14 j ». Le chiffre est là, le jugement reste humain — et c'est déjà tout ce qui
// manquait le jour où une campagne est restée à 322 documents sur 1207 pendant deux semaines.

import type { HubAlert, HubMetric, HubQuota, HubSummary } from "@mokarade/hub-contract";
import { formatDuree, formatMetricValue, formatTrend } from "./format";
import { safeHttpUrl } from "./url";
import { texteSur } from "./couleur";
import { phraseManques, type SummaryResult } from "./fetchSummary";
import { inchangeDepuisMs, serieMetrique, variation, type Point, type Releve, type Variation } from "./historique";

/** Fenêtre de comparaison affichée sous la métrique héros. */
export const FENETRE_VARIATION_MS = 7 * 24 * 60 * 60_000;

/**
 * En deçà, « inchangé depuis 20 minutes » n'apprend rien : c'est l'intervalle de relevé.
 * Le seuil existe pour éviter d'écrire une évidence, pas pour juger l'app.
 */
export const SEUIL_INCHANGE_MS = 24 * 60 * 60_000;

interface Heros {
  metrique: HubMetric;
  /** Vide quand la métrique n'est pas numérique ou que la mémoire est encore jeune. */
  serie: Point[];
  variation: Variation | null;
  /** `null` si on ne sait pas, ou si c'est trop récent pour valoir la peine d'être dit. */
  inchangeDepuisMs: number | null;
}

/**
 * Une recommandation prête à peindre : le lien est DÉJÀ jugé.
 *
 * ⚠️ `href` passe par `safeHttpUrl` ICI, pas dans le composant. Le champ vient du contrat,
 * donc d'une app, donc de l'extérieur : `z.string().url()` accepte `javascript:…`. Le rendre
 * brut ferait de chaque app un vecteur d'exécution dans le hub. Le juger dans la fonction
 * PURE le met sous test, là où un composant l'aurait mis sous relecture.
 *
 * `null` veut dire « texte affiché, non cliquable » — jamais « recommandation masquée » : le
 * conseil reste lisible même quand son lien est refusé.
 */
export interface Recommandation {
  label: string;
  /** Le « pourquoi », tel que l'app le publie. Borné à 140 par le contrat. */
  pourquoi: string | null;
  /** Lien validé http(s), ou `null` s'il est absent ou refusé. */
  href: string | null;
}

/**
 * La PLACE dont dispose la carte dans la grille bento — pas un goût, une géométrie.
 *
 * ⚠️ POURQUOI LE CONTENU DÉPEND DE LA TAILLE, ET POURQUOI CE N'EST PAS « CONNAÎTRE L'APP ».
 * La carte du héros est réservée sur 2×2 cases (`widget--lg`, `grid-row: span 2`) AVANT que
 * les données n'arrivent, pour que la page ne saute pas pendant que les apps répondent. Son
 * contenu n'en remplissait qu'une : mesuré sur la capture de Marc du 23/09, ~420 px de vide
 * entre le dernier chiffre et le bouton, parce que `.actions` porte `margin-top: auto` et
 * ramasse tout le surplus en un seul trou.
 *
 * `place` vient de `sources.ts` (`hero: true`), donc d'une décision de MISE EN PAGE du hub,
 * jamais de l'identité de l'app. Une carte large montre plus de ce que l'app publie DÉJÀ —
 * elle ne montre rien que l'app n'ait pas publié, et le hub ne consulte toujours aucun
 * `app.id` pour décider quoi peindre.
 */
export type PlaceCarte = "normale" | "large";

/** Une métrique secondaire et sa courbe. La série est vide quand la mémoire est trop jeune. */
export interface SecondaireCarte {
  metrique: HubMetric;
  serie: Point[];
}

/**
 * Combien d'alertes SUPPLÉMENTAIRES la carte liste sous le bandeau, et combien de lignes de
 * `details` elle montre. Zéro sur une carte normale : ces blocs existent pour occuper la
 * place RÉSERVÉE du héros, pas pour faire déborder les cartes d'une colonne.
 *
 * ⚠️ Les bornes sont DÉRIVÉES du vide mesuré (~420 px), pas choisies : 3 alertes (~80 px) +
 * 2 sections de 4 lignes (~216 px) + la recommandation compacte (~40 px) ≈ 336 px. On
 * remplit sans déborder, et le reste de l'écart est absorbé par les courbes des secondaires.
 * Si Marc trouve la carte encore trop vide ou déjà trop chargée, ce sont CES trois nombres
 * qu'on bouge — ils sont ici, ensemble, et nulle part ailleurs.
 *
 * ⚠️ Ces bornes comptent des LIGNES ; le vide, lui, se mesure en pixels et dépend de la hauteur
 * des cartes voisines (la grille est en rangées `auto`). Le 19/10 (#252) Marc le trouvait
 * encore : le reste du surplus est désormais réparti par le CSS de `.widget--lg`
 * (`app/globals.css`), pas par de nouvelles bornes.
 */
const ALERTES_SECONDAIRES_LARGE = 3;
const DETAILS_SECTIONS_LARGE = 2;
const DETAIL_LIGNES_MAX = 4;

/** Une section `details` déjà bornée pour la carte. Le type vient du contrat. */
export type SectionDetail = NonNullable<HubSummary["details"]>[number];

export interface EtatCarte {
  /** `null` quand l'app ne publie aucune métrique — la carte le dira honnêtement. */
  heros: Heros | null;
  /** Les métriques secondaires AVEC leur courbe : la série se décide ici, pas au rendu. */
  secondaires: SecondaireCarte[];
  /** L'alerte la plus grave, sortie de la liste pour être vue. */
  alertePrincipale: HubAlert | null;
  /**
   * Les alertes suivantes, LISTÉES quand la carte a la place (héros). Vide ailleurs.
   *
   * ⚠️ Elles étaient seulement COMPTÉES (« + 1 autre alerte ») — sur la capture du 23/09, une
   * alerte était donc résumée à un chiffre pendant qu'il restait 420 px de vide juste en
   * dessous. Compter au lieu de montrer se défend quand la place manque ; ici elle ne
   * manquait pas.
   */
  alertesSecondaires: HubAlert[];
  /** Combien d'alertes restent hors de tout affichage, pour ne pas les cacher en silence. */
  autresAlertes: number;
  /**
   * Les sections `details` retenues pour la carte, déjà bornées en sections ET en lignes.
   *
   * ⚠️ CECI REVIENT SUR UN ARBITRAGE DU 15/09, et c'est délibéré. `app/app/[id]/page.tsx`
   * portait « rendu ICI et nulle part ailleurs […] 48 lignes sur une carte bento casseraient
   * la grille ». La raison était juste et reste vraie POUR 48 LIGNES : on en montre au plus
   * huit, et seulement sur la carte qui a 2×2 cases réservées. Marc, 23/09 : « remplis plus
   * la carte FinanceAI […] trop de vide ». Le commentaire de la page de détail est corrigé
   * dans la même PR — une règle qu'on sait fausse cesse d'être lue comme une règle.
   */
  details: SectionDetail[];
  actions: HubSummary["actions"];
  /**
   * `null` quand l'app n'en publie pas — c'est le cas le plus courant, et il ne doit rien
   * afficher. Une recommandation vide ne se remplace pas par « rien à faire » : le hub ne
   * sait pas s'il n'y a rien à faire, il sait que l'app n'a rien dit.
   */
  recommandation: Recommandation | null;
}

const RANG_SEVERITE: Record<HubAlert["severity"], number> = { alert: 0, warn: 1, info: 2 };

/**
 * Compose l'état d'affichage d'une carte à partir du résumé et de la mémoire.
 *
 * LE HÉROS EST CELUI QUE L'APP DÉSIGNE, et à défaut le premier publié.
 *
 * `primary: true` (contrat v1.3) est un drapeau PORTÉ PAR la métrique — au plus un par
 * summary, le contrat rejette les autres. Avant lui, le hub prenait toujours la première
 * publiée : ça marchait, mais l'app devait réordonner sa liste pour changer de héros, donc
 * mêler « ce qui domine » à « dans quel ordre je publie ». Deux choses distinctes qui
 * partageaient un seul moyen de s'exprimer.
 *
 * Le repli sur la première n'est pas une tolérance : aucune app n'est obligée de désigner
 * quoi que ce soit, et une app pinnée sur un contrat antérieur n'en a pas le moyen.
 *
 * Ce qui reste interdit, et c'est le même interdit qu'avant : élire « la plus grande valeur »
 * ou « celle qui a bougé ». La mise en page dépendrait alors des données, et la carte
 * changerait de visage au gré des chiffres. Le choix appartient à l'app ou à personne.
 */
export function etatCarte(
  summary: HubSummary,
  historique: Releve[],
  maintenantMs: number,
  place: PlaceCarte = "normale",
): EtatCarte {
  const designee = summary.metrics.find((m) => m.primary === true);
  const elue = designee ?? summary.metrics[0];
  const reste = summary.metrics.filter((m) => m !== elue);

  const heros: Heros | null = elue
    ? {
        metrique: elue,
        serie: serieMetrique(historique, elue.label),
        variation: variation(historique, elue.label, FENETRE_VARIATION_MS, maintenantMs),
        inchangeDepuisMs: inchangeSignificatif(historique, elue.label, maintenantMs),
      }
    : null;

  const triees = [...summary.alerts].sort(
    (a, b) => RANG_SEVERITE[a.severity] - RANG_SEVERITE[b.severity],
  );

  const large = place === "large";
  // Le bandeau prend la première ; la liste prend les suivantes, bornée.
  const alertesSecondaires = large ? triees.slice(1, 1 + ALERTES_SECONDAIRES_LARGE) : [];
  // ⚠️ Ce qui RESTE, c'est ce qu'aucun des deux ne montre — jamais « total − 1 ». Compter à
  // partir du bandeau seul aurait réaffiché « + 3 autres » sous une liste qui en montre
  // trois : le compteur aurait contredit ce qu'on voit juste au-dessus.
  const montrees = (triees.length > 0 ? 1 : 0) + alertesSecondaires.length;

  return {
    heros,
    // ⚠️ La série est cherchée par le LIBELLÉ de la métrique, qui est sa clé d'historique
    // (`[HUB-METRIQUE-LIBELLE-EST-UNE-CLE]`). Un libellé qui change de jour en jour rend une
    // série vide sous une valeur pourtant publiée — le défaut que FinanceAI a payé le 17/09.
    secondaires: reste.map((metrique) => ({
      metrique,
      serie: large ? serieMetrique(historique, metrique.label) : [],
    })),
    alertePrincipale: triees[0] ?? null,
    alertesSecondaires,
    autresAlertes: Math.max(0, triees.length - montrees),
    details: large ? bornerDetails(summary.details) : [],
    actions: summary.actions,
    recommandation: recommandation(summary),
  };
}

/**
 * Borne les sections `details` pour qu'elles tiennent sur une carte : au plus
 * `DETAILS_SECTIONS_LARGE` sections, au plus `DETAIL_LIGNES_MAX` lignes chacune.
 *
 * ⚠️ On COUPE, et on ne dit pas qu'on coupe — contrairement aux alertes, où le reste est
 * compté. La différence n'est pas un oubli : une alerte masquée est une information perdue,
 * une ligne de détail masquée est à un clic dans la vue de détail, qui les rend TOUTES. La
 * carte est un aperçu ; la page de détail est la source.
 */
function bornerDetails(details: HubSummary["details"]): SectionDetail[] {
  if (!details) return [];
  return details
    .slice(0, DETAILS_SECTIONS_LARGE)
    .map((section) => ({ ...section, items: section.items.slice(0, DETAIL_LIGNES_MAX) }))
    .filter((section) => section.items.length > 0);
}

/**
 * « Inchangé depuis 20 min » n'apprend rien : sous le seuil, on ne dit rien du tout.
 * Exportée : la page de détail applique la MÊME règle ligne par ligne (`DetailMetriques`).
 */
export function inchangeSignificatif(
  historique: Releve[],
  label: string,
  maintenantMs: number,
): number | null {
  const duree = inchangeDepuisMs(historique, label, maintenantMs);
  if (duree === null || duree < SEUIL_INCHANGE_MS) return null;
  return duree;
}

/**
 * Le tracé d'une sparkline, en coordonnées normalisées 0→100 (x) et 0→100 (y, inversé pour
 * SVG). PUR, donc testable sans rendu.
 *
 * Rend `null` sous deux points : une sparkline d'un seul point serait un trait plat, c'est-à-
 * dire l'affirmation « c'est stable » alors qu'on n'a rien à comparer. Mieux vaut ne rien
 * dessiner et laisser la carte écrire « pas encore d'historique ».
 *
 * Une série CONSTANTE (min = max) est tracée à mi-hauteur plutôt que divisée par zéro. C'est
 * la vérité : la valeur ne bouge pas, et la ligne est droite.
 */
export function traceSparkline(points: Point[]): string | null {
  if (points.length < 2) return null;

  const valeurs = points.map((p) => p.v);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const etendue = max - min;

  const dernierIndex = points.length - 1;
  return points
    .map((p, i) => {
      const x = (i / dernierIndex) * 100;
      const y = etendue === 0 ? 50 : 100 - ((p.v - min) / etendue) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * La recommandation d'un summary, lien déjà jugé. `null` si l'app n'en publie pas.
 *
 * Exportée pour la vue détaillée, qui l'affiche en entier alors que la carte n'en montre
 * qu'une ligne : une seule décision, deux rendus, plutôt que deux lectures du contrat qui
 * finiraient par diverger sur ce qui est cliquable.
 */
export function recommandation(summary: HubSummary): Recommandation | null {
  const brute = summary.recommendation;
  if (!brute) return null;
  return {
    label: brute.label,
    pourquoi: brute.why ?? null,
    href: safeHttpUrl(brute.href),
  };
}

/**
 * La variation du héros, mise en mots. PURE, donc testée.
 *
 * ── TROIS DÉFAUTS CORRIGÉS D'UN COUP, ET LE PREMIER ÉTAIT UN MENSONGE ───────────────
 *
 * La carte affichait « +7,1 % sur 7 j ». Marc, 15/09/2026 : « je comprends pas les +X %
 * pour chaque app ». Il avait raison de ne pas comprendre — la ligne était fausse sur un
 * point et ambiguë sur deux autres.
 *
 * 1. ⚠️ « SUR 7 J » ÉTAIT FAUX. `FENETRE_VARIATION_MS` est la fenêtre de RECHERCHE, pas la
 *    durée couverte. `variation` prend le premier et le dernier relevé TROUVÉS dedans : le
 *    15/09, l'historique avait quatre heures d'âge et la carte annonçait quand même « sur
 *    7 j ». Un écart de 4 h présenté comme un écart de 7 jours — c'est « no fake data »
 *    appliqué au temps, le même défaut que l'heure sans fuseau. On affiche donc l'écart
 *    RÉELLEMENT couvert, `apres.t - avant.t`.
 *
 * 2. UN POURCENTAGE RELATIF SUR UNE MÉTRIQUE QUI EST DÉJÀ UN POURCENTAGE est indécidable.
 *    « Charge 90 %, +7,1 % » : sept virgule un POINTS (83 → 90) ou sept virgule un pour
 *    cent en relatif (84 → 90) ? Les deux lectures sont plausibles et donnent des nombres
 *    différents, donc aucune n'est lisible. Pour `format: "percent"`, l'écart en POINTS est
 *    la seule formulation non ambiguë.
 *
 * 3. « 0 % » ÉTAIT PEINT EN VERT. `deltaAbsolu >= 0` rangeait zéro du côté des hausses :
 *    une métrique qui n'a pas bougé s'affichait comme une amélioration. Le sens `plat`
 *    existe pour ça, et il n'est ni vert ni rouge.
 *
 * Et la ligne dit désormais DE QUOI À QUOI. `avant` et `apres` étaient dans le type depuis
 * le début sans jamais être affichés : l'information qui manquait pour comprendre le
 * pourcentage était déjà calculée, elle n'était simplement pas montrée.
 */
export interface VariationLisible {
  /** « +6 points », « +7,1 % », « +12 » ou « inchangé ». */
  ecart: string;
  /** « de 84 % à 90 % » — les deux valeurs réellement comparées. */
  entre: string;
  /** Durée RÉELLEMENT couverte, déjà mise en mots (« 4 h », « 3 j »). */
  sur: string;
  /** `plat` n'est ni une hausse ni une baisse, et ne doit pas être coloré comme telle. */
  sens: "hausse" | "baisse" | "plat";
}

export function variationLisible(
  metrique: HubMetric,
  v: Variation | null,
): VariationLisible | null {
  if (!v) return null;

  const valeur = (n: number) => formatMetricValue({ ...metrique, value: n });
  const sens = v.deltaAbsolu > 0 ? "hausse" : v.deltaAbsolu < 0 ? "baisse" : "plat";

  const ecart = (() => {
    if (v.deltaAbsolu === 0) return "inchangé";
    // Cas 2 de l'en-tête : sur un pourcentage, on parle en POINTS.
    if (metrique.format === "percent") {
      const signe = v.deltaAbsolu > 0 ? "+" : "−";
      const abs = Math.abs(v.deltaAbsolu);
      return `${signe}${arrondiLisible(abs)} point${abs >= 2 ? "s" : ""}`;
    }
    // Départ à zéro : un pourcentage relatif y serait infini. L'écart brut est la seule
    // chose vraie — déjà le cas avant, conservé.
    if (v.deltaRelatif === null) {
      return `${v.deltaAbsolu > 0 ? "+" : "−"}${valeur(Math.abs(v.deltaAbsolu))}`;
    }
    return formatTrend(v.deltaRelatif * 100);
  })();

  return {
    ecart,
    entre: `de ${valeur(v.avant.v)} à ${valeur(v.apres.v)}`,
    sur: formatDuree(v.apres.t - v.avant.t),
    sens,
  };
}

// ── PAGE DE DÉTAIL (`app/app/[id]/page.tsx`) ────────────────────────────────────────
//
// Ce qui suit était calculé EN LIGNE dans le JSX de la page (une seule fonction de 400
// lignes). Sorti ici pour être testé sans rendu, comme le reste de ce fichier. Aucun texte
// n'a changé : ce sont les phrases exactes que la page affichait.

/**
 * La phrase de la page de détail quand le résumé manque.
 *
 * ⚠️ PAS la même que celle de la carte (`CorpsProbleme` dans `AppWidget.tsx`) : la page a la
 * place de dire « dans l'environnement du hub » et « l'app va bien ». Deux phrases voulues,
 * pas une duplication à fusionner.
 */
export function messageProblemeDetail(result: SummaryResult): string {
  switch (result.state) {
    case "unconfigured":
      return `Non branchée dans l’environnement du hub — ${phraseManques(result.manque)}.`;
    case "unauthorized":
      return "Jeton refusé (401). La valeur ne correspond pas à celle de l’app.";
    case "unreachable":
      return `App injoignable — ${result.detail}.`;
    case "invalid":
      return `Réponse non conforme au contrat — ${result.detail}.`;
    case "contract-too-new":
      return (
        `L’app publie la version ${result.published} du contrat ; ce hub lit jusqu’à la ${result.supported}. ` +
        "Le hub doit être mis à jour pour lire cette app — l’app va bien."
      );
    default:
      return "";
  }
}

/**
 * La note d'évolution d'une métrique sur la page de détail : « +12,5 % sur 7 j ».
 * Départ à zéro (`deltaRelatif` nul) : l'écart brut, seul chiffre vrai.
 */
export function noteEvolutionDetail(v: Variation): { texte: string; dir: "up" | "down" } {
  const ecart =
    v.deltaRelatif === null
      ? `${v.deltaAbsolu >= 0 ? "+" : ""}${v.deltaAbsolu}`
      : formatTrend(v.deltaRelatif * 100);
  return {
    texte: `${ecart} sur ${formatDuree(FENETRE_VARIATION_MS)}`,
    dir: v.deltaAbsolu >= 0 ? "up" : "down",
  };
}

/**
 * Vrai quand l'app a publié un lien de recommandation que `safeHttpUrl` a refusé. Le refus
 * doit se VOIR : un conseil qui semble juste ne pas être cliquable, personne ne le corrige.
 */
export function lienRecoRefuse(reco: Recommandation, summary: HubSummary): boolean {
  return reco.href === null && summary.recommendation?.href !== undefined;
}

/** « Appels — 120 / 1000 appels » ; sans plafond connu, pas de « / ». */
export function libelleQuota(q: HubQuota): string {
  return `${q.label} — ${q.used}${q.limit !== null ? ` / ${q.limit}` : ""} ${q.unit ?? ""}`;
}

/** Seuil à partir duquel la barre d'un quota passe en orange. */
const SEUIL_QUOTA_ALERTE = 0.8;

/** La barre d'un quota : largeur plafonnée à 100 %, orange dès 80 %. */
export function barreQuota(ratio: number): { largeur: string; alerte: boolean } {
  return { largeur: `${Math.min(100, ratio * 100)}%`, alerte: ratio >= SEUIL_QUOTA_ALERTE };
}

/**
 * Les variables CSS de la couleur de l'app. Le texte lisible sur cette couleur est CALCULÉ
 * (`texteSur`) : deux des six couleurs de l'écosystème rendent le blanc illisible.
 * `undefined` sans couleur : la page garde l'accent par défaut.
 */
export function variablesAccent(accent: string | undefined): Record<string, string> | undefined {
  if (!accent) return undefined;
  const accentTexte = texteSur(accent);
  return { "--accent": accent, ...(accentTexte ? { "--accent-texte": accentTexte } : {}) };
}

/** Un point et demi s'écrit « 1,5 », trois points s'écrivent « 3 » — pas « 3,0 ». */
function arrondiLisible(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}
