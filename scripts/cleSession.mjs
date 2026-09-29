// scripts/cleSession.mjs — génération de la paire de clés ES256 qui signera la session partagée.
//
// Fonctions PURES ou presque, zéro dépendance (crypto natif de Node) : c'est la partie
// testable. Le script d'appel (`generer-cle-session.mjs`) ne fait que brancher les entrées-
// sorties. Contexte : plan `plan-auth-asym-hubperso.md` (Option A) — Hubperso seul détient la
// clé PRIVÉE et signe ; les quatre autres apps ne reçoivent que la clé PUBLIQUE et vérifient.
//
// ── CE QUE CE FICHIER NE FAIT JAMAIS ────────────────────────────────────────────────────
// Afficher, journaliser ou renvoyer la clé privée dans un texte destiné à l'écran. La clé
// privée n'existe que dans l'objet retourné par `genererPaire` et dans le fichier écrit par
// `ecrirePriveeHorsDepot`. Tout le reste ne manipule que la partie publique.

import { createHash, generateKeyPairSync } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";

/** Algorithme figé : les vérificateurs doivent accepter ES256 et rien d'autre. */
export const ALGORITHME = "ES256";

/**
 * Empreinte RFC 7638 d'une clé publique EC : SHA-256 des membres requis, dans l'ordre
 * alphabétique, sans espace. Sert de `kid` : déterministe (on la recalcule pour vérifier) et
 * impossible à confondre entre deux clés différentes.
 */
export function empreinteJwk(jwkPublique) {
  const canonique = JSON.stringify({
    crv: jwkPublique.crv,
    kty: jwkPublique.kty,
    x: jwkPublique.x,
    y: jwkPublique.y,
  });
  return createHash("sha256").update(canonique).digest("base64url");
}

/**
 * Génère UNE paire ES256 (courbe P-256). Retourne :
 *  - `kid`     : identifiant de clé (empreinte RFC 7638) ;
 *  - `publique`: JWK publique complète (`kid`, `alg`, `use`) — SÛRE à afficher ;
 *  - `privee`  : JWK privée (contient `d`) — NE JAMAIS AFFICHER.
 */
export function genererPaire() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const brute = publicKey.export({ format: "jwk" });
  const kid = empreinteJwk(brute);
  const meta = { kid, alg: ALGORITHME, use: "sig" };
  return {
    kid,
    publique: { ...brute, ...meta },
    privee: { ...privateKey.export({ format: "jwk" }), ...meta },
  };
}

/** Forme attendue par les variables d'environnement publiques : un JWKS sur UNE ligne. */
export function versJwks(cles) {
  return JSON.stringify({ keys: cles });
}

/**
 * Ajoute la nouvelle clé publique à un JWKS existant (rotation : les DEUX kid circulent
 * pendant la transition). Refuse un JWKS illisible et un `kid` déjà présent — écraser en
 * silence ferait croire à une rotation qui n'a pas eu lieu.
 */
export function fusionnerJwks(jwksExistant, nouvellePublique) {
  let existant;
  try {
    existant = JSON.parse(jwksExistant);
  } catch {
    throw new Error("JWKS existant illisible (JSON invalide).");
  }
  const cles = Array.isArray(existant?.keys) ? existant.keys : null;
  if (!cles) throw new Error('JWKS existant invalide : le tableau "keys" manque.');
  if (cles.some((c) => c && "d" in c)) {
    throw new Error("Le JWKS existant contient une clé PRIVÉE (champ d) : arrêt, ne le diffuse pas.");
  }
  if (cles.some((c) => c?.kid === nouvellePublique.kid)) {
    throw new Error(`Le kid ${nouvellePublique.kid} est déjà dans le JWKS existant.`);
  }
  return [...cles, nouvellePublique];
}

/** Vrai si `chemin` est `racine` ou se trouve dedans (comparaison sur chemins résolus). */
export function estDansDepot(chemin, racine) {
  const rel = relative(resolve(racine), resolve(chemin));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Écrit la clé privée dans un fichier HORS du dépôt, en création exclusive (`wx` : jamais
 * d'écrasement d'un fichier existant) et en mode 0600. Sous Windows le mode est sans effet :
 * le fichier hérite des droits du dossier de l'utilisateur, d'où la consigne de le supprimer
 * aussitôt après usage. Retourne le chemin ; ne retourne JAMAIS le contenu.
 */
export function ecrirePriveeHorsDepot(privee, chemin, racineDepot, ecrire) {
  if (estDansDepot(chemin, racineDepot)) {
    throw new Error("Refus : le fichier de la clé privée ne doit pas être dans le dépôt.");
  }
  ecrire(chemin, JSON.stringify(privee), { flag: "wx", mode: 0o600 });
  return chemin;
}

function lireOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--garder") options.garder = argv[++i];
    else if (argv[i] === "--sortie") options.sortie = argv[++i];
    else throw new Error(`Option inconnue : ${argv[i]}`);
  }
  return options;
}

/**
 * Cœur du script, avec ses entrées-sorties injectées pour être testable sans toucher au
 * disque ni à l'écran. Retourne le code de sortie.
 */
export function principal(argv, io) {
  try {
    const options = lireOptions(argv);
    const paire = genererPaire();
    const publiques =
      options.garder === undefined
        ? [paire.publique]
        : [...fusionnerJwks(options.garder, paire.publique)];
    const chemin =
      options.sortie ?? join(io.dossierTemporaire, `hubperso-cle-session-${paire.kid.slice(0, 8)}-${io.suffixe()}.jwk.json`);
    ecrirePriveeHorsDepot(paire.privee, chemin, io.racine, io.ecrire);

    io.log(`kid : ${paire.kid}`);
    io.log("");
    io.log("1) Variable PUBLIQUE (à poser dans le hub ET dans les 4 satellites, valeur sur une ligne) :");
    io.log(versJwks(publiques));
    io.log("");
    io.log(`2) Variable PRIVÉE (hub SEULEMENT, marquée « sensible » dans Vercel) : colle le contenu du fichier`);
    io.log(`   ${chemin}`);
    io.log("   Puis SUPPRIME ce fichier tout de suite (Windows : les droits 0600 ne s'y appliquent pas).");
    io.log("   La clé privée n'est affichée nulle part et ne doit jamais entrer dans un dépôt.");
    return 0;
  } catch (erreur) {
    io.log(`Échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    return 1;
  }
}
