#!/usr/bin/env node
// Test de fumée de production (P5, étage a) : GET des URL listées dans scripts/fumee.json.
// Node 20, aucune dépendance. Code de sortie 0 = tout va bien, 1 = au moins une panne.
//
//   node scripts/fumee.mjs                         → vise la base de fumee.json
//   node scripts/fumee.mjs --url-base https://…    → vise une URL de déploiement
//
// Règles : délai 10 s, 2 essais espacés de 10 s, 3 redirections au plus, corps lu borné
// à 64 Ko. Un 200 de /api/sante dont le JSON porte `ok:false` = PANNE. Jamais d'en-tête ni
// de cookie dans la sortie.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DELAI_MS = 10_000;
export const ESSAIS = 2;
export const PAUSE_MS = 10_000;
export const REDIRECTIONS_MAX = 3;
export const CORPS_MAX = 64 * 1024;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lit au plus `max` octets du corps puis abandonne le reste. */
async function lireBorne(res, max) {
  if (!res.body) return { texte: "", tronque: false };
  const lecteur = res.body.getReader();
  const morceaux = [];
  let total = 0;
  let tronque = false;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      tronque = true;
      await lecteur.cancel();
      break;
    }
    morceaux.push(value);
  }
  return { texte: Buffer.concat(morceaux).toString("utf8"), tronque };
}

/** Une tentative : suit les redirections à la main (bornées). Rend { ok, detail }. */
async function tenter(url, { fetchImpl, delaiMs }) {
  let courante = url;
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    let res;
    try {
      res = await fetchImpl(courante, {
        redirect: "manual",
        signal: AbortSignal.timeout(delaiMs),
        headers: { "user-agent": "hubperso-fumee" },
      });
    } catch (err) {
      const delai = err && (err.name === "TimeoutError" || err.name === "AbortError");
      return { ok: false, detail: delai ? "délai dépassé" : "injoignable" };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) return { ok: false, detail: `HTTP ${res.status} sans destination` };
      courante = new URL(loc, courante).toString();
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      return { ok: false, detail: `HTTP ${res.status}` };
    }
    let lu;
    try {
      lu = await lireBorne(res, CORPS_MAX);
    } catch (err) {
      const delai = err && (err.name === "TimeoutError" || err.name === "AbortError");
      return { ok: false, detail: delai ? "délai dépassé (corps)" : "corps illisible" };
    }
    if (lu.tronque) return { ok: false, detail: "corps trop gros (> 64 Ko)" };
    if (new URL(courante).pathname === "/api/sante") {
      try {
        const json = JSON.parse(lu.texte);
        if (json?.ok !== true) {
          const cause = typeof json?.cause === "string" ? json.cause.slice(0, 40) : "inconnue";
          return { ok: false, detail: `PANNE : ok:false (cause ${cause})` };
        }
      } catch {
        return { ok: false, detail: "PANNE : réponse non JSON" };
      }
    }
    return { ok: true, detail: "HTTP 200" };
  }
  return { ok: false, detail: `plus de ${REDIRECTIONS_MAX} redirections` };
}

/** Sonde une URL avec ESSAIS tentatives. */
export async function sonder(url, opts = {}) {
  const { fetchImpl = fetch, delaiMs = DELAI_MS, pauseMs = PAUSE_MS } = opts;
  let dernier = { ok: false, detail: "aucun essai" };
  for (let i = 1; i <= ESSAIS; i++) {
    dernier = await tenter(url, { fetchImpl, delaiMs });
    if (dernier.ok) return { url, ...dernier, essais: i };
    if (i < ESSAIS) await dormir(pauseMs);
  }
  return { url, ...dernier, essais: ESSAIS };
}

/** Construit les URL à sonder ; refuse tout chemin absent de la liste. */
export function construireUrls(config, { urlBase, chemins } = {}) {
  const base = new URL(urlBase ?? config.base);
  if (base.protocol !== "https:" && base.hostname !== "127.0.0.1") {
    throw new Error("url-base : https obligatoire");
  }
  const liste = chemins ?? config.urls;
  for (const c of liste) {
    if (!config.urls.includes(c)) throw new Error(`URL hors liste refusée : ${c}`);
  }
  return liste.map((c) => new URL(c, base).toString());
}

export async function executer(config, options = {}) {
  const urls = construireUrls(config, options);
  const sortie = options.sortie ?? ((l) => console.log(l));
  let pannes = 0;
  for (const url of urls) {
    const r = await sonder(url, options);
    if (!r.ok) pannes++;
    sortie(`${r.ok ? "OK   " : "PANNE"} ${url} — ${r.detail} (essai ${r.essais}/${ESSAIS})`);
  }
  sortie(
    pannes === 0
      ? `Fumée : ${urls.length} URL, tout va bien.`
      : `Fumée : ${pannes} panne(s) sur ${urls.length} URL.`,
  );
  return pannes === 0 ? 0 : 1;
}

function lireArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url-base") out.urlBase = argv[++i];
    else if (argv[i] === "--chemin") (out.chemins ??= []).push(argv[++i]);
    else throw new Error(`option inconnue : ${argv[i]}`);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fumee.json"), "utf8"),
  );
  try {
    process.exitCode = await executer(config, lireArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(`Fumée : ${err.message}`);
    process.exitCode = 1;
  }
}
