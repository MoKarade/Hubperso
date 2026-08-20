// lib/historique.ts — lire la mémoire du hub. PUR : aucune base, aucun réseau, aucune horloge
// (le « maintenant » se passe en paramètre, comme pour `peutSeConnecter`).
//
// ── CE QUE LA MÉMOIRE SERT À DIRE ───────────────────────────────────────────────────
//
// Un instantané ne peut pas signaler qu'il ressemble à celui d'hier. C'est le mode de panne
// qui a coûté le plus cher le 20/08/2026 : une campagne DriveAI arrêtée depuis deux semaines
// s'affichait « en pause », c'est-à-dire comme un état normal. Personne ne pouvait voir que
// le chiffre ne bougeait plus, parce que rien ne gardait le chiffre d'avant.
//
// Ces fonctions répondent à trois questions, et à rien d'autre :
//   - comment cette métrique a-t-elle évolué ? (`serieMetrique`)
//   - de combien a-t-elle bougé sur une fenêtre ? (`variation`)
//   - depuis combien de temps est-elle FIGÉE ? (`inchangeDepuisMs`)

import type { HubMetric } from "@mokarade/hub-contract";

export interface CoutReleve {
  montant: number;
  devise: "USD" | "CAD";
  periode: "total" | "mois" | "jour";
}

export interface Releve {
  appId: string;
  /** Heure du HUB, en ms. Distincte de `dataAsOf`, qui est la fraîcheur déclarée par l'app. */
  releveLe: number;
  /** L'état vu par le hub : `ok`, `unreachable`, `invalid`, `contract-too-new`, … */
  etat: string;
  dataAsOf: number | null;
  metriques: HubMetric[];
  cout: CoutReleve | null;
}

export interface Point {
  t: number;
  v: number;
}

/**
 * La série d'une métrique, du plus ancien au plus récent.
 *
 * ⚠️ SEULES LES VALEURS NUMÉRIQUES ENTRENT. Le contrat autorise `value: number | string`, et
 * une app publie légitimement « 3 en attente » ou « —ceux ». Les convertir donnerait `NaN`,
 * et un `NaN` ne se contente pas d'être faux : il contamine toute somme ou moyenne qui le
 * touche (leçon DriveAI, `coutDollars_`). On les ÉCARTE, et l'appelant qui n'obtient rien
 * affiche « pas de série » plutôt qu'une ligne plate inventée.
 *
 * Les relevés où l'app était injoignable n'ont pas de métrique du tout : ils créent un TROU
 * dans la série, ce qui est la vérité — on ne relie pas deux points par-dessus une panne en
 * faisant comme si de rien n'était.
 */
export function serieMetrique(releves: Releve[], label: string): Point[] {
  const points: Point[] = [];
  for (const releve of [...releves].sort((a, b) => a.releveLe - b.releveLe)) {
    const metrique = releve.metriques.find((m) => m.label === label);
    if (!metrique) continue;
    if (typeof metrique.value !== "number" || !Number.isFinite(metrique.value)) continue;
    points.push({ t: releve.releveLe, v: metrique.value });
  }
  return points;
}

export interface Variation {
  avant: Point;
  apres: Point;
  deltaAbsolu: number;
  /** `null` quand la valeur de départ est 0 : une variation relative y serait infinie. */
  deltaRelatif: number | null;
}

/**
 * De combien la métrique a-t-elle bougé sur les `fenetreMs` dernières millisecondes ?
 *
 * Compare le point le plus récent au plus ANCIEN point encore dans la fenêtre. Rend `null`
 * s'il n'y a pas deux points distincts : une variation qui se calcule sur un seul relevé
 * serait un 0 % inventé, et « n'a pas bougé » et « je ne sais pas encore » ne sont pas la
 * même information.
 */
export function variation(
  releves: Releve[],
  label: string,
  fenetreMs: number,
  maintenantMs: number,
): Variation | null {
  const dansLaFenetre = serieMetrique(releves, label).filter(
    (p) => p.t >= maintenantMs - fenetreMs,
  );
  if (dansLaFenetre.length < 2) return null;

  const avant = dansLaFenetre[0]!;
  const apres = dansLaFenetre[dansLaFenetre.length - 1]!;
  return {
    avant,
    apres,
    deltaAbsolu: apres.v - avant.v,
    deltaRelatif: avant.v === 0 ? null : (apres.v - avant.v) / avant.v,
  };
}

/**
 * Depuis combien de temps cette métrique affiche-t-elle EXACTEMENT la même valeur ?
 *
 * C'est la question que personne ne pouvait poser au hub, et celle qui aurait montré la
 * campagne bloquée. Remonte depuis le relevé le plus récent tant que la valeur est
 * identique, et rend l'écart de temps couvert.
 *
 * Rend `null` quand il n'y a pas de quoi conclure : moins de deux relevés, ou une valeur
 * qui vient de changer. `0` n'est pas la bonne réponse dans ces cas — il affirmerait
 * « figée depuis zéro », alors qu'on ne sait rien.
 *
 * Compare les valeurs BRUTES, pas seulement les numériques : une métrique textuelle figée
 * (« en pause ») est exactement le cas qu'on cherche à voir.
 */
export function inchangeDepuisMs(
  releves: Releve[],
  label: string,
  maintenantMs: number,
): number | null {
  const avecMetrique = [...releves]
    .sort((a, b) => b.releveLe - a.releveLe)
    .map((r) => ({ t: r.releveLe, m: r.metriques.find((x) => x.label === label) }))
    .filter((x): x is { t: number; m: HubMetric } => x.m !== undefined);

  if (avecMetrique.length < 2) return null;

  const valeurCourante = avecMetrique[0]!.m.value;
  let plusAncienIdentique = avecMetrique[0]!.t;
  let compte = 0;
  for (const { t, m } of avecMetrique) {
    if (m.value !== valeurCourante) break;
    plusAncienIdentique = t;
    compte += 1;
  }

  // Un seul relevé porte cette valeur ⇒ elle vient de changer, il n'y a pas de « figée ».
  if (compte < 2) return null;
  return maintenantMs - plusAncienIdentique;
}

/**
 * La série de coût d'UNE période.
 *
 * ⚠️ Le paramètre `periode` n'est pas un filtre de confort, c'est le principe « jamais
 * d'agrégat entre unités incomparables » appliqué au temps. Tracer sur une même courbe un
 * cumul depuis toujours et un mois courant produirait une ligne qui chute au premier de
 * chaque mois sans que rien n'ait baissé. La période choisie doit être AFFICHÉE avec la
 * courbe, jamais sous-entendue.
 *
 * La devise est laissée à l'appelant pour la même raison : deux devises sur une courbe,
 * c'est deux courbes.
 */
export function serieCout(
  releves: Releve[],
  periode: CoutReleve["periode"],
  devise: CoutReleve["devise"],
): Point[] {
  return [...releves]
    .sort((a, b) => a.releveLe - b.releveLe)
    .filter((r) => r.cout !== null && r.cout.periode === periode && r.cout.devise === devise)
    .map((r) => ({ t: r.releveLe, v: r.cout!.montant }));
}

/**
 * Depuis combien de temps la DONNÉE de l'app est-elle figée, d'après ce qu'elle déclare ?
 *
 * Se lit sur `dataAsOf`, pas sur `releveLe` : le hub peut interroger une app toutes les 15
 * secondes pendant des jours et recevoir à chaque fois le même instantané vieux d'une
 * semaine. C'est la différence entre « je réponds » et « j'ai quelque chose de neuf à dire »,
 * et c'est celle qui compte.
 *
 * Rend `null` si l'app ne publie pas `dataAsOf` — auquel cas le hub ne SAIT pas, et doit le
 * dire plutôt que de supposer que tout va bien.
 */
export function figeDepuisMs(releves: Releve[], maintenantMs: number): number | null {
  const recents = [...releves]
    .sort((a, b) => b.releveLe - a.releveLe)
    .filter((r) => r.dataAsOf !== null);
  const dernier = recents[0];
  if (!dernier || dernier.dataAsOf === null) return null;
  return maintenantMs - dernier.dataAsOf;
}
