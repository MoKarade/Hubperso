#!/usr/bin/env node
// scripts/doc-a-jour.mjs — le transport : lit git, appelle le juge, rend un verdict.
//
// Toute la DÉCISION est dans `docAJour.mjs`, pur et testé. Ici il n'y a que des I/O — c'est
// la même séparation que partout ailleurs dans le parc, et c'est ce qui permet de tester le
// contrôle sans monter une CI.
//
// Usage : node scripts/doc-a-jour.mjs <base> <head>
// Sortie : 0 si rien de bloquant, 1 sinon. Les avertissements ne changent jamais le code.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { idsDesCommits, idsDuBacklog, suggestion, verifier } from "./docAJour.mjs";

const [, , base = "origin/main", head = "HEAD"] = process.argv;

function git(args, defaut = "") {
  try {
    return execFileSync("git", args, { encoding: "utf8" });
  } catch {
    // Un git qui échoue ne doit pas faire échouer la PR : on ne SAIT pas, donc on ne
    // reproche rien. Le contrôle ne bloque que sur ce qu'il a pu établir.
    return defaut;
  }
}

const plage = `${base}..${head}`;
const sujets = git(["log", "--format=%s", plage]).split("\n").filter(Boolean);
const fichiers = git(["diff", "--name-only", base, head]).split("\n").filter(Boolean);

const CHEMIN_BACKLOG = existsSync("BACKLOG.md") ? "BACKLOG.md" : "docs/BACKLOG.md";
const contenuBacklog = existsSync(CHEMIN_BACKLOG) ? readFileSync(CHEMIN_BACKLOG, "utf8") : "";
const diffBacklog = git(["diff", base, head, "--", CHEMIN_BACKLOG]);

// Un document n'est surveillé que s'il EXISTE dans ce dépôt : reprocher l'absence d'un
// CHANGELOG à un dépôt qui n'en a jamais eu serait du bruit dès le premier jour.
const documents = Object.fromEntries(
  ["HANDOVER.md", "CHANGELOG.md", "README.md"].map((n) => [n, existsSync(n)]),
);

const { bloquants, avertissements } = verifier({
  sujets,
  fichiers,
  contenuBacklog,
  diffBacklog,
  documents,
});

const lignes = [];
if (bloquants.length === 0 && avertissements.length === 0) {
  lignes.push("✅ La doc suit le code.");
} else {
  for (const b of bloquants) lignes.push(`❌ ${b}`);
  for (const a of avertissements) lignes.push(`⚠️ ${a}`);
}

const patch = suggestion(idsDesCommits(sujets), idsDuBacklog(contenuBacklog));
if (patch) {
  lignes.push("", `Entrée(s) à ajouter dans \`${CHEMIN_BACKLOG}\` :`, "", "```markdown", patch, "```");
}

const rapport = lignes.join("\n");
console.log(rapport);

// Le même texte dans le résumé de l'exécution : un échec de CI dont il faut ouvrir les
// journaux pour comprendre la raison est un échec qu'on finit par relancer au hasard.
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Doc à jour\n\n${rapport}\n`);
}

process.exit(bloquants.length > 0 ? 1 : 0);
