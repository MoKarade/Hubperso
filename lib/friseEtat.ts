// lib/friseEtat.ts — la frise des dernières 24 h d'une app, tirée des relevés du hub. PUR : aucune base, aucun réseau,
// aucune horloge (le « maintenant » se passe en paramètre).
//
// Maquette validée : « ce qu'il a vu sur 24 h » par app. Même source que le bilan de LIA (`lib/bilanEtat.ts`) : la table des
// relevés (`lib/historiqueDb.ts`), UN relevé par app et par quart d'heure, qui garde l'état VU PAR LE HUB.
//
// ── CE QUI N'EST JAMAIS INVENTÉ ─────────────────────────────────────────────────────
//
//   - Une plage sans relevé est « sans relevé », jamais « à jour » : le hub n'observait pas, on ne prête pas un état à un silence.
//   - Une app sans AUCUN relevé dans la fenêtre le dit, au lieu de dessiner une frise verte ou une frise vide qui ressemble à
//     une bonne journée.
//   - Une plage de 30 minutes est dite « panne vue », pas « panne de 30 minutes » : un relevé tous les quarts d'heure ne dit pas
//     quand, dans la plage, l'app est tombée ni revenue (même règle que « au moins » dans `bilanEtat`).
//   - « En retard » n'est PAS dessiné : la table ne garde que l'état vu par le hub (`ok`, `unreachable`…), pas le statut déclaré
//     par l'app (`degraded`). Le déduire de `dataAsOf` serait inventer un seuil que l'app n'a pas donné.
//   - Un refus (`unauthorized`, `unconfigured`) n'est pas une panne de l'app : c'est le hub qui n'a pas pu entrer, comme dans
//     `bilanApp`. Il a sa propre teinte et son propre mot.

import type { Releve } from "./historique";
import { FUSEAU } from "./fuseau";

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;

/** La fenêtre de la frise. */
export const FENETRE_FRISE_MS = 24 * HEURE;
/** Une plage = une demi-heure : deux relevés au plus, donc une plage ne ment pas sur ce qu'elle résume. */
export const PLAGE_FRISE_MS = 30 * MINUTE;
export const NB_PLAGES = FENETRE_FRISE_MS / PLAGE_FRISE_MS;

/** États où l'app n'a pas pu être lue alors qu'elle devait l'être : identiques à ceux de `bilanEtat`. */
const ETATS_PANNE = new Set(["unreachable", "invalid", "contract-too-new"]);

/** `ok` : lue ; `panne` : pas lue alors qu'elle le devait ; `refus` : le hub n'est pas entré ; `vide` : aucun relevé. */
export type EtatPlage = "ok" | "panne" | "refus" | "vide";

export interface Plage {
  /** Début de la plage, en ms. */
  debutMs: number;
  etat: EtatPlage;
}

export interface FriseApp {
  appId: string;
  nom: string;
  /** Du plus ancien au plus récent, toujours `NB_PLAGES`. */
  plages: Plage[];
  /** Relevés lus dans la fenêtre. 0 = sans historique. */
  nbReleves: number;
  /** Plages où une panne a été vue. */
  plagesPanne: number;
  plagesRefus: number;
  plagesVides: number;
}

/** Le mot qui accompagne chaque teinte (la couleur seule ne dit rien à tout le monde). */
export const MOT_PLAGE: Readonly<Record<EtatPlage, string>> = {
  ok: "à jour",
  panne: "panne vue",
  refus: "accès refusé",
  vide: "sans relevé",
};

/** L'état d'une plage : la panne l'emporte sur le refus, le refus sur « à jour ». */
function etatDePlage(releves: readonly Releve[]): EtatPlage {
  if (releves.length === 0) return "vide";
  if (releves.some((r) => ETATS_PANNE.has(r.etat))) return "panne";
  if (releves.some((r) => r.etat !== "ok")) return "refus";
  return "ok";
}

/** La frise d'une app sur les 24 h qui précèdent `maintenantMs`. `releves` arrive dans n'importe quel ordre. */
export function friseApp(appId: string, nom: string, releves: readonly Releve[], maintenantMs: number): FriseApp {
  const debut = maintenantMs - FENETRE_FRISE_MS;
  const lus = releves.filter((r) => r.releveLe > debut && r.releveLe <= maintenantMs);
  const plages: Plage[] = Array.from({ length: NB_PLAGES }, (_, i) => {
    const d = debut + i * PLAGE_FRISE_MS;
    // La dernière plage inclut `maintenantMs` ; les autres sont ouvertes à droite : un relevé n'est jamais compté deux fois.
    const dans = lus.filter((r) => r.releveLe > d && r.releveLe <= d + PLAGE_FRISE_MS);
    return { debutMs: d, etat: etatDePlage(dans) };
  });
  const compte = (e: EtatPlage) => plages.filter((p) => p.etat === e).length;
  return {
    appId,
    nom,
    plages,
    nbReleves: lus.length,
    plagesPanne: compte("panne"),
    plagesRefus: compte("refus"),
    plagesVides: compte("vide"),
  };
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** La ligne qui résume la frise, en mots (jamais un chiffre plus précis que la mesure). */
export function resumeFrise(f: FriseApp): string {
  if (f.nbReleves === 0) return "Aucun relevé sur les 24 dernières heures.";
  const parts: string[] = [];
  parts.push(
    f.plagesPanne > 0
      ? `Panne vue sur ${pluriel(f.plagesPanne, "plage")} de 30 min`
      : "Aucune panne vue",
  );
  if (f.plagesRefus > 0) parts.push(`accès refusé sur ${pluriel(f.plagesRefus, "plage")}`);
  if (f.plagesVides > 0) parts.push(`${pluriel(f.plagesVides, "plage")} sans relevé`);
  return `${parts.join(" · ")}.`;
}

/** « 22 h 30 · panne vue » : le survol d'une plage, à l'heure du Québec (jamais celle de la machine). */
export function libellePlage(p: Plage): string {
  const parties = new Intl.DateTimeFormat("fr-CA", {
    timeZone: FUSEAU,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(p.debutMs));
  const h = Number(parties.find((x) => x.type === "hour")?.value ?? Number.NaN);
  const m = parties.find((x) => x.type === "minute")?.value ?? "";
  return `${h} h ${m} · ${MOT_PLAGE[p.etat]}`;
}
