// Le fichier .env.example doit rester en phase avec lib/sources.ts.
//
// ── POURQUOI CE TEST EXISTE ─────────────────────────────────────────────────────────
//
// CarAI a été ajoutée au hub le 13/08/2026 (PR #19). Son entrée dans `lib/sources.ts`
// déclare `HUB_TOKEN_CARAI` — mais `.env.example` n'a jamais été mis à jour. Résultat :
// quiconque configure le hub à partir de ce fichier pose quatre jetons sur cinq, et le
// widget CarAI affiche « non configurée » pour toujours, sans indice de la variable
// manquante. La panne est honnête mais le diagnostic est introuvable.
//
// C'est exactement le genre d'écart qu'un humain ne remarque pas : le code marche, la CI
// est verte, et seul le fichier d'exemple ment. Ce test le rend impossible.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SOURCE_DEFS } from "../lib/sources";

const exemple = readFileSync(
  fileURLToPath(new URL("../.env.example", import.meta.url)),
  "utf8",
);

describe(".env.example couvre toutes les sources déclarées", () => {
  it("documente le jeton de chaque app", () => {
    const manquants = SOURCE_DEFS.filter((d) => !exemple.includes(d.tokenEnv)).map(
      (d) => d.tokenEnv,
    );
    expect(manquants).toEqual([]);
  });

  it("documente l'override d'URL de chaque app", () => {
    // Ces variables sont optionnelles à l'usage, mais leur ABSENCE du fichier d'exemple
    // fait perdre du temps le jour où une app déménage : on cherche le nom exact dans le
    // code au lieu de le lire ici.
    const manquants = SOURCE_DEFS.filter((d) => !exemple.includes(d.urlEnv)).map(
      (d) => d.urlEnv,
    );
    expect(manquants).toEqual([]);
  });

  it("documente les variables d'authentification", () => {
    // Sans AUTH_SECRET ni AUTHORIZED_EMAIL, le hub n'est pas privé — c'est le seul
    // oubli de ce fichier qui aurait une conséquence de sécurité, pas d'affichage.
    for (const cle of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "AUTH_SECRET",
      "AUTHORIZED_EMAIL",
      "AUTH_COOKIE_DOMAIN",
    ]) {
      expect(exemple).toContain(cle);
    }
  });

  it("ne contient aucune valeur — que des clés vides ou commentées", () => {
    // Un .env.example avec une vraie valeur est une fuite de secret dans le dépôt.
    // Les lignes commentées portent des exemples d'URL, elles sont légitimes.
    const avecValeur = exemple
      .split("\n")
      .filter((l) => /^[A-Z_]+=.+/.test(l.trim()))
      .map((l) => l.split("=")[0]);
    expect(avecValeur).toEqual([]);
  });
});
