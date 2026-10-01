#!/usr/bin/env node
// Garde de correction automatique (P6, étage a). Script INDÉPENDANT : Node 20, aucune
// dépendance, aucun jeton, aucun appel réseau. Elle juge un DIFF produit en local AVANT tout
// push : le step suivant ne pousse que si le code de sortie est 0.
//
//   node scripts/claude-garde.mjs --diff correctif.diff      → juge un fichier de diff
//   node scripts/claude-garde.mjs --base origin/main         → juge `git diff <base>` du dossier courant
//   option : --codeowners <fichier>  → ajoute les chemins d'un CODEOWNERS aux chemins protégés
//
// Sortie : 0 = accepté, 1 = refusé (raisons lisibles : des CHEMINS et des nombres, jamais le
// contenu du diff). ÉCHEC FERMÉ sur tout doute : diff vide, illisible, énorme, binaire, ligne
// d'en-tête inconnue, chemin étrange.
//
// Refuse : un chemin de scripts/chemins-sensibles.json (.github, hooks, secrets, package.json,
// configs d'outils, scripts…), un fichier exécutable (mode 100755) ou invoqué ailleurs, un
// lien symbolique ou sous-module, plus de 120 lignes de diff, un fichier de test supprimé, un
// renommage depuis ou vers un chemin interdit, un chemin avec `..`, antislash ou absolu.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const SENSIBLES = JSON.parse(readFileSync(join(ICI, "chemins-sensibles.json"), "utf8"));
const IDENTITE_AGENT = "atelier-agents";

const ENTETES_CONNUS = [
  "index ",
  "--- ",
  "+++ ",
  "new file mode ",
  "deleted file mode ",
  "old mode ",
  "new mode ",
  "similarity index ",
  "dissimilarity index ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
];

/** Anti-boucle : le dernier commit de la branche est-il déjà de l'agent ? Inconnu = oui (échec fermé). */
export function dejaCorrige(auteurDernierCommit, identite = IDENTITE_AGENT) {
  if (typeof auteurDernierCommit !== "string" || auteurDernierCommit.trim() === "") return true;
  const a = auteurDernierCommit.trim().toLowerCase();
  const id = identite.toLowerCase();
  return a === id || a === `${id}[bot]` || a.startsWith(`${id}[bot] `) || a.startsWith(`${id} `);
}

/** Transforme un CODEOWNERS en préfixes/exacts (motifs simples seulement ; le reste est ignoré). */
export function motifsCodeowners(texte) {
  const prefixes = [];
  const exacts = [];
  for (const brut of String(texte).split(/\r?\n/)) {
    const ligne = brut.trim();
    if (!ligne || ligne.startsWith("#")) continue;
    const motif = ligne.split(/\s+/)[0] ?? "";
    if (motif === "*") return { toutLeDepot: true, prefixes, exacts };
    if (/[*?[\]]/.test(motif)) continue;
    const sans = motif.replace(/^\//, "");
    if (sans.endsWith("/")) prefixes.push(sans);
    else exacts.push(sans);
  }
  return { toutLeDepot: false, prefixes, exacts };
}

/** Chemin acceptable ? Rend la raison du refus, ou null. */
function cheminInvalide(chemin) {
  if (!chemin) return "chemin vide";
  if (chemin.startsWith('"')) return "chemin cité par git (caractères spéciaux)";
  if (/[\\\0]/.test(chemin)) return "chemin avec antislash ou octet nul";
  if (chemin.startsWith("/") || /^[A-Za-z]:/.test(chemin)) return "chemin absolu";
  if (chemin.split("/").some((s) => s === ".." || s === "." || s === "")) return "chemin avec segment .. ou vide";
  return null;
}

function sensible(chemin, sens, extra) {
  const bas = chemin.toLowerCase();
  const nom = chemin.split("/").pop() ?? chemin;
  const prefixes = [...sens.prefixes, ...(extra?.prefixes ?? [])];
  const exacts = [...sens.exacts, ...(extra?.exacts ?? [])];
  if (extra?.toutLeDepot) return "CODEOWNERS protège tout le dépôt";
  if (prefixes.some((p) => bas.startsWith(p.toLowerCase()))) return "chemin protégé";
  if (exacts.some((e) => bas === e.toLowerCase())) return "chemin protégé";
  if (sens.noms.some((n) => nom.toLowerCase() === n.toLowerCase())) return "fichier protégé";
  if (sens.motifs.some((m) => new RegExp(m, "i").test(chemin))) return "secret, exécutable ou configuration d'outil";
  return null;
}

const estTest = (c) => /(^|\/)tests?\//i.test(c) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(c);

/** Découpe un diff git en fichiers ; rend { fichiers, lignes, erreurs }. */
function analyser(texte) {
  const erreurs = [];
  const fichiers = [];
  let cur = null;
  let lignes = 0;
  let dansHunk = false;
  for (const l of texte.split("\n")) {
    if (l.startsWith("diff --git ")) {
      dansHunk = false;
      const reste = l.slice("diff --git a/".length);
      const n = (reste.length - 3) / 2;
      const x = reste.slice(0, n);
      cur = { de: x, vers: x, nouveau: false, supprime: false, modes: [], ok: true };
      if (!l.startsWith("diff --git a/") || !Number.isInteger(n) || reste.slice(n, n + 3) !== " b/" || reste.slice(n + 3) !== x) {
        cur.ok = false; // renommage ou nom ambigu : sera précisé par rename from/to
        cur.brut = l;
      }
      fichiers.push(cur);
      continue;
    }
    if (!cur) {
      if (l.trim() !== "") erreurs.push("contenu avant le premier en-tête de fichier");
      continue;
    }
    if (dansHunk) {
      if (l.startsWith("@@")) continue;
      if (l.startsWith("+") || l.startsWith("-")) lignes++;
      else if (!(l === "" || l.startsWith(" ") || l.startsWith("\\"))) erreurs.push("ligne inattendue dans un bloc de diff");
      continue;
    }
    if (l.startsWith("@@")) {
      dansHunk = true;
      continue;
    }
    if (l === "") continue;
    if (l.startsWith("Binary files ") || l.startsWith("GIT binary patch")) {
      erreurs.push("diff binaire");
      continue;
    }
    if (!ENTETES_CONNUS.some((p) => l.startsWith(p))) {
      erreurs.push("en-tête de diff inconnu");
      continue;
    }
    if (l.startsWith("rename from ")) { cur.de = l.slice(12); cur.rename = true; cur.ok = true; }
    else if (l.startsWith("rename to ")) { cur.vers = l.slice(10); cur.rename = true; cur.ok = true; }
    else if (l.startsWith("copy from ")) { cur.de = l.slice(10); cur.copie = true; cur.ok = true; }
    else if (l.startsWith("copy to ")) { cur.vers = l.slice(8); cur.copie = true; cur.ok = true; }
    else if (l.startsWith("new file mode ")) { cur.nouveau = true; cur.modes.push(l.split(" ").pop()); }
    else if (l.startsWith("deleted file mode ")) { cur.supprime = true; cur.modes.push(l.split(" ").pop()); }
    else if (l.startsWith("old mode ") || l.startsWith("new mode ")) cur.modes.push(l.split(" ").pop());
    else if (l.startsWith("index ")) { const m = l.split(" ")[2]; if (m) cur.modes.push(m); }
  }
  return { fichiers, lignes, erreurs };
}

/**
 * Juge un diff. options : { sensibles?, codeowners? (texte) }.
 * Rend { ok, raisons[], lignes, fichiers[] }.
 */
export function juger(diff, options = {}) {
  const sens = options.sensibles ?? SENSIBLES;
  const extra = options.codeowners ? motifsCodeowners(options.codeowners) : undefined;
  const raisons = [];
  if (typeof diff !== "string" || diff.trim() === "") return { ok: false, raisons: ["diff vide ou illisible"], lignes: 0, fichiers: [] };
  if (Buffer.byteLength(diff) > sens.tailleMaxOctets) return { ok: false, raisons: ["diff énorme"], lignes: 0, fichiers: [] };
  if (diff.includes("\0")) return { ok: false, raisons: ["diff binaire (octet nul)"], lignes: 0, fichiers: [] };

  const { fichiers, lignes, erreurs } = analyser(diff);
  if (fichiers.length === 0) raisons.push("aucun fichier reconnu dans le diff");
  for (const e of new Set(erreurs)) raisons.push(e);
  if (lignes > sens.limiteLignes) raisons.push(`${lignes} lignes modifiées (maximum ${sens.limiteLignes})`);

  const vus = [];
  for (const f of fichiers) {
    if (!f.ok) {
      raisons.push("nom de fichier ambigu (renommage sans détail)");
      continue;
    }
    const chemins = f.de === f.vers ? [f.vers] : [f.de, f.vers];
    vus.push(f.vers);
    for (const c of chemins) {
      const inval = cheminInvalide(c);
      if (inval) {
        raisons.push(`${inval} : ${c.slice(0, 80)}`);
        continue;
      }
      const s = sensible(c, sens, extra);
      if (s) raisons.push(`${s} : ${c}`);
    }
    if (f.modes.some((m) => m === "100755" || m === "100775")) raisons.push(`fichier exécutable : ${f.vers}`);
    if (f.modes.some((m) => m === "120000")) raisons.push(`lien symbolique : ${f.vers}`);
    if (f.modes.some((m) => m === "160000")) raisons.push(`sous-module : ${f.vers}`);
    if (f.supprime && estTest(f.de)) raisons.push(`fichier de test supprimé : ${f.de}`);
    if (f.rename && estTest(f.de) && !estTest(f.vers)) raisons.push(`fichier de test sorti des tests : ${f.de}`);
  }
  return { ok: raisons.length === 0, raisons, lignes, fichiers: vus };
}

function lireArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--diff") out.diff = argv[++i];
    else if (argv[i] === "--base") out.base = argv[++i];
    else if (argv[i] === "--codeowners") out.codeowners = argv[++i];
    else throw new Error(`option inconnue : ${argv[i]}`);
  }
  if (!out.diff === !out.base) throw new Error("exactement une option parmi --diff et --base");
  return out;
}

function principal(argv) {
  let texte;
  let codeowners;
  try {
    const o = lireArgs(argv);
    if (o.codeowners) codeowners = readFileSync(o.codeowners, "utf8");
    texte = o.diff
      ? readFileSync(o.diff, "utf8")
      : execFileSync("git", ["diff", "--no-color", "--no-ext-diff", "-M", o.base], {
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
  } catch (err) {
    console.error(`Garde : REFUSÉ (échec fermé) : ${err.message.split("\n")[0].slice(0, 200)}`);
    return 1;
  }
  const v = juger(texte, { codeowners });
  if (v.ok) {
    console.log(`Garde : ACCEPTÉ (${v.fichiers.length} fichier(s), ${v.lignes} ligne(s)).`);
    return 0;
  }
  console.error("Garde : REFUSÉ");
  for (const r of v.raisons) console.error(`  - ${r}`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = principal(process.argv.slice(2));
}
