// lib/demandesClient.ts — le dépôt d'une demande « Que peut-on changer ici ? », côté navigateur (fetch injecté).
//
// Appelle `POST /api/lia/demandes` (même origine, cookie de session ; le hub parle à MemoryAI, le navigateur n'a ni jeton ni
// adresse de MemoryAI). La demande est un geste de plus de Marc, pas une condition de la réponse de LIA : un échec
// (réseau, 503, hors contrat) est journalisé par son statut seulement et ne change rien à ce que LIA répond. Jamais la
// demande ni le texte de l'élément dans un journal.

import type { DepotDemande } from "@/lib/demandes";

export const ROUTE_DEMANDES = "/api/lia/demandes";

type Fetch = (entree: string, init: RequestInit) => Promise<Response>;

/** Rend `true` si MemoryAI a gardé la demande (nouvelle ou déjà gardée aujourd'hui), `false` sinon. Ne lève jamais. */
export async function deposerDemande(
  depot: DepotDemande,
  appeler: Fetch = (entree, init) => fetch(entree, init),
): Promise<boolean> {
  try {
    const r = await appeler(ROUTE_DEMANDES, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: depot.app, genre: depot.genre, nom: depot.nom }),
      cache: "no-store",
    });
    if (!r.ok) console.error(`[lia] demande non gardée (statut ${r.status})`);
    return r.ok;
  } catch (e) {
    console.error("[lia] demande non gardée :", e instanceof Error ? e.name : "inconnue");
    return false;
  }
}
