#!/usr/bin/env node
// scripts/generer-cle-session.mjs — génère la paire ES256 de la session partagée.
//
// À lancer par MARC, en local, une fois (et à chaque rotation). Procédure complète :
// docs/SECURITE.md, section « Clé de signature de la session ».
//
// Usage :
//   npm run cle-session
//   npm run cle-session -- --garder '<JWKS actuel>'   (rotation : les deux clés publiques)
//   npm run cle-session -- --sortie <fichier>          (défaut : dossier temporaire du système)
//
// Ce que le script AFFICHE : le `kid` et le JWKS PUBLIC (une ligne). Ce qu'il n'affiche
// JAMAIS : la clé privée, écrite dans un fichier hors dépôt (création exclusive, mode 0600).

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { principal } from "./cleSession.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

// Lancé directement (et non importé par un test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = principal(process.argv.slice(2), {
    racine: RACINE,
    dossierTemporaire: tmpdir(),
    suffixe: () => randomBytes(4).toString("hex"),
    ecrire: writeFileSync,
    log: (texte) => console.log(texte),
  });
}
