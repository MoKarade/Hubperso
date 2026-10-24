// lib/usage.ts — agrégation PURE des coûts & quotas publiés par les apps (bloc `usage`
// du contrat v1.1). Générique : le hub somme ce que les apps déclarent, n'invente rien.
// Une app sans bloc `usage` est « non suivie » (jamais un 0 trompeur).
//
// PÉRIODES JAMAIS FUSIONNÉES (correctif 2026-07-31). Le contrat laisse chaque app choisir
// sa période (`total` | `mois` | `jour`) et elles ne s'accordent pas : BatchChef et FinanceAI
// publient un cumul depuis toujours, DriveAI publie le MOIS courant. Les additionner donnait
// un nombre qui n'existe pas — et il était affiché « cumulé », donc SOUS-ESTIMÉ des mois
// passés de DriveAI. C'est exactement le « no fake data » que le hub s'interdit. On somme
// donc PAR période et on affiche chaque total avec son étiquette.

import type { HubUsage } from "@mokarade/hub-contract";
import type { SummaryResult } from "@/lib/fetchSummary";
import { formatDuree } from "@/lib/format";

/** Taux de conversion approximatif : les coûts d'API LLM sont facturés en USD, Marc raisonne en CAD. */
export const USD_TO_CAD = 1.38;

export function toCad(amount: number, currency: "USD" | "CAD"): number {
  return currency === "USD" ? amount * USD_TO_CAD : amount;
}

/** Ratio d'un quota (0..1+), ou null si le plafond est inconnu. */
export function quotaRatio(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return used / limit;
}

interface AppUsage {
  id: string;
  name: string;
  color?: string;
  online: boolean;
  /** L'app publie-t-elle un coût ou des quotas ? */
  tracked: boolean;
  cost: HubUsage["cost"];
  /** Coût converti en CAD, ou null si l'app ne publie pas de coût. */
  costCad: number | null;
  quotas: NonNullable<HubUsage["quotas"]>;
}

/** Période déclarée par une app pour son coût (valeurs du contrat v1.1). */
export type UsagePeriod = NonNullable<HubUsage["cost"]>["period"];

/**
 * Ordre d'affichage stable : « ce mois-ci » d'abord, puis le cumul, puis aujourd'hui (maquette validée, 22/10/2026 :
 * ce qui se dépense maintenant avant ce qui s'est dépensé depuis le début). L'ordre ne fusionne rien : chaque
 * période garde son propre total.
 */
const PERIOD_ORDER: readonly UsagePeriod[] = ["mois", "total", "jour"];

export interface PeriodTotal {
  period: UsagePeriod;
  /** Somme en CAD des apps qui déclarent CETTE période. */
  cad: number;
  /** Nombre d'apps qui contribuent à ce total. */
  appCount: number;
}

export interface UsageDigest {
  apps: AppUsage[];
  /**
   * Sommes PAR PÉRIODE, jamais fusionnées (voir l'en-tête du fichier). Vide si aucune app
   * ne publie de coût. Volontairement pas de `totalCad` global : un tel champ ne peut pas
   * être honnête tant que les apps ne s'accordent pas sur la période.
   */
  totalsByPeriod: PeriodTotal[];
  /** Nombre d'apps qui publient un bloc usage exploitable. */
  trackedCount: number;
  /** Quotas à ≥ 80 % de leur plafond connu. */
  quotaWarnings: number;
}

export function aggregateUsage(results: SummaryResult[]): UsageDigest {
  const apps: AppUsage[] = results.map((r) => {
    const online = r.state === "ok";
    const usage = online ? r.summary.usage : undefined;
    const cost = usage?.cost;
    const quotas = usage?.quotas ?? [];
    return {
      id: r.source.id,
      name: online ? r.summary.app.name : r.source.name,
      color: online ? r.summary.app.color : undefined,
      online,
      tracked: Boolean(cost || quotas.length > 0),
      cost,
      costCad: cost ? Math.round(toCad(cost.amount, cost.currency) * 100) / 100 : null,
      quotas,
    };
  });

  // Regroupement par période déclarée. Une app sans coût ne contribue à rien (pas de 0 trompeur).
  const byPeriod = new Map<UsagePeriod, { cad: number; appCount: number }>();
  for (const a of apps) {
    if (!a.cost || a.costCad === null) continue;
    const acc = byPeriod.get(a.cost.period) ?? { cad: 0, appCount: 0 };
    acc.cad += a.costCad;
    acc.appCount += 1;
    byPeriod.set(a.cost.period, acc);
  }
  const totalsByPeriod: PeriodTotal[] = PERIOD_ORDER.flatMap((period) => {
    const acc = byPeriod.get(period);
    if (!acc) return [];
    return [{ period, cad: Math.round(acc.cad * 100) / 100, appCount: acc.appCount }];
  });

  const trackedCount = apps.filter((a) => a.tracked).length;
  const quotaWarnings = apps.reduce(
    (n, a) =>
      n +
      a.quotas.filter((q) => {
        const ratio = quotaRatio(q.used, q.limit);
        return ratio !== null && ratio >= 0.8;
      }).length,
    0,
  );

  return { apps, totalsByPeriod, trackedCount, quotaWarnings };
}

/** Étiquette lisible d'une période — partagée par la carte et la page de détail. */
export const PERIOD_LABEL: Record<UsagePeriod, string> = {
  total: "cumulé",
  mois: "ce mois-ci",
  jour: "aujourd’hui",
};

/**
 * Pourquoi il n'y a pas UN seul total — à afficher à côté des montants, pas seulement dans
 * un commentaire de code.
 *
 * Le hub somme par période et refuse de fusionner (voir l'en-tête). Jusqu'ici, la raison
 * n'était écrite que pour les développeurs : à l'écran, on voyait deux montants côte à côte
 * sans jamais savoir pourquoi ils n'en faisaient pas un. Un lecteur qui les additionne de
 * tête refait exactement l'erreur que le code évite — sauf que lui ne le saura pas.
 *
 * `null` quand une seule période est en jeu : il n'y a alors rien à expliquer, et une note
 * permanente deviendrait du bruit qu'on cesse de lire.
 */
export function pourquoiPasDeTotalUnique(totaux: PeriodTotal[]): string | null {
  if (totaux.length <= 1) return null;
  const periodes = totaux.map((t) => PERIOD_LABEL[t.period]).join(" et ");
  return (
    `Pas de total unique : ces montants couvrent des périodes différentes (${periodes}). ` +
    `Les additionner donnerait un nombre qui n'existe pas.`
  );
}

// ── Le panneau « Coûts et quotas » de l'accueil ─────────────────────────────────────────────
// Vues PURES de l'agrégat : le composant ne calcule rien, il peint. Même règle que le reste du
// fichier : un bloc PAR période, jamais fusionnés ; une app sans coût publié n'a pas de ligne
// (elle est nommée à part), jamais un 0.

/** Le titre de chaque bloc, dans les mots de la maquette de base (22/10/2026). */
const TITRE_BLOC: Record<UsagePeriod, string> = {
  total: "Depuis le début · cumul",
  mois: "Ce mois-ci",
  jour: "Aujourd’hui",
};

interface LigneCout {
  id: string;
  nom: string;
  couleur?: string;
  cad: number;
}

export interface BlocCout {
  period: UsagePeriod;
  titre: string;
  totalCad: number;
  /** Les apps qui déclarent CETTE période, la plus chère d'abord. */
  lignes: LigneCout[];
}

export function blocsCouts(digest: UsageDigest): BlocCout[] {
  return digest.totalsByPeriod.map((t) => ({
    period: t.period,
    titre: TITRE_BLOC[t.period],
    totalCad: t.cad,
    lignes: digest.apps
      .filter((a) => a.cost?.period === t.period && a.costCad !== null)
      .map((a) => ({ id: a.id, nom: a.name, couleur: a.color, cad: a.costCad as number }))
      .sort((a, b) => b.cad - a.cad),
  }));
}

/** Les apps qui ne publient aucun coût : nommées, jamais comptées pour 0. */
export function appsSansCout(digest: UsageDigest): string[] {
  return digest.apps.filter((a) => a.cost === undefined).map((a) => a.name);
}

export type NiveauQuota = "ok" | "warn" | "alert";

/** ≥ 80 % : à surveiller (même seuil que `quotaWarnings`) ; ≥ 100 % : dépassé. */
export function niveauQuota(ratio: number | null): NiveauQuota {
  if (ratio === null) return "ok";
  if (ratio >= 1) return "alert";
  return ratio >= 0.8 ? "warn" : "ok";
}

export interface Jauge {
  cle: string;
  appNom: string;
  label: string;
  used: number;
  /** `null` : plafond non publié, donc pas de jauge (jamais un plafond deviné). */
  limit: number | null;
  unit?: string;
  ratio: number | null;
  niveau: NiveauQuota;
  resetAt?: string;
}

/** Tous les quotas publiés, les plus pleins d'abord ; ceux sans plafond connu à la fin. */
export function jauges(digest: UsageDigest): Jauge[] {
  return digest.apps
    .flatMap((a) =>
      a.quotas.map((q, i): Jauge => {
        const ratio = quotaRatio(q.used, q.limit);
        return {
          cle: `${a.id}-${i}`,
          appNom: a.name,
          label: q.label,
          used: q.used,
          limit: q.limit,
          unit: q.unit,
          ratio,
          niveau: niveauQuota(ratio),
          resetAt: q.resetAt,
        };
      }),
    )
    .sort((x, y) => (y.ratio ?? -1) - (x.ratio ?? -1));
}

/**
 * « se remet à zéro dans 9 j », ou `null` quand l'app ne dit pas quand (ou que la date est
 * passée : une remise à zéro déjà due n'est pas une information, c'est une donnée à rafraîchir).
 * `maintenant` est passé par l'appelant (`lib/horloge.ts`) : la fonction reste pure.
 */
export function remiseAZero(resetAt: string | undefined, maintenant: number): string | null {
  if (!resetAt) return null;
  const t = new Date(resetAt).getTime();
  if (Number.isNaN(t) || t <= maintenant) return null;
  return `se remet à zéro dans ${formatDuree(t - maintenant)}`;
}
