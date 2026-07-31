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

export interface AppUsage {
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

/** Ordre d'affichage stable, du plus large au plus étroit. */
const PERIOD_ORDER: readonly UsagePeriod[] = ["total", "mois", "jour"];

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
