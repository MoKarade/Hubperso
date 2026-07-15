// lib/fetchSummary.ts
//
// Récupération server-side d'un summary d'app. Le hub fetch en `no-store` avec le
// header x-hub-token, puis VALIDE la réponse contre le contrat — un JSON qui dévie
// n'est jamais affiché comme s'il était valide. Chaque échec est un état HONNÊTE
// distinct (non configurée / non autorisée / injoignable / invalide), jamais une
// donnée inventée : le widget montre exactement ce qui ne va pas.

import {
  HUB_TOKEN_HEADER,
  validateSummary,
  type HubSummary,
} from "@mokarade/hub-contract";
import type { HubSource } from "./sources";

export type SummaryResult =
  | { state: "ok"; source: HubSource; summary: HubSummary }
  | { state: "unconfigured"; source: HubSource }
  | { state: "unauthorized"; source: HubSource }
  | { state: "unreachable"; source: HubSource; detail: string }
  | { state: "invalid"; source: HubSource; detail: string };

/** Au-delà, l'app est considérée injoignable : le dashboard ne doit jamais pendre. */
const TIMEOUT_MS = 5000;

export async function fetchSummary(
  source: HubSource,
  fetchImpl: typeof fetch = fetch,
): Promise<SummaryResult> {
  if (!source.token) return { state: "unconfigured", source };

  let response: Response;
  try {
    response = await fetchImpl(source.summaryUrl, {
      headers: { [HUB_TOKEN_HEADER]: source.token, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const detail =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? `délai dépassé (${TIMEOUT_MS} ms)`
          : err.message
        : String(err);
    return { state: "unreachable", source, detail };
  }

  if (response.status === 401) return { state: "unauthorized", source };
  if (!response.ok) {
    return { state: "unreachable", source, detail: `HTTP ${response.status}` };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { state: "invalid", source, detail: "réponse non-JSON" };
  }

  try {
    return { state: "ok", source, summary: validateSummary(data) };
  } catch (err) {
    return {
      state: "invalid",
      source,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Interroge toutes les sources en parallèle (pas de cascade). */
export function fetchAllSummaries(
  sources: HubSource[],
  fetchImpl?: typeof fetch,
): Promise<SummaryResult[]> {
  return Promise.all(sources.map((source) => fetchSummary(source, fetchImpl)));
}
