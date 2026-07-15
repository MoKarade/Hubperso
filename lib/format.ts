// lib/format.ts
//
// Formatage des valeurs du contrat pour l'affichage québécois (fr-CA, CAD).
// Le contrat livre des valeurs brutes ; c'est le hub qui décide du rendu selon `format`.

import type { HubMetric } from "@mokarade/hub-contract";

const CURRENCY = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("fr-CA");

const ONE_DECIMAL = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 });

/**
 * Rend une métrique en texte. `percent` et `trend` sont exprimés en points de %
 * dans le contrat (ex. 2.3 = « 2,3 % »), pas en fraction — on les suffixe sans
 * conversion. Une valeur `string` pour un format numérique est affichée telle quelle.
 */
export function formatMetricValue(metric: HubMetric): string {
  const { value, format } = metric;
  if (format === "text") return String(value);

  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);

  switch (format) {
    case "currency":
      return CURRENCY.format(n);
    case "percent":
      return `${ONE_DECIMAL.format(n)} %`;
    case "number":
      return NUMBER.format(n);
  }
}

/** Variation signée pour l'affichage (ex. +2,3 % / −1,0 %). */
export function formatTrend(trend: number): string {
  const sign = trend > 0 ? "+" : trend < 0 ? "−" : "";
  return `${sign}${ONE_DECIMAL.format(Math.abs(trend))} %`;
}

/** Datetime ISO → libellé court fr-CA (ex. « 15 juill., 14:05 »). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
