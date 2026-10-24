// lib/liaEtatPartage.ts — l'état PARTAGÉ de LIA, côté hub (pur : aucun réseau, aucune base, aucun jeton).
//
// Une seule LIA, un seul état (Marc, 23/10/2026) : MemoryAI le garde (`GET|PUT /api/etat-lia`, contrat
// `commun/assistant/CONTRAT-etat-lia.md`), le hub le relaie à la page par `/api/lia/etat` (même origine,
// session du hub) et n'en invente jamais un. Ce module ne fait que juger ce qui passe dans les deux sens :
//   - ce que la page ÉCRIT : trop gros = 413, hors contrat = 400, sinon l'état nettoyé par `validerEtat`
//     (la fonction même que LIA applique, exportée par le paquet depuis v0.22.0) est relayé ;
//   - ce que MemoryAI RÉPOND : un 200 ou un 409 n'est rendu que s'il est un état valide ; tout le reste
//     (jeton refusé, base absente, réponse hors contrat) devient 503, jamais une réponse réparée.
// Aucun contenu de Marc dans cet état : des nombres, des verbes de LIA et un nom d'humeur.

import { validerEtat, type EtatLia } from "@mokarade/lia-ui";

/** Au-delà, 413 avant même de lire le JSON (contrat : 16 Ko, la limite de MemoryAI). */
export const TAILLE_MAX_ETAT = 16 * 1024;
/** Délai du saut hub → MemoryAI : l'état est une petite ligne, LIA vit sans lui si ça traîne. */
export const DELAI_ETAT_MS = 8_000;
/** L'en-tête par lequel le hub dit à MemoryAI que la page est celle du propriétaire. */
export const EN_TETE_PROPRIETAIRE = "x-lia-proprietaire";

export type LectureCorps =
  | { ok: true; etat: EtatLia }
  | { ok: false; status: 400 | 413; error: string; message: string };

/** Lit le corps BRUT d'un PUT de la page. Le refus ne cite jamais une valeur reçue. */
export function lireCorpsEtat(brut: string): LectureCorps {
  if (Buffer.byteLength(brut, "utf8") > TAILLE_MAX_ETAT) {
    return { ok: false, status: 413, error: "payload_too_large", message: `Corps au-delà de ${TAILLE_MAX_ETAT} octets.` };
  }
  let json: unknown;
  try {
    json = JSON.parse(brut);
  } catch {
    return { ok: false, status: 400, error: "bad_request", message: "JSON attendu : l'état de LIA." };
  }
  const etat = validerEtat(json);
  return etat
    ? { ok: true, etat }
    : { ok: false, status: 400, error: "bad_request", message: "État de LIA non conforme au contrat." };
}

/** Ce que la route rend à la page : un statut et un corps JSON (`null` = aucun corps, comme un 204). */
export type Relais = { status: number; corps: unknown };

const indisponible = (message: string): Relais => ({
  status: 503,
  corps: { error: "unavailable", message },
});

/**
 * Traduit la réponse de MemoryAI en réponse pour la page. `brut` est le corps lu tel quel (texte) : un JSON
 * illisible ou un état hors contrat ne passe pas. 401 et 403 de MemoryAI veulent dire que le hub est mal
 * configuré, pas que la page a tort : la page n'apprend que « indisponible ».
 */
export function relayerReponse(methode: "GET" | "PUT", statut: number, brut: string): Relais {
  if (methode === "GET" && statut === 204) return { status: 204, corps: null };

  if (statut === 200 || (methode === "PUT" && statut === 409)) {
    let json: unknown;
    try {
      json = JSON.parse(brut);
    } catch {
      return indisponible("Réponse de MemoryAI illisible.");
    }
    const etat = validerEtat(json);
    if (etat) return { status: statut, corps: etat };
    // 409 sans état gardé exploitable (ligne abîmée côté MemoryAI) : la page garde le sien et réessaiera.
    if (statut === 409) return { status: 409, corps: { error: "version_depassee" } };
    return indisponible("Réponse de MemoryAI hors contrat.");
  }

  if (methode === "PUT" && statut === 400) {
    return { status: 400, corps: { error: "bad_request", message: "MemoryAI a refusé l'état (hors contrat)." } };
  }
  if (methode === "PUT" && statut === 413) {
    return { status: 413, corps: { error: "payload_too_large", message: "MemoryAI a refusé l'état (trop gros)." } };
  }
  if (statut === 503) return indisponible("La mémoire de LIA est indisponible (gelée ou sans base).");
  return indisponible(`MemoryAI a répondu ${statut}.`);
}
