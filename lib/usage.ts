// lib/usage.ts — agrégation PURE des coûts & quotas publiés par les apps (bloc `usage`
// du contrat v1.1). Générique : le hub somme ce que les apps déclarent, n'invente rien.
// Une app sans bloc `usage` est « non suivie » (jamais un 0 trompeur).

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

export interface UsageDigest {
  apps: AppUsage[];
  /** Somme des coûts connus, en CAD. */
  totalCad: number;
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

  const totalCad = Math.round(apps.reduce((s, a) => s + (a.costCad ?? 0), 0) * 100) / 100;
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

  return { apps, totalCad, trackedCount, quotaWarnings };
}
