// lib/format.ts
//
// Formatage des valeurs du contrat pour l'affichage québécois (fr-CA, CAD).
// Le contrat livre des valeurs brutes ; c'est le hub qui décide du rendu selon `format`.

import type { HubMetric } from "@mokarade/hub-contract";
import { FUSEAU } from "./fuseau";

const CURRENCY = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("fr-CA");

const CAD_CENTS = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

/** Montant en dollars canadiens avec les cents (coûts d'usage). */
export function formatCad(amount: number): string {
  return CAD_CENTS.format(amount);
}

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

/**
 * Datetime ISO → libellé court fr-CA à l'heure du Québec (ex. « 15 juill., 14:05 »).
 *
 * ⚠️ `timeZone` n'est PAS optionnel ici. Sans lui, `Intl` prend le fuseau de la machine :
 * le hub rend ses dates côté serveur, et Vercel tourne en UTC — l'heure affichée serait
 * fausse de quatre ou cinq heures selon la saison, sans aucun signe extérieur. Voir
 * `lib/fuseau.ts`.
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: FUSEAU,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * « il y a 3 h » : l'âge d'une date ISO, en un coup d'œil. `maintenant` est passé par l'appelant
 * (voir `lib/horloge.ts`) pour que la fonction reste pure. Une date illisible ou à venir (dérive
 * d'horloge) devient « à l'instant » : jamais un âge négatif.
 */
export function ilYa(iso: string, maintenant: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const ms = maintenant - t;
  if (ms < 60_000) return "à l'instant";
  return `il y a ${formatDuree(ms)}`;
}

/**
 * Une durée en français, courte et lisible : « 3 min », « 5 h », « 14 j ».
 *
 * Arrondie à l'unité la plus parlante, jamais plus précise qu'utile : « inchangé depuis
 * 14 j 3 h 12 min » se lit moins vite que « 14 j » et n'apprend rien de plus. Sous la
 * minute on écrit « moins d'une minute » plutôt que « 0 min », qui se lirait comme
 * « instantané ».
 */
export function formatDuree(ms: number): string {
  if (ms < 60_000) return "moins d'une minute";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.round(ms / 3_600_000);
  if (heures < 24) return `${heures} h`;
  return `${Math.round(ms / 86_400_000)} j`;
}
