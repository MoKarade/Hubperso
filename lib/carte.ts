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

export interface EtatCarte {
  /** `null` quand l'app ne publie aucune métrique — la carte le dira honnêtement. */
  heros: Heros | null;
  secondaires: HubMetric[];
  /** L'alerte la plus grave, sortie de la liste pour être vue. */
  alertePrincipale: HubAlert | null;
  /** Combien d'autres alertes existent, pour ne pas les cacher en silence. */
  autresAlertes: number;
  actions: HubSummary["actions"];
}

const RANG_SEVERITE: Record<HubAlert["severity"], number> = { alert: 0, warn: 1, info: 2 };

/**
 * Compose l'état d'affichage d'une carte à partir du résumé et de la mémoire.
 *
 * La PREMIÈRE métrique publiée est le héros — c'est un choix de l'app, pas du hub : elle
 * seule sait ce qui mérite la grande police. Élire « la plus grande valeur » ferait dépendre
 * la mise en page des données, et changerait la carte au gré des chiffres.
 */
export function etatCarte(
  summary: HubSummary,
  historique: Releve[],
  maintenantMs: number,
): EtatCarte {
  const [premiere, ...reste] = summary.metrics;

  const heros: Heros | null = premiere
    ? {
        metrique: premiere,
        serie: serieMetrique(historique, premiere.label),
        variation: variation(historique, premiere.label, FENETRE_VARIATION_MS, maintenantMs),
        inchangeDepuisMs: inchangeSignificatif(historique, premiere.label, maintenantMs),
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
