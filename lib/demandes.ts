// lib/demandes.ts — les demandes « Que peut-on changer ici ? », côté hub (pur : aucun réseau, aucune base, aucun jeton).
//
// Quand Marc choisit « Que peut-on changer ici ? » sur un élément du hub, la demande est GARDÉE dans MemoryAI
// (une seule mémoire de LIA ; ADR 0021 de MemoryAI, `POST|GET /api/demandes`) et affichée par la page `/demandes`.
// Ce module ne fait que juger ce qui passe dans les deux sens, comme `lib/liaEtatPartage.ts` :
//   - ce que la PAGE dépose : trois champs, d'une liste fermée ou du vocabulaire du hub, rien d'autre ;
//   - ce que MemoryAI RÉPOND : jamais réparé, jamais inventé (hors contrat = indisponible).
//
// ⚠️ Une demande ne transporte JAMAIS le texte de la page. Ce texte est écrit par une app (libellé d'alerte, nom d'une
// mesure) : une fausse consigne dedans ne doit pas pouvoir entrer dans la mémoire de LIA, ni en ressortir comme une
// action. `nom` vient donc d'une liste que le hub écrit lui-même (`GENRES_HUB`, `lib/liaElement.ts`), jamais de l'élément.
// La date est posée par le SERVEUR du hub : l'horloge d'un navigateur ne décide de rien.

import type { Relais } from "@/lib/liaEtatPartage";

/** Les apps que MemoryAI accepte dans `app` : `hub` pour tout ce qui n'est pas dans la carte d'une app. */
export const APPS_DEMANDE = ["hub", "financeai", "driveai", "batchchef", "carai", "jobai", "memoryai"] as const;
type AppDemande = (typeof APPS_DEMANDE)[number];

/** Les genres que MemoryAI accepte (ADR 0021), du plus précis au repli. */
export const GENRES_DEMANDE = ["tuile", "bouton", "page", "graphique", "texte", "autre"] as const;
type GenreDemande = (typeof GENRES_DEMANDE)[number];

/** `nom` : 1 à 80 caractères (limite de MemoryAI). */
export const NOM_DEMANDE_MAX = 80;
/** Au-delà, 413 avant même de lire le JSON (limite de MemoryAI : 2 Ko). */
export const TAILLE_MAX_DEMANDE = 2 * 1024;
/** Délai du saut hub → MemoryAI. */
export const DELAI_DEMANDES_MS = 8_000;
/** Combien de demandes MemoryAI rend au plus (ADR 0021). */
const DEMANDES_MAX = 100;
/** Ce qu'on écrit quand l'élément visé n'est pas un bloc que le hub sait nommer. */
export const NOM_PAR_DEFAUT = "un élément de la page";

/** Ce que la page dépose : l'élément visé, rien d'autre. */
export interface DepotDemande {
  app: AppDemande;
  genre: GenreDemande;
  nom: string;
}

/** Une demande gardée par MemoryAI, telle que la liste la rend. */
interface DemandeGardee extends DepotDemande {
  id: string;
  type: "changer";
  demandeLe: string;
}

const estApp = (v: unknown): v is AppDemande => typeof v === "string" && (APPS_DEMANDE as readonly string[]).includes(v);
const estGenre = (v: unknown): v is GenreDemande => typeof v === "string" && (GENRES_DEMANDE as readonly string[]).includes(v);

/** Un nom valable : 1 à 80 caractères après nettoyage des bords, ni `<`, ni `>`, ni retour à la ligne, ni caractère de contrôle. */
export function nomValable(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const net = v.trim();
  return net.length >= 1 && net.length <= NOM_DEMANDE_MAX && v === net && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/.test(v);
}

export type LectureDepot =
  | { ok: true; depot: DepotDemande }
  | { ok: false; status: 400 | 413 | 422; error: string; message: string };

/** Lit le corps BRUT d'un dépôt de la page. Le refus ne cite jamais une valeur reçue. */
export function lireDepot(brut: string): LectureDepot {
  if (Buffer.byteLength(brut, "utf8") > TAILLE_MAX_DEMANDE) {
    return { ok: false, status: 413, error: "payload_too_large", message: `Corps au-delà de ${TAILLE_MAX_DEMANDE} octets.` };
  }
  let json: unknown;
  try {
    json = JSON.parse(brut);
  } catch {
    return { ok: false, status: 400, error: "bad_request", message: "JSON attendu : { app, genre, nom }." };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, status: 400, error: "bad_request", message: "JSON attendu : { app, genre, nom }." };
  }
  const { app, genre, nom, ...autres } = json as Record<string, unknown>;
  // Un champ de plus est refusé, jamais retiré en silence (comme MemoryAI).
  if (Object.keys(autres).length > 0 || !estApp(app) || !estGenre(genre) || !nomValable(nom)) {
    return { ok: false, status: 422, error: "invalid_fields", message: "Demande hors contrat : app, genre et nom attendus." };
  }
  return { ok: true, depot: { app, genre, nom } };
}

/** Le corps envoyé à MemoryAI : le dépôt, son type et l'instant où le HUB l'a reçu. */
export function corpsPourMemoire(depot: DepotDemande, maintenant: Date): string {
  return JSON.stringify({ type: "changer", app: depot.app, genre: depot.genre, nom: depot.nom, demandeLe: maintenant.toISOString() });
}

const indisponible = (message: string): Relais => ({ status: 503, corps: { error: "unavailable", message } });

function lireJson(brut: string): unknown {
  try {
    return JSON.parse(brut);
  } catch {
    return undefined;
  }
}

/**
 * Traduit la réponse de MemoryAI au dépôt. 201 = gardée, 200 = déjà gardée aujourd'hui, 410 = Marc l'avait oubliée.
 * 401, 403 et 503 veulent dire que le hub est mal configuré ou la mémoire gelée : la page n'apprend que « indisponible ».
 * Un refus 400, 413 ou 422 serait un défaut du hub, pas de Marc : 502, sans recopier ce que MemoryAI a répondu.
 */
export function relayerDepot(statut: number, brut: string): Relais {
  if (statut === 200 || statut === 201) {
    const j = lireJson(brut) as { id?: unknown; demandeLe?: unknown; nouvelle?: unknown } | null | undefined;
    if (typeof j?.id === "string" && typeof j.demandeLe === "string" && typeof j.nouvelle === "boolean") {
      return { status: statut, corps: { id: j.id, nouvelle: j.nouvelle } };
    }
    return indisponible("Réponse de MemoryAI hors contrat.");
  }
  if (statut === 410) return { status: 410, corps: { error: "oubliee" } };
  if (statut === 400 || statut === 413 || statut === 422) {
    return { status: 502, corps: { error: "refused", message: "MemoryAI a refusé la demande (hors contrat)." } };
  }
  if (statut === 503) return indisponible("La mémoire de LIA est indisponible (gelée ou sans base).");
  return indisponible(`MemoryAI a répondu ${statut}.`);
}

export type LectureListe =
  | { ok: true; demandes: DemandeGardee[] }
  | { ok: false; raison: string };

const ISO_AVEC_FUSEAU = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function demandeGardee(v: unknown): DemandeGardee | null {
  if (typeof v !== "object" || v === null) return null;
  const { id, type, app, genre, nom, demandeLe } = v as Record<string, unknown>;
  if (typeof id !== "string" || id === "" || type !== "changer" || !estApp(app) || !estGenre(genre) || !nomValable(nom)) return null;
  if (typeof demandeLe !== "string" || !ISO_AVEC_FUSEAU.test(demandeLe) || Number.isNaN(Date.parse(demandeLe))) return null;
  return { id, type, app, genre, nom, demandeLe };
}

/**
 * Lit la liste rendue par `GET /api/demandes`. Une seule entrée hors contrat rend toute la liste indisponible : on ne
 * montre pas à Marc une liste « réparée » à laquelle il manquerait peut-être une ligne sans qu'on le sache.
 */
export function lireListe(statut: number, brut: string): LectureListe {
  if (statut !== 200) {
    return { ok: false, raison: statut === 503 ? "La mémoire de LIA est indisponible." : `MemoryAI a répondu ${statut}.` };
  }
  const j = lireJson(brut) as { demandes?: unknown } | null | undefined;
  if (!Array.isArray(j?.demandes) || j.demandes.length > DEMANDES_MAX) return { ok: false, raison: "Réponse de MemoryAI hors contrat." };
  const demandes: DemandeGardee[] = [];
  for (const brute of j.demandes) {
    const d = demandeGardee(brute);
    if (!d) return { ok: false, raison: "Réponse de MemoryAI hors contrat." };
    demandes.push(d);
  }
  return { ok: true, demandes };
}
