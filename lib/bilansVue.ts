// lib/bilansVue.ts — ce que l'onglet « Bilans » dit, à partir de ce que `/api/bilans` répond. PUR.
// Un échec est DIT avec sa raison ; jamais un bilan inventé, jamais une liste vide pour cacher une panne.

import type { Bilan, GenreBilan } from "./bilans";

export const URL_BILANS = "/api/bilans";

/** Le texte d'un échec de `/api/bilans` (son statut HTTP). */
export function messageErreurBilans(statut: number): string {
  if (statut === 401) return "Ta session a expiré : reconnecte-toi au hub.";
  if (statut === 409) return "Il manque le droit de lire Drive : reconnecte-toi une fois au hub et accepte l'écran Google.";
  if (statut === 503) return "Le dossier Drive des bilans est introuvable.";
  if (statut === 429) return "Trop de lectures d'un coup : réessaie dans une minute.";
  if (statut === 502) return "Google ne répond pas pour l'instant.";
  return "Les bilans sont indisponibles pour l'instant.";
}

/** Lit la réponse de la liste : `null` si elle n'a pas la forme du contrat (jamais réparée). */
export function bilansDeReponse(json: unknown): Bilan[] | null {
  if (typeof json !== "object" || json === null) return null;
  const { bilans } = json as { bilans?: unknown };
  if (!Array.isArray(bilans)) return null;
  const sains = bilans.filter(
    (b): b is Bilan =>
      typeof b === "object" && b !== null &&
      typeof (b as Bilan).id === "string" && typeof (b as Bilan).date === "string" &&
      ((b as Bilan).genre === "jour" || (b as Bilan).genre === "semaine"),
  );
  return sains.length === bilans.length ? sains : null;
}

/** Les bilans d'un genre, les plus récents d'abord (l'ordre de l'API est conservé). */
export function duGenre(bilans: readonly Bilan[], genre: GenreBilan): Bilan[] {
  return bilans.filter((b) => b.genre === genre);
}

/** « mercredi 28 octobre 2026 » : une date de CALENDRIER (celle du nom de fichier), sans décalage de fuseau. */
export function libelleDateBilan(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export const LIBELLE_GENRE: Record<GenreBilan, string> = { jour: "Du jour", semaine: "De la semaine" };
export const VIDE_GENRE: Record<GenreBilan, string> = {
  jour: "Aucun bilan du jour pour l'instant : le dossier Drive n'en contient aucun, la routine du Brief n'en a pas encore déposé.",
  semaine: "Aucun bilan de la semaine pour l'instant : le dossier Drive n'en contient aucun, la routine du Brief n'en a pas encore déposé.",
};
