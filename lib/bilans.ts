// lib/bilans.ts — les bilans (du jour, de la semaine) que le hub lit dans Drive. PUR : aucune I/O.
//
// La routine du Brief écrit chaque bilan dans UN dossier Drive (Marc, 28/10/2026 : « garder tout l'historique
// dans Drive »). Le hub le lit avec le droit de lecture de la connexion (`lib/jetonsGoogle.ts`) et ne le copie
// JAMAIS dans le dépôt (public) ni dans sa base. Noms reconnus, aucun autre n'est deviné :
//   bilan-jour-AAAA-MM-JJ.html       le Brief du jour
//   bilan-semaine-AAAA-MM-JJ.html    le rapport de la semaine, daté du dimanche
// Le contenu est une DONNÉE : cadre isolé (`CSP_BILAN`), jamais la page du hub.

export type GenreBilan = "jour" | "semaine";

export interface Bilan {
  /** Identifiant du fichier Drive. */
  id: string;
  genre: GenreBilan;
  /** Date du bilan, AAAA-MM-JJ (celle du nom de fichier, jamais l'heure de dépôt). */
  date: string;
  nom: string;
}

/** Combien de bilans le hub propose à relire (tout l'historique reste dans Drive). */
export const GARDES: Record<GenreBilan, number> = { jour: 60, semaine: 12 };

/** Taille maximale d'un bilan lu : au-delà, refusé plutôt que tronqué. */
/** Le dossier Drive « Bilans » (privé, propriétaire seul : l'identifiant ne donne aucun accès). `BILANS_DRIVE_FOLDER_ID` le remplace. */
export const DOSSIER_BILANS = "1H_vE3KAmPtGcEIcrYI0KuykTl8-4ylRl";

export const TAILLE_MAX_BILAN = 2 * 1024 * 1024;

const NOM_BILAN = /^bilan-(jour|semaine)-(\d{4})-(\d{2})-(\d{2})\.html$/;
const ID_DRIVE = /^[A-Za-z0-9_-]{10,100}$/;
const TYPES_ACCEPTES = new Set(["text/html", "text/plain"]);

/** Un identifiant Drive plausible : il part dans une URL et dans une requête, jamais autre chose. */
export function idDriveValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && ID_DRIVE.test(valeur);
}

/** Vrai pour une date qui existe au calendrier (le 31 avril n'en est pas une). */
function dateReelle(a: number, m: number, j: number): boolean {
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/** Un fichier Drive devient un bilan, ou `null` (nom hors convention, type inattendu, date impossible). */
export function bilanDepuisFichier(fichier: unknown): Bilan | null {
  if (typeof fichier !== "object" || fichier === null) return null;
  const { id, name, mimeType } = fichier as Record<string, unknown>;
  if (!idDriveValide(id) || typeof name !== "string" || typeof mimeType !== "string") return null;
  if (!TYPES_ACCEPTES.has(mimeType)) return null;
  const m = NOM_BILAN.exec(name);
  if (!m) return null;
  const [, genre, a, mois, j] = m;
  if (!dateReelle(Number(a), Number(mois), Number(j))) return null;
  return { id, genre: genre as GenreBilan, date: `${a}-${mois}-${j}`, nom: name };
}

/**
 * Les bilans à proposer : les plus récents d'abord, par genre, bornés par `GARDES`. Deux fichiers de
 * même genre et même date (un dépôt refait) : le premier rencontré reste, l'autre est ignoré.
 */
export function classerBilans(fichiers: readonly unknown[]): Bilan[] {
  const vus = new Set<string>();
  const bilans: Bilan[] = [];
  for (const f of fichiers) {
    const b = bilanDepuisFichier(f);
    if (!b) continue;
    const cle = `${b.genre}:${b.date}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    bilans.push(b);
  }
  bilans.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const compte: Record<GenreBilan, number> = { jour: 0, semaine: 0 };
  return bilans.filter((b) => ++compte[b.genre] <= GARDES[b.genre]);
}

/** Le contenu d'une liste Drive (`files.list`), ou `null` si la forme n'est pas celle attendue (jamais réparée). */
export function fichiersDeListeDrive(json: unknown): unknown[] | null {
  if (typeof json !== "object" || json === null) return null;
  const { files } = json as { files?: unknown };
  return Array.isArray(files) ? files : null;
}

/** L'attribut `sandbox` du `<iframe>` d'un bilan : origine opaque (ni cookie du hub, ni son stockage). */
export const SANDBOX_BILAN = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

/**
 * La CSP de `GET /api/bilans/<id>`. Elle REMPLACE celle du hub sur cette route (`next.config.mjs`), comme
 * pour le cadre du Chantier. Aucun réseau (`connect-src 'none'`) : un bilan ne peut rien envoyer ailleurs.
 */
export const CSP_BILAN = [
  `sandbox ${SANDBOX_BILAN}`,
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
].join("; ");
