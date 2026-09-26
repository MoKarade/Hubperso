// scripts/gardeChemins.mjs — GARDE TECHNIQUE : quels fichiers ne s'auto-fusionnent jamais ?
// Fonctions PURES, sans I/O.
//
// Source : `atelier/modeles/auto-merge/` (chemins-interdits.json + normaliser/correspond),
// portée ici sans les chemins propres à l'Atelier (cockpit/*). Si la liste change là-bas,
// la reporter ici dans la même PR : le test « anti-vacuité » verrouille les indispensables.
//
// POURQUOI : `auto-merge.yml` fusionne dès que les checks sont verts. Une PR qui modifie un
// workflow, un hook, un réglage de Claude ou la garde de commit pourrait s'ouvrir la porte
// elle-même. Ces chemins-là passent TOUJOURS par Marc, même CI verte.
//
// Défaut = refuser : liste absente, vide, tronquée, chemin douteux → pas de fusion.

/** Jamais auto-fusionnés (glob : `**` traverse les dossiers, `*` et `?` non). */
export const CHEMINS_INTERDITS = Object.freeze([
  "scripts/hooks/**",
  "hooks/**",
  "**/hooks/**",
  ".github/**",
  "**/settings*",
  "**/settings*/**",
  "**/commit-gate*",
  "**/commit-gate*/**",
  "passerelle/tunnel.yml",
  ".claude/**",
  ".husky/**",
  "CODEOWNERS",
  "**/CODEOWNERS",
  "modeles/**",
  "auto-merge.json",
  "**/auto-merge.json",
  "chemins-interdits.json",
  "**/chemins-interdits.json",
  ".gitattributes",
  // Ce qui DÉCIDE de la fusion : une PR ne doit pas réécrire ses propres règles.
  "scripts/autoMerge.mjs",
  "scripts/autoMerge.d.mts",
  "scripts/gardeChemins.mjs",
  "scripts/gardeChemins.d.mts",
]);

/** L'API GitHub plafonne `pulls/{n}/files` à 3000 fichiers : à ce seuil, la liste est peut-être tronquée. */
const FICHIERS_MAX = 3000;

/** Chemin normalisé pour la comparaison, ou null s'il est douteux (absolu, « .. », vide, octet de contrôle). */
export function normaliser(chemin) {
  if (typeof chemin !== "string") return null;
  // eslint-disable-next-line no-control-regex
  if (chemin === "" || /[\u0000-\u001f\u007f]/.test(chemin)) return null;
  let c = chemin.replace(/\\/g, "/");
  while (c.startsWith("./")) c = c.slice(2);
  if (c === "" || c.startsWith("/") || /^[A-Za-z]:/.test(c)) return null;
  const segments = c.split("/");
  if (segments.some((s) => s === ".." || s === "")) return null;
  // Sans casse : `.GitHub` == `.github` sur Windows et macOS.
  return segments.filter((s) => s !== ".").join("/").toLowerCase();
}

function versRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

const EXPRESSIONS = CHEMINS_INTERDITS.map(versRegex);

/** Chemins touchés : chaînes ou {filename|path, previous_filename} (un renommage touche l'ancien ET le nouveau). null si douteux. */
function chemins(fichiers) {
  const out = [];
  for (const f of fichiers) {
    const liste =
      typeof f === "string"
        ? [f]
        : f && typeof f === "object"
          ? [f.filename ?? f.path, f.previous_filename].filter((x) => x !== undefined && x !== null)
          : [null];
    if (liste.length === 0) return null;
    for (const p of liste) {
      const n = normaliser(p);
      if (n === null) return null;
      out.push(n);
    }
  }
  return out;
}

const court = (t) => String(t).replace(/[\u0000-\u001f\u007f`]+/g, " ").slice(0, 120);

/**
 * @param {unknown} fichiers  liste de `gh api repos/.../pulls/N/files` (ou de simples chemins)
 * @returns {{ok: boolean, raison: string}}
 */
export function examinerChemins(fichiers) {
  if (!Array.isArray(fichiers)) return { ok: false, raison: "liste des fichiers illisible" };
  if (fichiers.length === 0) return { ok: false, raison: "aucun fichier modifié" };
  if (fichiers.length >= FICHIERS_MAX) return { ok: false, raison: "liste des fichiers peut-être tronquée" };
  const touches = chemins(fichiers);
  if (touches === null) return { ok: false, raison: "chemin de fichier douteux" };
  const fautif = touches.find((c) => EXPRESSIONS.some((re) => re.test(c)));
  if (fautif) {
    return {
      ok: false,
      raison: `fichier sensible ${court(fautif)} : jamais auto-fusionné, validation de Marc requise`,
    };
  }
  return { ok: true, raison: "aucun chemin sensible" };
}
