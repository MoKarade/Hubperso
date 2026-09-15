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

import type { HubAlert, HubMetric, HubSummary } from "@mokarade/hub-contract";
import { formatDuree, formatMetricValue, formatTrend } from "./format";
import { safeHttpUrl } from "./url";
import { inchangeDepuisMs, serieMetrique, variation, type Point, type Releve, type Variation } from "./historique";

/** Fenêtre de comparaison affichée sous la métrique héros. */
export const FENETRE_VARIATION_MS = 7 * 24 * 60 * 60_000;

/**
 * En deçà, « inchangé depuis 20 minutes » n'apprend rien : c'est l'intervalle de relevé.
 * Le seuil existe pour éviter d'écrire une évidence, pas pour juger l'app.
 */
export const SEUIL_INCHANGE_MS = 24 * 60 * 60_000;

export interface Heros {
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

export interface EtatCarte {
  /** `null` quand l'app ne publie aucune métrique — la carte le dira honnêtement. */
  heros: Heros | null;
  secondaires: HubMetric[];
  /** L'alerte la plus grave, sortie de la liste pour être vue. */
  alertePrincipale: HubAlert | null;
  /** Combien d'autres alertes existent, pour ne pas les cacher en silence. */
  autresAlertes: number;
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

  return {
    heros,
    secondaires: reste,
    alertePrincipale: triees[0] ?? null,
    autresAlertes: Math.max(0, triees.length - 1),
    actions: summary.actions,
    recommandation: recommandation(summary),
  };
}

/** « Inchangé depuis 20 min » n'apprend rien : sous le seuil, on ne dit rien du tout. */
function inchangeSignificatif(
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

/** Un point et demi s'écrit « 1,5 », trois points s'écrivent « 3 » — pas « 3,0 ». */
function arrondiLisible(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}
