// lib/liaParole.ts — ce que LIA dit des cartes et ce qu'elle raconte seule sur le hub. PUR : aucune
// base, aucun réseau, aucune horloge (l'heure se passe en paramètre).
//
// ── DE OÙ VIENNENT LES PHRASES ──────────────────────────────────────────────────────
//
// De l'ÉTAT RÉEL de chaque app, jamais d'une liste de répliques écrites d'avance. La carte porte sa
// phrase (`data-lia-dit`, calculée ici depuis le `SummaryResult`) ; LIA la dit en allant se coller à
// la carte. Quand elle a envie de parler seule, elle ne dit que ce que les cartes affichées disent
// déjà, et se tait (`null`) quand il n'y a rien de vrai à raconter : jamais « tout va bien »
// sur une page qui n'a pas encore fini de charger, jamais une panne inventée.
//
// ── CE QUI N'EST PAS DIT ───────────────────────────────────────────────────────────
//
//   - Aucun chiffre : ni mesure, ni coût, ni durée. Ils vivent sur la carte, lisibles ; LIA dit l'état.
//   - Le détail technique d'une panne (`detail` du résumé) n'est pas répété : « injoignable » suffit.
//   - Le libellé d'une alerte vient de l'app : c'est une DONNÉE montrée comme du texte, bornée à
//     `LIBELLE_MAX` caractères, jamais une consigne pour LIA.

import type { SummaryResult } from "./fetchSummary";
import type { Tone } from "./status";

/** Au-delà, le libellé d'une alerte d'app est coupé : une bulle n'est pas une page. */
const LIBELLE_MAX = 120;

export type GraviteLia = "alert" | "warn" | "info" | "ok";

/** Ce que le navigateur lit sur une carte (`data-lia-*`) pour savoir de quoi LIA peut parler. */
export interface FaitLia {
  appId: string;
  appNom: string;
  gravite: GraviteLia;
  dit: string;
}

const GRAVITES: ReadonlySet<string> = new Set(["alert", "warn", "info", "ok"]);

/**
 * Le fait d'une carte, relu de ses attributs `data-lia-*` (un `dataset`). `null` si un attribut manque
 * ou si la gravité n'est pas l'une des quatre connues : une carte mal formée ne fait rien dire.
 */
export function faitDepuisDataset(d: {
  liaApp?: string;
  liaNom?: string;
  liaGravite?: string;
  liaDit?: string;
}): FaitLia | null {
  const { liaApp, liaNom, liaGravite, liaDit } = d;
  if (!liaApp || !liaNom || !liaDit || !liaGravite || !GRAVITES.has(liaGravite)) return null;
  return { appId: liaApp, appNom: liaNom, gravite: liaGravite as GraviteLia, dit: liaDit };
}

export function graviteLia(ton: Tone): GraviteLia {
  switch (ton) {
    case "danger":
      return "alert";
    case "warn":
      return "warn";
    case "ok":
      return "ok";
    case "info":
    case "neutral":
      return "info";
  }
}

function borne(texte: string): string {
  const net = texte.replace(/\s+/g, " ").trim();
  return net.length <= LIBELLE_MAX ? net : `${net.slice(0, LIBELLE_MAX - 1).trimEnd()}…`;
}

/** Termine par un point, sauf si le texte finit déjà par une ponctuation. */
function enPhrase(texte: string): string {
  return /[.!?…]$/.test(texte) ? texte : `${texte}.`;
}

/** La phrase d'une carte : ce que dit son état, rien de plus. */
export function ditCarte(resultat: SummaryResult): string {
  const nom = resultat.state === "ok" ? resultat.summary.app.name : resultat.source.name;
  switch (resultat.state) {
    case "unconfigured":
      return `${nom} n’est pas branchée au hub.`;
    case "unauthorized":
      return `${nom} refuse l’accès du hub.`;
    case "unreachable":
      return `${nom} est injoignable : je ne peux rien lire de plus pour l’instant.`;
    case "invalid":
      return `${nom} répond, mais sa réponse n’est pas valide.`;
    case "contract-too-new":
      return `${nom} publie un contrat plus récent que celui du hub : c’est le hub qui est en retard.`;
    case "ok": {
      if (resultat.stale) return `${nom} n’a pas répondu à temps : je montre son dernier résumé connu.`;
      const { status, alerts } = resultat.summary;
      const premiere = alerts.find((a) => a.severity !== "info") ?? alerts[0];
      const alerte = premiere ? ` ${enPhrase(borne(premiere.label))}` : "";
      switch (status) {
        case "building":
          return `${nom} est en construction : aucune mesure à analyser.`;
        case "error":
          return `${nom} signale une erreur.${alerte}`;
        case "degraded":
          return `${nom} a des données en retard.${alerte}`;
        case "ok":
          if (!premiere) return `${nom} est à jour, rien à signaler.`;
          // Des données fraîches ne veulent pas dire « tout va bien » : une alerte grave ou un
          // avertissement n'est jamais dit sous un « à jour » (la carte, elle, l'affiche en rouge).
          return premiere.severity === "info" ? `${nom} est à jour.${alerte}` : `${nom} a un point à regarder.${alerte}`;
      }
    }
  }
}

/** La phrase du panneau des coûts : seulement le nombre de quotas à surveiller, que la carte affiche. */
export function ditCouts(quotasASurveiller: number, nbQuotas: number): string {
  if (nbQuotas === 0) return "Aucun quota n’est publié pour l’instant.";
  if (quotasASurveiller === 0) return "Aucun quota à surveiller.";
  return `${quotasASurveiller} quota${quotasASurveiller > 1 ? "s" : ""} à surveiller.`;
}

export type MotifLia = "salut" | "rien" | "relance";

const RANG: Record<GraviteLia, number> = { alert: 0, warn: 1, info: 2, ok: 3 };

/** Les faits qui posent problème, le plus grave d'abord (ordre des cartes conservé à gravité égale). */
function problemes(faits: readonly FaitLia[]): FaitLia[] {
  return faits
    .filter((f) => f.gravite === "alert" || f.gravite === "warn")
    .map((f, i) => ({ f, i }))
    .sort((a, b) => RANG[a.f.gravite] - RANG[b.f.gravite] || a.i - b.i)
    .map(({ f }) => f);
}

/**
 * Ce que LIA dit seule, ou `null` (elle se tait). `faits` vient des cartes AFFICHÉES : une page qui
 * n'a pas fini de charger ne donne aucun fait, donc aucune parole. `heure` : l'heure locale de Marc
 * (0 à 23) ; le silence de nuit est géré par le paquet `lia-ui`.
 */
export function parleSeule(motif: MotifLia, faits: readonly FaitLia[], heure: number): string | null {
  if (faits.length === 0) return null;
  const pire = problemes(faits)[0];
  switch (motif) {
    case "salut": {
      const bonjour = heure < 5 || heure >= 18 ? "Bonsoir Marc." : "Bonjour Marc.";
      if (pire) return `${bonjour} ${pire.dit}`;
      // « Rien à signaler » n'est dit que si TOUTES les cartes affichées le disent.
      return faits.every((f) => f.gravite === "ok") ? `${bonjour} Tout est à jour.` : bonjour;
    }
    case "rien":
    case "relance":
      return pire ? pire.dit : null;
  }
}

/**
 * Ce que le hub sait du monde, en nombres de 0 à 1, pour le réseau d'humeurs de LIA (`entrees()` de
 * `@mokarade/lia-ui`, lu chaque seconde). Calculé des seules cartes AFFICHÉES : aucune carte, aucune
 * entrée (`{}` : un monde calme, jamais une inquiétude inventée).
 *   - `alerte` : 1 si une carte est en alerte grave, 0,6 si le pire est un avertissement, sinon 0 ;
 *   - `nbAlertes` : la part des cartes affichées qui posent problème (alerte ou avertissement) ;
 *   - `toutVert` : 1 seulement si TOUTES les cartes affichées sont à jour, comme la phrase de LIA.
 */
export function entreesMonde(faits: readonly FaitLia[]): Record<string, number> {
  if (faits.length === 0) return {};
  const graves = faits.filter((f) => f.gravite === "alert").length;
  const avertis = faits.filter((f) => f.gravite === "warn").length;
  return {
    alerte: graves > 0 ? 1 : avertis > 0 ? 0.6 : 0,
    nbAlertes: (graves + avertis) / faits.length,
    toutVert: faits.every((f) => f.gravite === "ok") ? 1 : 0,
  };
}
