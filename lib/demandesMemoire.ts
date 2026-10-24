// lib/demandesMemoire.ts — le saut hub → MemoryAI pour les demandes « Que peut-on changer ici ? » (I/O, côté SERVEUR seulement).
//
// `POST|GET {MemoryAI}/api/demandes` (ADR 0021 de MemoryAI), avec le `HUB_TOKEN` que le hub détient déjà pour MemoryAI
// (aucun nouveau secret) et `x-lia-proprietaire: 1` après que l'appelant a prouvé qu'il est le propriétaire. Le jeton
// ne sort jamais d'ici ; ce qui revient est jugé par `lib/demandes.ts` avant d'aller plus loin. Un échec réseau ou un
// jeton absent ne lève pas : l'appelant reçoit « indisponible », jamais une demande ou une liste inventée.

import { HUB_TOKEN_HEADER } from "@mokarade/hub-contract";
import { corpsPourMemoire, DELAI_DEMANDES_MS, lireListe, relayerDepot, type DepotDemande, type LectureListe } from "@/lib/demandes";
import { EN_TETE_PROPRIETAIRE, type Relais } from "@/lib/liaEtatPartage";
import { SOURCE_DEFS } from "@/lib/sources";

/** L'adresse et le jeton de MemoryAI, ou `null` si le hub n'est pas configuré pour lui. */
function memoire(env: Record<string, string | undefined> = process.env): { base: string; jeton: string } | null {
  const def = SOURCE_DEFS.find((d) => d.id === "memoryai");
  const jeton = def ? env[def.tokenEnv]?.trim() : undefined;
  return def && jeton ? { base: def.accueilUrl, jeton } : null;
}

async function appeler(methode: "GET" | "POST", corps?: string): Promise<{ statut: number; brut: string } | "non-configure" | "injoignable"> {
  const cible = memoire();
  if (!cible) return "non-configure";
  try {
    const r = await fetch(`${cible.base}/api/demandes`, {
      method: methode,
      headers: {
        [HUB_TOKEN_HEADER]: cible.jeton,
        [EN_TETE_PROPRIETAIRE]: "1",
        ...(corps !== undefined && { "content-type": "application/json" }),
      },
      ...(corps !== undefined && { body: corps }),
      signal: AbortSignal.timeout(DELAI_DEMANDES_MS),
      cache: "no-store",
    });
    return { statut: r.status, brut: await r.text() };
  } catch (e) {
    // Jamais la demande ni le jeton : seulement le type d'erreur (délai, réseau).
    console.error("[lia/demandes] MemoryAI en échec :", e instanceof Error ? e.name : "inconnue");
    return "injoignable";
  }
}

/** Dépose une demande (l'instant est celui du hub, posé ici). */
export async function deposerDemande(depot: DepotDemande, maintenant: Date = new Date()): Promise<Relais> {
  const r = await appeler("POST", corpsPourMemoire(depot, maintenant));
  if (r === "non-configure") return { status: 503, corps: { error: "unavailable", message: "Les demandes ne sont pas configurées sur le hub." } };
  if (r === "injoignable") return { status: 503, corps: { error: "unavailable", message: "MemoryAI injoignable." } };
  return relayerDepot(r.statut, r.brut);
}

/** La liste des demandes gardées, la plus récente d'abord ; `ok: false` + la raison quand MemoryAI ne peut pas la rendre. */
export async function lireDemandes(): Promise<LectureListe> {
  const r = await appeler("GET");
  if (r === "non-configure") return { ok: false, raison: "Les demandes ne sont pas configurées sur le hub." };
  if (r === "injoignable") return { ok: false, raison: "MemoryAI est injoignable." };
  return lireListe(r.statut, r.brut);
}
