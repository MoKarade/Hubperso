// lib/sessionSignee.ts — le hub SIGNE la session partagée (cookie JWS ES256).
//
// Phase 2 du plan `auth-asym-hubperso` (option A). Le hub est le SEUL à détenir la clé privée
// (`HUB_SESSION_PRIVATE_JWK`, projet Vercel `hubperso` uniquement) ; les apps ne reçoivent que
// la clé publique et vérifient avec `verifierSession` de `@mokarade/hub-contract/session`.
// Ce fichier ne vérifie rien : il fabrique le cookie, décide quand le poser ou l'effacer.
//
// ── ADDITIF ───────────────────────────────────────────────────────────────────────────
// Le cookie chiffré d'Auth.js reste la référence du hub. Ce second cookie n'est dérivé que
// d'une session DÉJÀ valide (`req.auth`, donc après `peutSeConnecter`) : il ne crée jamais un
// accès, il le recopie sous forme vérifiable par les apps. Sans clé, sans domaine de cookie ou
// en cas d'erreur, il ne se passe rien — jamais de blocage du hub (échec fermé côté cookie,
// pas côté connexion).
//
// ── CE QUE CE FICHIER NE FAIT JAMAIS ──────────────────────────────────────────────────
// Écrire la clé privée dans un journal, une réponse ou le cookie. Les messages d'erreur ne
// portent que des NOMS de variables ou de champs.
import { SignJWT, decodeJwt, decodeProtectedHeader, importJWK, type JWK } from "jose";
import {
  SESSION_ALGORITHME,
  SESSION_DUREE_MAX_S,
  SESSION_EMETTEUR,
} from "@mokarade/hub-contract/session";
import type { NextResponse } from "next/server";

type Env = Partial<NodeJS.ProcessEnv>;

/** Même nom que celui que lisent les apps (`__Secure-` : HTTPS et domaine parent obligatoires). */
export const NOM_COOKIE_SESSION_SIGNEE = "__Secure-hub.session";
/** Durée du cookie : 30 jours, sous le plafond de 31 jours que les vérificateurs acceptent. */
export const DUREE_COOKIE_S = 30 * 86_400;
/** On re-signe quand il reste moins de la moitié de la durée (session « glissante »). */
const RENOUVELLEMENT_S = DUREE_COOKIE_S / 2;

export interface ClePrivee {
  readonly jwk: JWK;
  readonly kid: string;
}

export type ActionCookie =
  | { readonly type: "rien" }
  | { readonly type: "poser"; readonly valeur: string }
  | { readonly type: "effacer" };

// Une seule lecture (et un seul message d'erreur) par valeur de variable : le middleware passe
// ici à chaque requête, un journal par requête noierait tout le reste.
let memoCle: { brut: string; cle: ClePrivee | null } | null = null;
const clesImportees = new WeakMap<ClePrivee, ReturnType<typeof importJWK>>();

/** La clé privée du hub depuis l'environnement, ou `null` (absente ou inutilisable). */
export function clePriveeDepuisEnv(env: Env = process.env): ClePrivee | null {
  const brut = env.HUB_SESSION_PRIVATE_JWK?.trim();
  if (!brut) return null;
  if (memoCle?.brut === brut) return memoCle.cle;

  const cle = analyserCle(brut);
  memoCle = { brut, cle };
  return cle;
}

function analyserCle(brut: string): ClePrivee | null {
  let lue: unknown;
  try {
    lue = JSON.parse(brut);
  } catch {
    console.error("[sessionSignee] HUB_SESSION_PRIVATE_JWK n'est pas du JSON valide.");
    return null;
  }
  const jwk = (typeof lue === "object" && lue !== null ? lue : {}) as Partial<JWK>;
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.d !== "string" ||
    jwk.d === "" ||
    typeof jwk.kid !== "string" ||
    jwk.kid === ""
  ) {
    console.error(
      "[sessionSignee] HUB_SESSION_PRIVATE_JWK doit être une clé EC P-256 PRIVÉE (champ d) portant un kid.",
    );
    return null;
  }
  return { jwk: jwk as JWK, kid: jwk.kid };
}

/** Signe le cookie : `email`, émetteur `hubperso.com`, `iat`, `exp` — rien d'autre. */
export async function signerSession(
  email: string,
  cle: ClePrivee,
  maintenant: Date = new Date(),
): Promise<string> {
  let importee = clesImportees.get(cle);
  if (!importee) {
    importee = importJWK(cle.jwk, SESSION_ALGORITHME);
    clesImportees.set(cle, importee);
  }
  const emisLe = Math.floor(maintenant.getTime() / 1000);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: SESSION_ALGORITHME, kid: cle.kid, typ: "JWT" })
    .setIssuer(SESSION_EMETTEUR)
    .setIssuedAt(emisLe)
    .setExpirationTime(emisLe + DUREE_COOKIE_S)
    .sign(await importee);
}

/**
 * Le cookie reçu doit-il être remplacé ? Lecture NON vérifiée du contenu, sans danger : le
 * résultat est toujours « fabriquer un cookie neuf à partir de la session du hub », jamais
 * « faire confiance à ce que dit le cookie ».
 */
export function doitRenouveler(
  cookie: string,
  email: string,
  kid: string,
  maintenant: Date,
): boolean {
  try {
    const entete = decodeProtectedHeader(cookie);
    const { email: dedans, iss, iat, exp } = decodeJwt(cookie);
    if (entete.alg !== SESSION_ALGORITHME || entete.kid !== kid) return true; // rotation de clé
    if (iss !== SESSION_EMETTEUR || dedans !== email) return true;
    if (typeof iat !== "number" || typeof exp !== "number") return true;
    if (exp - iat > SESSION_DUREE_MAX_S) return true;
    return exp - maintenant.getTime() / 1000 < RENOUVELLEMENT_S;
  } catch {
    return true; // illisible : on le remplace
  }
}

/** Domaine du cookie : le même que celui de la session Auth.js, absent hors production. */
function domaineCookie(env: Env): string | null {
  return env.AUTH_COOKIE_DOMAIN?.trim() || null;
}

export interface EntreeDecision {
  /** Valeur du cookie signé reçu, s'il y en a un. */
  readonly cookie: string | undefined;
  /** Adresse de la session Auth.js VALIDE, ou `null` / absente si le hub ne reconnaît personne. */
  readonly email: string | null | undefined;
  readonly env?: Env;
  readonly maintenant?: Date;
}

/**
 * Que faire du cookie signé pour cette requête ?
 * - pas de domaine partagé (local, préversion) : rien — le cookie `__Secure-` y serait rejeté ;
 * - plus de session valide : l'effacer s'il traîne (une déconnexion ne doit pas laisser d'accès
 *   aux apps qui acceptent ce cookie) ;
 * - clé absente ou inutilisable : effacer aussi un éventuel cookie (on ne laisse pas circuler
 *   un cookie que le hub ne saurait plus renouveler), sinon rien ;
 * - session valide et cookie absent, périmé à moitié, d'une autre clé ou d'une autre adresse :
 *   en signer un neuf.
 */
export async function decisionCookieSignee(entree: EntreeDecision): Promise<ActionCookie> {
  const env = entree.env ?? process.env;
  if (!domaineCookie(env)) return { type: "rien" };

  const { cookie, email } = entree;
  const efface: ActionCookie = cookie ? { type: "effacer" } : { type: "rien" };
  if (!email) return efface;

  const cle = clePriveeDepuisEnv(env);
  if (!cle) return efface;

  const maintenant = entree.maintenant ?? new Date();
  if (cookie && !doitRenouveler(cookie, email, cle.kid, maintenant)) return { type: "rien" };
  return { type: "poser", valeur: await signerSession(email, cle, maintenant) };
}

/** Attributs du cookie (posé ou effacé) : identiques, sinon le navigateur ne l'efface pas. */
export function optionsCookieSignee(domaine: string, maxAge: number = DUREE_COOKIE_S) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    domain: domaine,
    maxAge,
  };
}

/**
 * Applique la décision à la réponse du middleware. Une erreur (clé corrompue, import refusé)
 * est journalisée et la réponse part SANS le cookie : le hub ne doit jamais se bloquer parce
 * que la signature a échoué.
 */
export async function appliquerSessionSignee(
  reponse: NextResponse,
  entree: EntreeDecision,
): Promise<NextResponse> {
  const env = entree.env ?? process.env;
  const domaine = domaineCookie(env);
  if (!domaine) return reponse;
  try {
    const action = await decisionCookieSignee(entree);
    if (action.type === "poser") {
      reponse.cookies.set(NOM_COOKIE_SESSION_SIGNEE, action.valeur, optionsCookieSignee(domaine));
    } else if (action.type === "effacer") {
      reponse.cookies.set(NOM_COOKIE_SESSION_SIGNEE, "", optionsCookieSignee(domaine, 0));
    }
  } catch (erreur) {
    console.error(
      "[sessionSignee] signature impossible, cookie signé non posé :",
      erreur instanceof Error ? erreur.name : "erreur inconnue",
    );
  }
  return reponse;
}
