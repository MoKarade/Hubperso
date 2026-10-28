// lib/bilansDrive.ts — lire les bilans dans le dossier Drive, avec le jeton de Marc (`lib/jetonDrive.ts`).
// L'I/O ; ce qu'est un bilan se décide dans `lib/bilans.ts` (PUR).
//
// Contre une lecture hors du dossier : la liste ne demande que ses enfants, et la lecture d'UN bilan vérifie
// d'abord que le fichier est dans ce dossier, hors corbeille, au bon nom et à la taille permise (un identifiant
// tiré d'une URL ne fait jamais lire un autre fichier du Drive). Ni jeton ni contenu dans un journal.

import { Bilan, bilanDepuisFichier, classerBilans, fichiersDeListeDrive, idDriveValide, TAILLE_MAX_BILAN } from "./bilans";

const API = "https://www.googleapis.com/drive/v3/files";
const DELAI_MS = 10_000;

export type Lecture<T> = { ok: true; valeur: T } | { ok: false; raison: "introuvable" | "refuse" | "hors-contrat" | "injoignable" };

const entetes = (jeton: string) => ({ authorization: `Bearer ${jeton}` });

/** Statut Drive → raison honnête : 401/403 = le droit manque ou a été retiré, 404 = absent. */
function raisonDuStatut(statut: number): "introuvable" | "refuse" | "injoignable" {
  if (statut === 401 || statut === 403) return "refuse";
  if (statut === 404) return "introuvable";
  return "injoignable";
}

/** Les bilans du dossier, les plus récents d'abord (`classerBilans`). */
export async function listerBilans(jeton: string, dossier: string): Promise<Lecture<Bilan[]>> {
  if (!idDriveValide(dossier)) return { ok: false, raison: "hors-contrat" };
  const url = new URL(API);
  url.searchParams.set("q", `'${dossier}' in parents and trashed = false and name contains 'bilan-'`);
  url.searchParams.set("fields", "files(id,name,mimeType)");
  url.searchParams.set("orderBy", "name desc");
  url.searchParams.set("pageSize", "200");
  try {
    const res = await fetch(url, { headers: entetes(jeton), signal: AbortSignal.timeout(DELAI_MS), cache: "no-store" });
    if (!res.ok) return { ok: false, raison: raisonDuStatut(res.status) };
    const fichiers = fichiersDeListeDrive(await res.json());
    if (!fichiers) return { ok: false, raison: "hors-contrat" };
    return { ok: true, valeur: classerBilans(fichiers) };
  } catch (erreur) {
    console.error("[bilans] liste Drive impossible", erreur);
    return { ok: false, raison: "injoignable" };
  }
}

/** Le HTML d'UN bilan du dossier. */
export async function lireBilan(jeton: string, dossier: string, id: string): Promise<Lecture<{ bilan: Bilan; html: string }>> {
  if (!idDriveValide(dossier) || !idDriveValide(id)) return { ok: false, raison: "hors-contrat" };
  try {
    const meta = new URL(`${API}/${id}`);
    meta.searchParams.set("fields", "id,name,mimeType,parents,trashed,size");
    const r1 = await fetch(meta, { headers: entetes(jeton), signal: AbortSignal.timeout(DELAI_MS), cache: "no-store" });
    if (!r1.ok) return { ok: false, raison: raisonDuStatut(r1.status) };
    const m = (await r1.json()) as { parents?: unknown; trashed?: unknown; size?: unknown } & Record<string, unknown>;
    const bilan = bilanDepuisFichier(m);
    const dansLeDossier = Array.isArray(m.parents) && m.parents.includes(dossier);
    // Un fichier hors dossier, en corbeille ou hors convention n'existe pas pour le hub.
    if (!bilan || !dansLeDossier || m.trashed === true) return { ok: false, raison: "introuvable" };
    if (Number(m.size ?? 0) > TAILLE_MAX_BILAN) return { ok: false, raison: "hors-contrat" };

    const r2 = await fetch(`${API}/${id}?alt=media`, { headers: entetes(jeton), signal: AbortSignal.timeout(DELAI_MS), cache: "no-store" });
    if (!r2.ok) return { ok: false, raison: raisonDuStatut(r2.status) };
    const html = await r2.text();
    if (html.length > TAILLE_MAX_BILAN) return { ok: false, raison: "hors-contrat" };
    return { ok: true, valeur: { bilan, html } };
  } catch (erreur) {
    console.error("[bilans] lecture Drive impossible", erreur);
    return { ok: false, raison: "injoignable" };
  }
}
