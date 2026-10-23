// lib/bilanEtat.ts — le bilan d'état des apps, tiré des relevés du hub. PUR : aucune base, aucun
// réseau, aucune horloge (le « maintenant » se passe en paramètre).
//
// ── CE QUE ÇA SERT À DIRE ───────────────────────────────────────────────────────────
//
// Sans mémoire, l'assistant dit « DriveAI hors ligne » puis « c'est bon, en ligne » sans savoir que
// l'app alterne. Les relevés (`lib/historiqueDb.ts`, un par app et par quart d'heure) gardent l'état
// vu par le hub ; ce module en tire, par app, des COUPURES, une disponibilité et l'heure habituelle
// des coupures, puis un court texte DATÉ que le hub passe à MemoryAI.
//
// ── CE QUI N'EST JAMAIS INVENTÉ ─────────────────────────────────────────────────────
//
//   - Une app sans relevé dans la fenêtre est dite « sans historique », jamais « sans coupure ».
//   - Une durée est un MINIMUM : un relevé tous les 15 minutes ne dit pas quand, entre deux, l'app est
//     tombée ni revenue. « Au moins » est écrit, jamais un chiffre plus précis que la mesure.
//   - Un trou entre deux relevés (le hub n'observait pas) coupe une coupure en deux : on ne prête pas
//     une panne continue à un silence.
//   - L'état « en construction » n'est PAS enregistré à part (la table ne garde que l'état vu par le
//     hub, `ok` compris) : il n'apparaît donc pas ici, et le texte ne le devine pas.
//   - Un refus (`unauthorized`, `unconfigured`) n'est pas une coupure : c'est le hub qui n'a pas pu
//     entrer, pas l'app qui est tombée. Il est compté à part.
//
// Le texte produit est une DONNÉE pour le modèle, jamais une consigne : il ne contient que des noms
// d'apps écrits dans le code (`lib/sources.ts`), des nombres et des dates.

import type { Releve } from "./historique";
import { FUSEAU } from "./fuseau";
import { formatDuree } from "./format";

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Un relevé tous les 15 minutes : au-delà de trois intervalles, le hub n'observait pas. */
const TROU_MAX_MS = 45 * MINUTE;

/** La fenêtre du bilan : une semaine, comme la question de Marc (« cette semaine »). */
export const FENETRE_BILAN_MS = 7 * JOUR;

/** Au-delà, le texte laisse tomber les coupures les plus anciennes (la taille est bornée). */
const COUPURES_MAX_PAR_APP = 3;

/** États où l'app n'a pas pu être lue alors qu'elle devait l'être : une coupure. */
const ETATS_COUPURE = new Set(["unreachable", "invalid", "contract-too-new"]);

interface Coupure {
  /** Premier relevé en échec de la série. */
  debutMs: number;
  /** Dernier relevé en échec de la série. */
  dernierMs: number;
  /** Premier relevé revenu en ligne, ou `null` : pas (encore) de retour observé. */
  finMs: number | null;
  /** Vrai si la série touche le tout dernier relevé et que ce relevé est récent. */
  enCours: boolean;
}

export interface BilanApp {
  appId: string;
  nom: string;
  /** Relevés lus dans la fenêtre. 0 = sans historique. */
  nbReleves: number;
  /** Date du plus ancien relevé de la fenêtre, ou `null` sans relevé. */
  depuisMs: number | null;
  /** Du plus ancien au plus récent. */
  coupures: Coupure[];
  /** Relevés où le hub n'a pas pu entrer (jeton refusé ou absent). */
  refus: number;
  /** Part des relevés en ligne, en % entier, ou `null` sans relevé. */
  disponibilitePct: number | null;
  /** Heure (Québec, 0 à 23) où tombent le plus souvent les coupures, si au moins deux s'y recoupent. */
  heureHabituelle: number | null;
}

/** Heure locale de Marc (0 à 23) d'un instant : jamais celle de la machine (Vercel tourne en UTC). */
function heureQuebec(ms: number): number {
  const parties = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU, hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  return Number(parties.find((p) => p.type === "hour")?.value ?? Number.NaN) % 24;
}

function heureHabituelleDe(coupures: readonly Coupure[]): number | null {
  const parHeure = new Map<number, number>();
  for (const c of coupures) {
    const h = heureQuebec(c.debutMs);
    parHeure.set(h, (parHeure.get(h) ?? 0) + 1);
  }
  // La plus fréquente ; à égalité, la plus tôt dans la journée. Il faut au moins deux coupures à
  // cette heure : une seule n'est pas une habitude.
  const [heure, n] = [...parHeure.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [null, 0];
  return n >= 2 ? heure : null;
}

/**
 * Le bilan d'une app sur `fenetreMs`. `releves` peut arriver dans n'importe quel ordre (la base les
 * rend du plus récent au plus ancien) ; seuls ceux de la fenêtre comptent.
 */
export function bilanApp(
  appId: string,
  nom: string,
  releves: readonly Releve[],
  maintenantMs: number,
  fenetreMs: number = FENETRE_BILAN_MS,
): BilanApp {
  const lus = releves
    .filter((r) => r.releveLe >= maintenantMs - fenetreMs && r.releveLe <= maintenantMs)
    .sort((a, b) => a.releveLe - b.releveLe);
  const premier = lus[0];
  const dernier = lus[lus.length - 1];
  if (premier === undefined || dernier === undefined) {
    return { appId, nom, nbReleves: 0, depuisMs: null, coupures: [], refus: 0, disponibilitePct: null, heureHabituelle: null };
  }

  const coupures: Coupure[] = [];
  let courante: Coupure | null = null;
  let enLigne = 0;
  let refus = 0;
  let precedent: Releve | null = null;

  for (const r of lus) {
    const trou = precedent !== null && r.releveLe - precedent.releveLe > TROU_MAX_MS;
    if (trou) courante = null; // un silence du hub ne prolonge pas une panne
    if (ETATS_COUPURE.has(r.etat)) {
      if (courante === null) {
        courante = { debutMs: r.releveLe, dernierMs: r.releveLe, finMs: null, enCours: false };
        coupures.push(courante);
      } else {
        courante.dernierMs = r.releveLe;
      }
    } else {
      if (courante !== null) courante.finMs = r.releveLe;
      courante = null;
      if (r.etat === "ok") enLigne += 1;
      else refus += 1;
    }
    precedent = r;
  }

  // Une série qui touche le dernier relevé est « en cours » seulement si ce relevé est récent.
  const derniere = coupures[coupures.length - 1];
  if (derniere && derniere.finMs === null && derniere.dernierMs === dernier.releveLe && maintenantMs - dernier.releveLe <= TROU_MAX_MS) {
    derniere.enCours = true;
  }

  return {
    appId,
    nom,
    nbReleves: lus.length,
    depuisMs: premier.releveLe,
    coupures,
    refus,
    disponibilitePct: Math.round((enLigne / lus.length) * 100),
    heureHabituelle: heureHabituelleDe(coupures),
  };
}

function quand(ms: number): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: FUSEAU,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function phraseCoupure(c: Coupure): string {
  const duree = (c.finMs ?? c.dernierMs) - c.debutMs;
  const minimum = duree > 0 ? `au moins ${formatDuree(duree)}` : "au moins un relevé";
  const issue = c.enCours ? "toujours en cours" : c.finMs !== null ? "revenue ensuite" : "retour non observé";
  return `${quand(c.debutMs)} (${minimum}, ${issue})`;
}

function ligneApp(b: BilanApp): string {
  if (b.nbReleves === 0) return `${b.nom} : sans historique (aucun relevé lu).`;
  const base = `${b.nom} : ${b.nbReleves} relevé${b.nbReleves > 1 ? "s" : ""}, en ligne sur ${b.disponibilitePct} % des relevés`;
  const refus = b.refus > 0 ? `, ${b.refus} relevé${b.refus > 1 ? "s" : ""} où le hub n'a pas pu entrer` : "";
  if (b.coupures.length === 0) return `${base}${refus}, aucune coupure.`;
  const n = b.coupures.length;
  const dernieres = b.coupures.slice(-COUPURES_MAX_PAR_APP).map(phraseCoupure).join(" ; ");
  const habitude = b.heureHabituelle !== null ? `, coupures le plus souvent vers ${b.heureHabituelle} h` : "";
  const reste = n > COUPURES_MAX_PAR_APP ? `les ${COUPURES_MAX_PAR_APP} dernières : ` : "";
  return `${base}${refus}, ${n} coupure${n > 1 ? "s" : ""}${habitude} — ${reste}${dernieres}.`;
}

/** Plafond du texte envoyé à MemoryAI (contrat `contexte` : 1 500 caractères au plus). */
export const CONTEXTE_MAX = 1500;

/**
 * Le texte daté passé à l'assistant. Une donnée, jamais une consigne : il ne contient que des noms
 * d'apps du code, des nombres et des dates (heure du Québec). Borné à `CONTEXTE_MAX` : au-delà, les
 * dernières lignes sont retirées et la coupe est dite.
 */
export function texteBilans(bilans: readonly BilanApp[], maintenantMs: number): string {
  const entete = `Bilan d'état des apps d'après les relevés du hub, 7 derniers jours, établi le ${quand(maintenantMs)} (heure du Québec). Un relevé tous les 15 minutes au plus ; les durées sont des minimums.`;
  const lignes = bilans.map(ligneApp);
  let texte = [entete, ...lignes].join("\n");
  if (texte.length <= CONTEXTE_MAX) return texte;
  const coupe = "\n(Bilan tronqué : taille bornée.)";
  texte = entete;
  for (const l of lignes) {
    if ((texte + "\n" + l + coupe).length > CONTEXTE_MAX) break;
    texte += "\n" + l;
  }
  return texte + coupe;
}
