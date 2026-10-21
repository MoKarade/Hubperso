// lib/grapheDonnees.ts — lire les nœuds et les liens d'un `graph.html` pour la vue 3D.
//
// Le `graph.html` d'un dépôt embarque son graphe en trois littéraux JavaScript, un par ligne :
// `const RAW_NODES = [...]`, `const RAW_EDGES = [...]`, `const LEGEND = [...]`. La vue 3D du hub
// n'exécute JAMAIS ce script : elle lit ces tableaux comme du JSON et ne garde que le strict
// nécessaire, en chaînes bornées. Les couleurs viennent du hub, jamais du dépôt (contenu non fiable).
//
// Un format inattendu est un état honnête (`ok: false`, avec la cause), jamais un graphe présumé :
// la route retombe alors sur la vue 2D d'origine en le disant.

export const MAX_NOEUDS = 5000;
export const MAX_LIENS = 20_000;
const MAX_TEXTE = 200;
/** Dossier des fichiers sans répertoire (à la racine du dépôt). */
export const DOSSIER_RACINE = "(racine)";

interface NoeudGraphe {
  nom: string;
  /** Chemin du fichier source, tel que publié par l'outil. */
  fichier: string;
  /** Premier segment du chemin : sert à colorer. */
  dossier: string;
  type: "code" | "document" | "concept" | "autre";
  /** Nombre de liens du nœud (publié par l'outil, recalculé si absent). */
  degre: number;
  /** Taille relative publiée par l'outil (10 à 40 en pratique). */
  taille: number;
}

interface LienGraphe {
  /** Indices dans `noeuds`. */
  de: number;
  vers: number;
  relation: string;
  /** Extrait du code (true) ou déduit (false). */
  sur: boolean;
}

interface DonneesGraphe {
  noeuds: NoeudGraphe[];
  liens: LienGraphe[];
  /** Liens écartés parce qu'une extrémité n'existe pas. */
  liensIgnores: number;
}

export type ResultatDonnees = { ok: true; donnees: DonneesGraphe } | { ok: false; detail: string };

function tableau(html: string, nom: string): unknown[] | string {
  const m = new RegExp(`^const ${nom} = (\\[.*\\]);[ \\t]*\\r?$`, "m").exec(html);
  if (!m) return `${nom} introuvable dans graph.html`;
  try {
    const v: unknown = JSON.parse(m[1]!);
    return Array.isArray(v) ? v : `${nom} n'est pas un tableau`;
  } catch {
    return `${nom} illisible (JSON invalide)`;
  }
}

function chaine(v: unknown, repli = ""): string {
  return typeof v === "string" ? v.slice(0, MAX_TEXTE) : repli;
}

function nombre(v: unknown, repli: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : repli;
}

export function dossierDe(fichier: string): string {
  const propre = fichier.replace(/\\/g, "/").replace(/^\.?\/+/, "");
  const i = propre.indexOf("/");
  return i > 0 ? propre.slice(0, i) : DOSSIER_RACINE;
}

function typeDe(v: unknown): NoeudGraphe["type"] {
  return v === "code" || v === "document" || v === "concept" ? v : "autre";
}

export function extraireDonnees(html: string): ResultatDonnees {
  const bruts = tableau(html, "RAW_NODES");
  if (typeof bruts === "string") return { ok: false, detail: bruts };
  const aretes = tableau(html, "RAW_EDGES");
  if (typeof aretes === "string") return { ok: false, detail: aretes };
  if (bruts.length === 0) return { ok: false, detail: "le graphe est vide" };
  if (bruts.length > MAX_NOEUDS || aretes.length > MAX_LIENS) {
    return {
      ok: false,
      detail: `graphe trop gros pour la 3D (${bruts.length} nœuds, ${aretes.length} liens ; limite ${MAX_NOEUDS} et ${MAX_LIENS})`,
    };
  }

  const indice = new Map<string, number>();
  const noeuds: NoeudGraphe[] = [];
  for (const b of bruts) {
    const o = (b ?? {}) as Record<string, unknown>;
    const id = chaine(o.id);
    if (!id || indice.has(id)) continue;
    const fichier = chaine(o.source_file);
    indice.set(id, noeuds.length);
    noeuds.push({
      nom: chaine(o.label, id),
      fichier,
      dossier: fichier ? dossierDe(fichier) : DOSSIER_RACINE,
      type: typeDe(o.file_type),
      degre: Math.max(0, Math.round(nombre(o.degree, 0))),
      taille: Math.min(40, Math.max(10, nombre(o.size, 10))),
    });
  }
  if (noeuds.length === 0) return { ok: false, detail: "aucun nœud lisible dans RAW_NODES" };

  const liens: LienGraphe[] = [];
  let liensIgnores = 0;
  for (const a of aretes) {
    const o = (a ?? {}) as Record<string, unknown>;
    const de = indice.get(chaine(o.from));
    const vers = indice.get(chaine(o.to));
    if (de === undefined || vers === undefined || de === vers) {
      liensIgnores += 1;
      continue;
    }
    liens.push({ de, vers, relation: chaine(o.label), sur: o.confidence === "EXTRACTED" });
  }

  // Le degré publié peut manquer : on le recalcule plutôt que d'afficher « 0 lien » à tort.
  if (noeuds.every((n) => n.degre === 0)) {
    for (const l of liens) {
      noeuds[l.de]!.degre += 1;
      noeuds[l.vers]!.degre += 1;
    }
  }
  return { ok: true, donnees: { noeuds, liens, liensIgnores } };
}
