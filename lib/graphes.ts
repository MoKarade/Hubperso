// lib/graphes.ts — les graphes de code des dépôts, lus dans leurs artefacts GitHub Actions.
//
// Chaque dépôt publie, à chaque push sur `main`, un artefact `graphe` : `graph.html` (la vue
// interactive, déjà triée par fichier) et `meta.json` (dépôt, commit, date, nombres). Le hub ne
// construit rien : il LIT le dernier artefact de chaque dépôt par l'API GitHub, avec UN jeton de
// lecture seule posé côté serveur (`GITHUB_GRAPHES_TOKEN`). Sans lui, la page le dit.
//
// ── CE QUE CE MODULE NE FAIT JAMAIS ──────────────────────────────────────────────────
//   - inventer un graphe, une date ou un commit : tout vient de l'API ou de `meta.json` ;
//   - avaler une erreur : chaque échec est un ÉTAT (`erreur`, `expire`, `aucun`…) que la page écrit ;
//   - faire confiance au contenu : `graph.html` vient du code d'un dépôt. Il n'est jamais servi dans
//     l'origine du hub (voir `app/api/graphes/[depot]/route.ts` : CSP + sandbox).
//
// ── POURQUOI UN ARTEFACT ET PAS UNE BRANCHE ──────────────────────────────────────────
// Une branche poussée sur un dépôt d'app déclenche un build Vercel (quota partagé) et, chez
// BatchChef, une migration de la base de production dès le premier push hors `claude/*`.

import { lireZip } from "./zip";

/** Propriétaire GitHub des dépôts du hub. */
const PROPRIETAIRE = "MoKarade";

/** Les dépôts qui publient un graphe. Le nom est celui du dépôt GitHub, tel quel. */
export const DEPOTS = [
  "Hubperso",
  "FinanceAI",
  "JobAI",
  "CarAI",
  "MemoryAI",
  "DriveAI",
  "batchchef-",
  "app-template",
  "hub-contract",
  ".github",
] as const;

export type Depot = (typeof DEPOTS)[number];

/** Nom de l'artefact publié par chaque dépôt. */
const NOM_ARTEFACT = "graphe";

/** Identifiant d'URL d'un dépôt : sans point de tête ni tiret final, en minuscules. */
export function idDepot(depot: string): string {
  return depot.toLowerCase().replace(/^\./, "").replace(/-+$/, "");
}

/** Retrouve le dépôt d'un identifiant d'URL, ou `null` : jamais un nom venu de l'URL tel quel. */
export function depotDepuisId(id: string): Depot | null {
  return DEPOTS.find((d) => idDepot(d) === id) ?? null;
}

/** `meta.json` : ce que le dépôt dit de son propre graphe. Validé, jamais présumé. */
export interface MetaGraphe {
  depot: string;
  sha: string;
  genereLe: string;
  noeuds: number;
  aretes: number;
  filtre: string;
}

const SHA = /^[0-9a-f]{7,40}$/;

const entierPositif = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** Valide `meta.json` champ par champ ; `null` à la moindre dérive (aucune valeur par défaut). */
export function lireMeta(json: unknown): MetaGraphe | null {
  if (typeof json !== "object" || json === null) return null;
  const m = json as Record<string, unknown>;
  const { depot, sha, genereLe, noeuds, aretes, filtre } = m;
  if (typeof depot !== "string" || depot.length < 1 || depot.length > 100) return null;
  if (typeof sha !== "string" || !SHA.test(sha)) return null;
  if (typeof genereLe !== "string" || Number.isNaN(Date.parse(genereLe))) return null;
  if (!entierPositif(noeuds) || !entierPositif(aretes)) return null;
  if (typeof filtre !== "string" || filtre.length > 100) return null;
  return { depot, sha, genereLe, noeuds, aretes, filtre };
}

/** L'état d'un dépôt, tel que la page l'écrit. */
export type EtatGraphe =
  | { etat: "non-branche" }
  | { etat: "aucun" }
  | { etat: "expire"; creeLe: string }
  | { etat: "erreur"; detail: string }
  | { etat: "ok"; artefactId: number; sha: string; creeLe: string; octets: number };

interface ArtefactApi {
  id: number;
  expired: boolean;
  created_at: string;
  size_in_bytes: number;
  workflow_run?: { head_sha?: string; head_branch?: string };
}

/**
 * Le dernier artefact `graphe` produit sur `main`, ou `null`.
 *
 * ⚠️ Filtré sur la branche `main` : un artefact venu d'une PR n'est pas l'état du dépôt. L'API
 * les rend du plus récent au plus ancien ; on garde le premier qui convient.
 */
export function choisirArtefact(reponse: unknown): ArtefactApi | null {
  const liste = (reponse as { artifacts?: unknown })?.artifacts;
  if (!Array.isArray(liste)) return null;
  for (const a of liste as ArtefactApi[]) {
    if (a && typeof a.id === "number" && a.workflow_run?.head_branch === "main") return a;
  }
  return null;
}

type Env = Record<string, string | undefined>;
type FetchFn = typeof fetch;

const TIMEOUT_MS = 10_000;

function entetes(jeton: string): HeadersInit {
  return {
    Authorization: `Bearer ${jeton}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hubperso",
  };
}

/** Le jeton de lecture, ou `null` : la page dit alors « non branchée » plutôt que d'échouer. */
export function jetonGraphes(env: Env = process.env): string | null {
  const v = env.GITHUB_GRAPHES_TOKEN?.trim();
  return v ? v : null;
}

/** L'état d'un dépôt : un appel d'API, jamais le téléchargement de l'artefact. */
export async function etatDepot(
  depot: Depot,
  env: Env = process.env,
  fetchImpl: FetchFn = fetch,
): Promise<EtatGraphe> {
  const jeton = jetonGraphes(env);
  if (!jeton) return { etat: "non-branche" };
  const url = `https://api.github.com/repos/${PROPRIETAIRE}/${depot}/actions/artifacts?name=${NOM_ARTEFACT}&per_page=20`;
  try {
    const rep = await fetchImpl(url, { headers: entetes(jeton), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (rep.status === 401 || rep.status === 403) {
      return { etat: "erreur", detail: `GitHub refuse le jeton (HTTP ${rep.status})` };
    }
    if (rep.status === 404) return { etat: "erreur", detail: "dépôt introuvable pour ce jeton (HTTP 404)" };
    if (!rep.ok) return { etat: "erreur", detail: `GitHub répond HTTP ${rep.status}` };
    const a = choisirArtefact(await rep.json());
    if (!a) return { etat: "aucun" };
    if (a.expired) return { etat: "expire", creeLe: a.created_at };
    const sha = a.workflow_run?.head_sha;
    if (!sha || !SHA.test(sha)) return { etat: "erreur", detail: "artefact sans commit lisible" };
    return { etat: "ok", artefactId: a.id, sha, creeLe: a.created_at, octets: a.size_in_bytes };
  } catch (e) {
    return { etat: "erreur", detail: e instanceof Error ? e.message : "échec réseau" };
  }
}

interface GrapheCharge {
  meta: MetaGraphe;
  html: string;
}

export type ResultatGraphe =
  | { ok: true; graphe: GrapheCharge }
  | { ok: false; detail: string };

/**
 * Cache mémoire PAR ARTEFACT : un identifiant d'artefact ne change jamais de contenu, et une
 * nouvelle fusion en produit un nouveau. Il ne peut donc pas être périmé. Borné pour ne pas
 * grossir (un graphe pèse jusqu'à ~2,6 Mo).
 */
const CACHE = new Map<number, GrapheCharge>();
const CACHE_MAX = 12;

export function viderCacheGraphes(): void {
  CACHE.clear();
}

/** Lit `graph.html` et `meta.json` d'une archive d'artefact et vérifie qu'elle est celle du dépôt. */
export function lireArchiveGraphe(archive: Buffer, depot: Depot, sha: string): ResultatGraphe {
  let fichiers: Map<string, Buffer>;
  try {
    fichiers = lireZip(archive);
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "archive illisible" };
  }
  const brutMeta = fichiers.get("meta.json");
  const brutHtml = fichiers.get("graph.html");
  if (!brutMeta || !brutHtml) return { ok: false, detail: "l'artefact ne contient pas graph.html et meta.json" };

  let json: unknown;
  try {
    json = JSON.parse(brutMeta.toString("utf8"));
  } catch {
    return { ok: false, detail: "meta.json n'est pas du JSON" };
  }
  const meta = lireMeta(json);
  if (!meta) return { ok: false, detail: "meta.json non conforme" };
  // Le dépôt et le commit annoncés par le fichier doivent être CEUX de l'artefact : un graphe
  // copié d'un autre dépôt ne doit pas s'afficher sous le mauvais nom.
  if (meta.depot.split("/").pop()!.toLowerCase() !== depot.toLowerCase()) {
    return { ok: false, detail: `meta.json annonce le dépôt « ${meta.depot} », pas « ${depot} »` };
  }
  if (!sha.startsWith(meta.sha) && !meta.sha.startsWith(sha)) {
    return { ok: false, detail: "meta.json annonce un autre commit que celui de l'artefact" };
  }
  return { ok: true, graphe: { meta, html: brutHtml.toString("utf8") } };
}

/** Télécharge (ou rend du cache) le graphe d'un dépôt. Jamais de rejet : un état d'échec. */
export async function chargerGraphe(
  depot: Depot,
  env: Env = process.env,
  fetchImpl: FetchFn = fetch,
): Promise<ResultatGraphe> {
  const etat = await etatDepot(depot, env, fetchImpl);
  switch (etat.etat) {
    case "non-branche":
      return { ok: false, detail: "le hub n'a pas de jeton de lecture GitHub (GITHUB_GRAPHES_TOKEN)" };
    case "aucun":
      return { ok: false, detail: "ce dépôt n'a encore publié aucun graphe" };
    case "expire":
      return { ok: false, detail: "le dernier graphe a expiré (il se renouvelle à la prochaine fusion)" };
    case "erreur":
      return { ok: false, detail: etat.detail };
    case "ok":
      break;
  }
  const enCache = CACHE.get(etat.artefactId);
  if (enCache) return { ok: true, graphe: enCache };

  const jeton = jetonGraphes(env)!;
  try {
    const url = `https://api.github.com/repos/${PROPRIETAIRE}/${depot}/actions/artifacts/${etat.artefactId}/zip`;
    // L'API répond 302 vers une URL signée d'un autre hôte : `fetch` retire l'en-tête
    // Authorization à la traversée d'origine, le jeton ne part donc pas chez le stockage.
    const rep = await fetchImpl(url, {
      headers: entetes(jeton),
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!rep.ok) return { ok: false, detail: `téléchargement refusé (HTTP ${rep.status})` };
    const res = lireArchiveGraphe(Buffer.from(await rep.arrayBuffer()), depot, etat.sha);
    if (res.ok) {
      if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value!);
      CACHE.set(etat.artefactId, res.graphe);
    }
    return res;
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "échec réseau" };
  }
}
