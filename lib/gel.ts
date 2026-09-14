// lib/gel.ts — juger si une donnée est EN RETARD, et si le hub l'a observée régulièrement.
// PUR : aucune base, aucun réseau, aucune horloge (le « maintenant » se passe en paramètre,
// comme pour `peutSeConnecter` et tout `lib/historique.ts`).
//
// ── LE TROU QUE ÇA BOUCHE ───────────────────────────────────────────────────────────
//
// Le hub savait dire « l'app ne répond pas ». Il ne savait pas dire « l'app répond très
// bien, et elle me sert le même instantané depuis sept heures ». `lib/attention.ts`
// n'inscrivait que des états d'ÉCHEC ; une app en `status: "ok"` dont la donnée est gelée
// ne déclenchait rien. C'est la panne la plus discrète de tout l'écosystème : mesuré le
// 14/09/2026, le poll de CarAI annonçait un passage aux 30 min et avait un trou de
// 6 h 53 — tous les runs GitHub verts, aucun signe à l'écran.
//
// ── POURQUOI LE SEUIL VIENT DE L'APP, JAMAIS DU HUB ─────────────────────────────────
//
// « 40 minutes » est parfaitement sain pour un véhicule qui se rafraîchit aux 30-60 min,
// et catastrophique pour un moteur qui passe aux 5 min. Un seuil écrit ici serait donc
// faux pour au moins une app — et surtout, ce serait de la connaissance d'app codée en
// dur dans le hub, ce que le principe n°1 interdit. C'est `expectedMaxAgeSec` (contrat
// v1.3) qui porte ce seuil : l'app déclare son rythme, ce module ne fait que comparer.
//
// Conséquence directe : tant qu'une app n'est pas re-pinnée sur la v1.3, son état est
// `age-connu-non-juge`. Ce n'est pas une panne et ce n'est pas « tout va bien » — c'est
// « je peux afficher l'âge, je ne peux pas dire s'il est normal ». Les trois cas sont
// distincts parce qu'ils appellent trois phrases différentes à l'écran.

import type { HubSummary } from "@mokarade/hub-contract";
import type { Releve } from "./historique";

/**
 * Tolérance sur un `dataAsOf` dans le FUTUR.
 *
 * Deux horloges ne s'accordent jamais à la seconde : un `dataAsOf` en avance de quelques
 * secondes est de la dérive d'horloge, pas un défaut, et le signaler apprendrait à ignorer
 * le signal. Au-delà d'une minute, en revanche, il faut le dire — une app dont l'horloge
 * est en avance paraît ÉTERNELLEMENT fraîche, et c'est le seul moyen connu de contourner
 * toute détection de gel sans que rien n'ait l'air anormal.
 *
 * Le contrat n'interdit pas volontairement un `dataAsOf` futur (rejeter le summary
 * accuserait de panne une app qui a deux secondes de dérive) : la charge est donc ici,
 * chez le consommateur.
 */
export const TOLERANCE_AVANCE_MS = 60_000;

/**
 * Au-delà de combien de fois la cadence attendue un écart devient-il un TROU.
 *
 * `2` et pas `1` : un passage qui arrive cinq minutes en retard n'a rien perdu, et compter
 * chaque petit retard remplirait la liste d'un bruit permanent. Le double de l'attendu, en
 * revanche, veut dire qu'au moins un passage entier n'a jamais eu lieu.
 */
export const FACTEUR_TROU = 2;

/**
 * Cadence NOMINALE de l'horloge du hub — le cron « toutes les 30 minutes » de
 * `.github/workflows/releve.yml`.
 *
 * ⚠️ Nominale, pas réelle, et l'écart est tout le sujet : GitHub étale ses `schedule` sous
 * charge sans le signaler. Mesuré le 14/09/2026 sur le poll de CarAI, un cron de 30 min tournait
 * environ trois fois moins souvent, avec un trou de 6 h 53 le jour même — 518 runs, tous
 * verts. Cette constante sert donc de RÉFÉRENCE pour mesurer le retard, jamais de promesse.
 *
 * Elle est écrite ici et lue par la page, mais le workflow porte sa propre valeur en YAML :
 * les deux ne peuvent pas être dérivées l'une de l'autre. Changer la cadence demande de
 * toucher les deux, et l'en-tête du workflow le rappelle.
 */
export const CADENCE_HORLOGE_MS = 30 * 60_000;

export type Fraicheur =
  /** Âge connu ET sous la limite déclarée par l'app. */
  | { genre: "fraiche"; ageMs: number; limiteMs: number }
  /** Âge connu et AU-DESSUS de la limite déclarée. `retardMs` est le dépassement. */
  | { genre: "figee"; ageMs: number; limiteMs: number; retardMs: number }
  /** `dataAsOf` est dans le futur au-delà de la tolérance : l'horloge de l'app est en avance. */
  | { genre: "horloge-en-avance"; avanceMs: number }
  /** `dataAsOf` publié, mais pas `expectedMaxAgeSec` : on sait l'âge, on ne peut pas le juger. */
  | { genre: "age-connu-non-juge"; ageMs: number }
  /** Aucun `dataAsOf` : le hub ne sait rien de la fraîcheur, et doit le dire. */
  | { genre: "non-datee" };

/**
 * L'âge de la donnée d'une app, et ce qu'il vaut.
 *
 * ⚠️ Se lit sur `dataAsOf`, JAMAIS sur `generatedAt`. `generatedAt` dit « quand j'ai
 * fabriqué cette réponse » et vaut toujours « maintenant » : le juger reviendrait à
 * mesurer la latence du réseau, et toute app répondant vite paraîtrait fraîche même en
 * servant un instantané vieux d'une semaine.
 */
export function fraicheur(summary: HubSummary, maintenantMs: number): Fraicheur {
  if (summary.dataAsOf === undefined) return { genre: "non-datee" };

  const mesureLe = Date.parse(summary.dataAsOf);
  // Le contrat garantit un datetime ISO valide, mais `fraicheur` peut recevoir un summary
  // reconstruit (cache, historique) : un NaN silencieux donnerait des comparaisons toutes
  // fausses, alors que « non datée » est la vérité.
  if (!Number.isFinite(mesureLe)) return { genre: "non-datee" };

  const ageMs = maintenantMs - mesureLe;
  if (ageMs < -TOLERANCE_AVANCE_MS) {
    return { genre: "horloge-en-avance", avanceMs: -ageMs };
  }

  if (summary.expectedMaxAgeSec === undefined) {
    // Un âge légèrement négatif (dérive tolérée) est ramené à 0 : afficher « il y a -3 s »
    // serait absurde, et l'arrondir vers le haut inventerait de l'ancienneté.
    return { genre: "age-connu-non-juge", ageMs: Math.max(0, ageMs) };
  }

  const limiteMs = summary.expectedMaxAgeSec * 1000;
  const age = Math.max(0, ageMs);
  if (age <= limiteMs) return { genre: "fraiche", ageMs: age, limiteMs };
  return { genre: "figee", ageMs: age, limiteMs, retardMs: age - limiteMs };
}

export interface Rythme {
  /**
   * Nombre d'instants de mesure DISTINCTS observés dans la fenêtre.
   *
   * ⚠️ Compte les `dataAsOf` distincts, pas les relevés. Le hub peut relever vingt fois le
   * même instantané : compter les relevés mesurerait la cadence du HUB, pas celle à laquelle
   * l'app reçoit vraiment de la donnée neuve. C'est cette distinction qui a rendu le trou de
   * 6 h 53 de CarAI visible.
   */
  mesures: number;
  /** Écart médian entre deux mesures neuves consécutives. `null` s'il y en a moins de deux. */
  ecartMedianMs: number | null;
  /** Le PIRE écart entre deux mesures neuves. `null` s'il y en a moins de deux. */
  ecartMaxMs: number | null;
}

/**
 * À quel rythme cette app reçoit-elle vraiment de la donnée neuve ?
 *
 * Le médian dit le rythme HABITUEL, le max dit le pire silence — et les deux sont
 * nécessaires. Un médian de 30 min avec un max de 7 h décrit un poll globalement régulier
 * qui a lâché une fois ; prendre la moyenne fondrait les deux en un nombre qui ne décrit
 * ni l'un ni l'autre, et masquerait précisément l'accident qu'on cherche.
 */
export function rythmeDonnee(
  releves: Releve[],
  fenetreMs: number,
  maintenantMs: number,
): Rythme {
  const instants = [
    ...new Set(
      releves
        .filter((r) => r.dataAsOf !== null && r.dataAsOf >= maintenantMs - fenetreMs)
        .map((r) => r.dataAsOf as number),
    ),
  ].sort((a, b) => a - b);

  if (instants.length < 2) {
    return { mesures: instants.length, ecartMedianMs: null, ecartMaxMs: null };
  }

  const ecarts: number[] = [];
  for (let i = 1; i < instants.length; i += 1) ecarts.push(instants[i]! - instants[i - 1]!);

  return {
    mesures: instants.length,
    ecartMedianMs: median(ecarts),
    ecartMaxMs: Math.max(...ecarts),
  };
}

export interface Continuite {
  /** Relevés du hub dans la fenêtre. */
  releves: number;
  /** Le plus grand écart entre deux relevés consécutifs. `null` s'il y en a moins de deux. */
  ecartMaxMs: number | null;
  /** Écarts dépassant `FACTEUR_TROU` × la cadence attendue : autant de passages perdus. */
  trous: number;
}

/**
 * Le hub a-t-il observé régulièrement — autrement dit, ses courbes ont-elles des trous ?
 *
 * ── POURQUOI CETTE FONCTION EXISTE, ET C'EST INCONFORTABLE ──────────────────────────
 *
 * Elle ne juge pas les apps, elle juge le HUB. Sa mémoire n'était alimentée que par
 * l'affichage d'une page : rien ne s'enregistrait quand personne ne regardait, donc
 * l'observateur était requis pour l'observation. L'horloge ajoutée en même temps que ce
 * module (`/api/cron/releve`) répare la cause ; cette fonction rend le RÉSIDU visible,
 * parce que l'horloge repose sur un `schedule` GitHub Actions dont la cadence n'est pas
 * garantie — mesuré à environ trois fois plus lent que déclaré, tous les runs verts.
 *
 * Afficher « 47 relevés, 12 trous, le pire de 6 h 53 » plutôt qu'une courbe lisse est le
 * même principe que « no fake data » appliqué au temps : une ligne qui relie deux points
 * par-dessus un silence de sept heures n'est pas une approximation, c'est une affirmation
 * fausse sur ce qui s'est passé entre les deux.
 */
export function continuite(
  releves: Releve[],
  cadenceAttendueMs: number,
  fenetreMs: number,
  maintenantMs: number,
): Continuite {
  const instants = releves
    .filter((r) => r.releveLe >= maintenantMs - fenetreMs)
    .map((r) => r.releveLe)
    .sort((a, b) => a - b);

  if (instants.length < 2) {
    return { releves: instants.length, ecartMaxMs: null, trous: 0 };
  }

  const seuil = cadenceAttendueMs * FACTEUR_TROU;
  let max = 0;
  let trous = 0;
  for (let i = 1; i < instants.length; i += 1) {
    const ecart = instants[i]! - instants[i - 1]!;
    if (ecart > max) max = ecart;
    if (ecart > seuil) trous += 1;
  }

  return { releves: instants.length, ecartMaxMs: max, trous };
}

/** Médiane. Sur un nombre pair d'éléments, la moyenne des deux du milieu. */
function median(valeurs: number[]): number {
  const tri = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tri.length / 2);
  return tri.length % 2 === 1 ? tri[milieu]! : (tri[milieu - 1]! + tri[milieu]!) / 2;
}

/**
 * Pourquoi le hub n'a rien observé — ou qu'il a observé.
 *
 * ⚠️ TROIS CAS, PARCE QU'ILS APPELLENT TROIS GESTES DIFFÉRENTS. Deux d'entre eux donnaient
 * le MÊME écran jusqu'au 14/09/2026 au soir : « aucun relevé ». Or « le hub n'a pas de base
 * de données » se répare côté Vercel, et « l'horloge n'a pas encore tourné » se répare côté
 * dépôt GitHub. Les confondre ne fait pas perdre une minute — ça fait chercher au mauvais
 * endroit pendant que la cause reste entière, et c'est précisément le défaut que la page
 * « attention » existe pour combattre.
 *
 * L'ordre n'est pas cosmétique : SANS BASE, `totalReleves` vaut nécessairement 0 puisque
 * rien n'a jamais pu être lu. Juger l'horloge d'abord attribuerait donc toujours la panne à
 * l'horloge, y compris quand elle est parfaitement configurée — ce qui est arrivé.
 *
 * `base` se passe en paramètre plutôt que d'être lu ici : ce module reste PUR.
 */
export type EtatObservation = "sans-base" | "horloge-muette" | "observe";

export function etatObservation(base: boolean, totalReleves: number): EtatObservation {
  if (!base) return "sans-base";
  if (totalReleves <= 0) return "horloge-muette";
  return "observe";
}
