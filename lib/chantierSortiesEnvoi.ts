// lib/chantierSortiesEnvoi.ts — l'envoi des sorties du chantier à MemoryAI (Hubperso#651). La seule I/O de la chaîne.
//
// Un échec ne remonte JAMAIS : il se dit au journal serveur (le code seulement, jamais le jeton ni le corps) et
// l'envoi du PC, lui, a déjà réussi. Aucune nouvelle de MemoryAI n'est un état à garder : le relevé suivant renvoie. Chaque relevé pousse (toutes les 10 min) : MemoryAI écarte ce qu'elle a déjà par (app, empreinte), et la `ref` d'un événement porte l'empreinte de son état, donc un renvoi identique ne crée rien (ADR 0031).

import { SOURCE_DEFS } from "./sources";
import type { EvenementChantier as WebhookChantier } from "./chantierEvenements";
import { corpsSorties, decoderReleve, evenementsChantier, sortieDepuisWebhook, type EvenementChantier } from "./chantierSorties";

/** Au-delà, on abandonne : l'envoi tourne après la réponse au PC et ne doit pas rester pendu. */
export const DELAI_ENVOI_MS = 8_000;

export type IssueEnvoi = "non-configure" | "releve-illisible" | "rien-a-envoyer" | "envoye" | "refuse" | "injoignable";

export interface EntreeEnvoi {
  donneesGzB64: string;
  maintenant: Date;
  jeton: string | undefined;
  /** Surchargeable par un test ; en production, `fetch`. */
  appeler?: typeof fetch;
}

/** Poste une liste d'événements à `POST /api/sorties` de MemoryAI. Rend ce qui s'est passé, ne lève jamais. */
async function envoyer(evenements: readonly EvenementChantier[], jeton: string | undefined, appeler: typeof fetch | undefined, origine: string): Promise<IssueEnvoi> {
  const memoire = SOURCE_DEFS.find((d) => d.id === "memoryai");
  const secret = jeton?.trim();
  if (!memoire || !secret) return "non-configure";
  if (evenements.length === 0) return "rien-a-envoyer";
  try {
    const r = await (appeler ?? fetch)(`${memoire.accueilUrl}/api/sorties`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify(corpsSorties(evenements)),
      signal: AbortSignal.timeout(DELAI_ENVOI_MS),
      cache: "no-store",
    });
    if (!r.ok) {
      console.error(`[${origine}] sorties du chantier refusées par MemoryAI :`, r.status);
      return "refuse";
    }
    return "envoye";
  } catch (err) {
    console.error(`[${origine}] sorties du chantier : MemoryAI injoignable :`, err instanceof Error ? err.name : "inconnue");
    return "injoignable";
  }
}

/** Pousse l'état du chantier (relevé du PC). Rend ce qui s'est passé, ne lève jamais. */
export async function pousserSortiesChantier(e: EntreeEnvoi): Promise<IssueEnvoi> {
  if (!e.jeton?.trim()) return "non-configure";
  const releve = decoderReleve(e.donneesGzB64);
  if (releve === null) return "releve-illisible";
  return envoyer(evenementsChantier(releve, e.maintenant), e.jeton, e.appeler, "gantt");
}

/**
 * Pousse UN webhook reçu, à l'instant où il arrive : le relevé n'est pas relu (Neon), l'événement suffit. Rend ce qui
 * s'est passé, ne lève jamais.
 */
export function pousserSortieWebhook(e: { evenement: WebhookChantier; jeton: string | undefined; appeler?: typeof fetch }): Promise<IssueEnvoi> {
  return envoyer([sortieDepuisWebhook(e.evenement)], e.jeton, e.appeler, "chantier");
}
