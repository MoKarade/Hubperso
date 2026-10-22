// lib/liaClient.ts — la question de LIA, côté navigateur de l'accueil (fonction pure + un fetch injecté).
//
// Appelle `POST /api/lia/ask` (même origine, cookie de session) et ne rend QUE une réponse conforme
// au contrat (`validerReponse`). Tout le reste (réseau, statut ≠ 200, JSON illisible, hors contrat)
// lève : `<Lia>` dit alors « Je ne suis pas disponible pour le moment », jamais une réponse inventée.
// La question n'est ni journalisée ni placée dans une erreur.

import { validerReponse, type ReponseAsk } from "@/lib/liaAsk";

export const ROUTE_ASK = "/api/lia/ask";

type Fetch = (entree: string, init: RequestInit) => Promise<Response>;

/** La page courante n'est jointe que si elle a la forme attendue par le contrat (« /… », ≤ 200). */
function pageValide(page: string | undefined): string | undefined {
  return page !== undefined && page.startsWith("/") && page.length <= 200 ? page : undefined;
}

export async function poserQuestion(
  question: string,
  signal: AbortSignal,
  page?: string,
  appeler: Fetch = (entree, init) => fetch(entree, init),
): Promise<ReponseAsk> {
  const p = pageValide(page);
  const r = await appeler(ROUTE_ASK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, ...(p !== undefined && { page: p }) }),
    signal,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`LIA indisponible (statut ${r.status})`);
  let json: unknown;
  try {
    json = await r.json();
  } catch {
    throw new Error("LIA indisponible (réponse illisible)");
  }
  const reponse = validerReponse(json);
  if (!reponse.ok) throw new Error("LIA indisponible (réponse hors contrat)");
  return reponse.valeur;
}
