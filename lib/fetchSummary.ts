// lib/fetchSummary.ts
//
// Récupération server-side d'un summary d'app. Le hub fetch en `no-store` avec le
// header x-hub-token, puis VALIDE la réponse contre le contrat — un JSON qui dévie
// n'est jamais affiché comme s'il était valide. Chaque échec est un état HONNÊTE
// distinct (non configurée / non autorisée / injoignable / invalide), jamais une
// donnée inventée : le widget montre exactement ce qui ne va pas.
//
// Résilience (dernier bon résumé) : une app derrière plusieurs couches à démarrage à
// froid (Vercel + Apps Script) peut dépasser ponctuellement le budget réseau — un accroc
// transitoire ne doit PAS clignoter en « injoignable » à chaque rafraîchissement. On garde
// donc en mémoire le DERNIER résumé valide par source ; si un fetch échoue (injoignable /
// invalide) alors qu'on a un résumé récent (< STALE_MAX_MS), on le ressert marqué `stale`
// (badge « En cache » + âge affiché — donnée RÉELLE, jamais inventée, jamais présentée
// comme live). Passé ce délai, on préfère l'erreur honnête à une donnée trop vieille masquée.

import {
  HUB_TOKEN_HEADER,
  validateSummary,
  type HubSummary,
} from "@mokarade/hub-contract";
import type { HubSource } from "./sources";

export type SummaryResult =
  | {
      state: "ok";
      source: HubSource;
      summary: HubSummary;
      /** Résumé servi depuis le cache (l'app n'a pas répondu à temps) — jamais présenté comme live. */
      stale?: boolean;
      /** Âge du résumé en cache (ms), quand `stale`. */
      cachedAgeMs?: number;
    }
  | { state: "unconfigured"; source: HubSource }
  | { state: "unauthorized"; source: HubSource }
  | { state: "unreachable"; source: HubSource; detail: string }
  | { state: "invalid"; source: HubSource; detail: string };

/**
 * Budget d'attente d'une app. Doit rester AU-DESSUS du timeout interne du broker le plus lent
 * (DriveAI attend Apps Script jusqu'à 8 s au réveil à froid) : sinon le hub coupe avant de
 * recevoir la réponse, et le cache ne se remplit jamais (le bug initial : 3 s < 4,8 s côté
 * broker → « délai dépassé » en boucle). 9 s laisse la réponse arriver ; si l'app dépasse quand
 * même, on retombe sur le dernier bon résumé en cache — jamais un « injoignable » clignotant.
 */
const TIMEOUT_MS = 9000;

/** Au-delà, un résumé en cache est trop vieux pour masquer une panne : on montre l'erreur honnête. */
const STALE_MAX_MS = 30 * 60 * 1000; // 30 min

type Cached = { summary: HubSummary; at: number };
/** Dernier résumé VALIDE par `source.id`. Mémoire du process (suffit au rafraîchissement 60 s). */
const lastGood = new Map<string, Cached>();

/** Vide le cache de résilience — pour les tests (isolation entre cas). */
export function __resetSummaryCache(): void {
  lastGood.clear();
}

export async function fetchSummary(
  source: HubSource,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<SummaryResult> {
  if (!source.token) return { state: "unconfigured", source };

  const live = await fetchLive(source, fetchImpl);

  // Succès : on rafraîchit le cache et on sert la donnée live.
  if (live.state === "ok") {
    lastGood.set(source.id, { summary: live.summary, at: now() });
    return live;
  }

  // Accroc transitoire (injoignable / invalide) : sers le dernier bon résumé s'il est encore
  // récent. `unauthorized` / `unconfigured` NE sont PAS masqués (vrais problèmes à corriger).
  if (live.state === "unreachable" || live.state === "invalid") {
    const cached = lastGood.get(source.id);
    if (cached) {
      const age = now() - cached.at;
      if (age <= STALE_MAX_MS) {
        return { state: "ok", source, summary: cached.summary, stale: true, cachedAgeMs: age };
      }
    }
  }

  return live;
}

/** Un seul aller-retour réseau + validation contrat. Sans cache : la résilience est au-dessus. */
async function fetchLive(source: HubSource, fetchImpl: typeof fetch): Promise<SummaryResult> {
  let response: Response;
  try {
    response = await fetchImpl(source.summaryUrl, {
      headers: { [HUB_TOKEN_HEADER]: source.token!, accept: "application/json" },
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
