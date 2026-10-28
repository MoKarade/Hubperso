// tests/sessionSignee.test.ts — le hub signe la session ES256, et le contrat la vérifie.
//
// Les paires de clés sont générées EN MÉMOIRE par le script de production (`genererPaire`) :
// aucune n'est réelle, aucune n'est écrite. La vérification passe par `verifierSession` de
// hub-contract, la même fonction que les apps : on éprouve ce que les apps verront, pas une
// resimulation.
import { decodeJwt, decodeProtectedHeader } from "jose";
import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifierSession } from "@mokarade/hub-contract/session";
import { genererPaire } from "@/scripts/cleSession.mjs";
import {
  DUREE_COOKIE_S,
  NOM_COOKIE_SESSION_SIGNEE,
  appliquerSessionSignee,
  clePriveeDepuisEnv,
  decisionCookieSignee,
  doitRenouveler,
  signerSession,
  type ClePrivee,
} from "@/lib/sessionSignee";

const MAINTENANT = new Date("2026-10-28T15:00:00Z");
const EMAIL = "proprietaire@example.test";
const DOMAINE = ".hubperso.com";
const JOUR_MS = 86_400_000;

const paire = genererPaire();
const autrePaire = genererPaire();
const cle: ClePrivee = { jwk: paire.privee, kid: paire.kid };
const envAvec = (p = paire) => ({
  AUTH_COOKIE_DOMAIN: DOMAINE,
  HUB_SESSION_PRIVATE_JWK: JSON.stringify(p.privee),
});
const cles = { keys: [paire.publique] };

afterEach(() => vi.restoreAllMocks());

describe("signerSession : ce que les apps vérifient", () => {
  it("rend un cookie que verifierSession du contrat accepte, avec la bonne identité", async () => {
    const cookie = await signerSession(EMAIL, cle, MAINTENANT);
    const identite = await verifierSession(cookie, cles, { maintenant: MAINTENANT });
    expect(identite?.email).toBe(EMAIL);
    expect(identite?.expireLe).toBe(identite!.emisLe + DUREE_COOKIE_S);
    expect(decodeProtectedHeader(cookie)).toMatchObject({ alg: "ES256", kid: paire.kid });
  });

  it("ne porte que email, émetteur, iat et exp : jamais de clé", async () => {
    const cookie = await signerSession(EMAIL, cle, MAINTENANT);
    expect(Object.keys(decodeJwt(cookie)).sort()).toEqual(["email", "exp", "iat", "iss"]);
    expect(cookie).not.toContain(paire.privee.d as string);
  });

  it("est REFUSÉ par une autre clé publique, une signature fausse et une fois expiré", async () => {
    const cookie = await signerSession(EMAIL, cle, MAINTENANT);
    // autre paire : le kid ne se retrouve pas
    expect(await verifierSession(cookie, { keys: [autrePaire.publique] }, { maintenant: MAINTENANT })).toBeNull();
    // même kid, autre clé : la signature ne colle pas
    const usurpee = { ...autrePaire.publique, kid: paire.kid };
    expect(await verifierSession(cookie, { keys: [usurpee] }, { maintenant: MAINTENANT })).toBeNull();
    // expiré
    const plusTard = new Date(MAINTENANT.getTime() + 32 * JOUR_MS);
    expect(await verifierSession(cookie, cles, { maintenant: plusTard })).toBeNull();
  });
});

describe("clePriveeDepuisEnv : échec fermé", () => {
  const rejets: [string, string | undefined][] = [
    ["variable absente", undefined],
    ["variable blanche", "   "],
    ["JSON invalide", "{pas du json"],
    ["clé PUBLIQUE (sans d)", JSON.stringify(paire.publique)],
    ["kid absent", JSON.stringify({ ...paire.privee, kid: undefined })],
    ["autre courbe", JSON.stringify({ ...paire.privee, crv: "P-384" })],
  ];
  it.each(rejets)("rend null : %s", (_nom, valeur) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(clePriveeDepuisEnv({ HUB_SESSION_PRIVATE_JWK: valeur })).toBeNull();
  });

  it("accepte la clé du script, et ne journalise qu'une fois une valeur fausse, sans la dire", () => {
    expect(clePriveeDepuisEnv(envAvec())?.kid).toBe(paire.kid);
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const fausse = { HUB_SESSION_PRIVATE_JWK: JSON.stringify({ ...paire.privee, kid: "" }) };
    clePriveeDepuisEnv(fausse);
    clePriveeDepuisEnv(fausse);
    expect(erreur).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(erreur.mock.calls)).not.toContain(paire.privee.d as string);
  });
});

describe("doitRenouveler", () => {
  it("garde un cookie frais, remplace le périmé à moitié, l'autre adresse, l'autre clé, l'illisible", async () => {
    const cookie = await signerSession(EMAIL, cle, MAINTENANT);
    const apres = (jours: number) => new Date(MAINTENANT.getTime() + jours * JOUR_MS);
    expect(doitRenouveler(cookie, EMAIL, paire.kid, apres(10))).toBe(false);
    expect(doitRenouveler(cookie, EMAIL, paire.kid, apres(16))).toBe(true);
    expect(doitRenouveler(cookie, "autre@example.test", paire.kid, MAINTENANT)).toBe(true);
    expect(doitRenouveler(cookie, EMAIL, autrePaire.kid, MAINTENANT)).toBe(true);
    expect(doitRenouveler("pas.un.jeton", EMAIL, paire.kid, MAINTENANT)).toBe(true);
  });
});

describe("decisionCookieSignee", () => {
  const decider = (e: { cookie?: string; email?: string | null; env?: Record<string, string> }) =>
    decisionCookieSignee({ cookie: e.cookie, email: e.email, env: e.env ?? envAvec(), maintenant: MAINTENANT });

  it("ne fait rien sans domaine partagé (local, préversion)", async () => {
    const env = { HUB_SESSION_PRIVATE_JWK: JSON.stringify(paire.privee) };
    expect(await decider({ email: EMAIL, env })).toEqual({ type: "rien" });
    expect(await decider({ email: EMAIL, cookie: "x", env })).toEqual({ type: "rien" });
  });

  it("pose un cookie vérifiable quand la session est valide et qu'il n'y en a pas", async () => {
    const action = await decider({ email: EMAIL });
    expect(action.type).toBe("poser");
    if (action.type !== "poser") return;
    expect((await verifierSession(action.valeur, cles, { maintenant: MAINTENANT }))?.email).toBe(EMAIL);
  });

  it("ne re-signe pas un cookie frais", async () => {
    const cookie = await signerSession(EMAIL, cle, MAINTENANT);
    expect(await decider({ email: EMAIL, cookie })).toEqual({ type: "rien" });
  });

  it("re-signe après rotation de clé : le cookie d'une autre clé est remplacé", async () => {
    const ancien = await signerSession(EMAIL, { jwk: autrePaire.privee, kid: autrePaire.kid }, MAINTENANT);
    expect((await decider({ email: EMAIL, cookie: ancien })).type).toBe("poser");
  });

  it("efface le cookie quand la session n'est plus valide, et ne fait rien s'il n'y en a pas", async () => {
    expect(await decider({ email: null, cookie: "x.y.z" })).toEqual({ type: "effacer" });
    expect(await decider({ email: undefined })).toEqual({ type: "rien" });
  });

  it("sans clé utilisable : efface un cookie existant, sinon ne fait rien (jamais d'exception)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sansCle = { AUTH_COOKIE_DOMAIN: DOMAINE };
    expect(await decider({ email: EMAIL, env: sansCle })).toEqual({ type: "rien" });
    expect(await decider({ email: EMAIL, cookie: "x.y.z", env: sansCle })).toEqual({ type: "effacer" });
  });
});

describe("appliquerSessionSignee : l'en-tête Set-Cookie", () => {
  const entete = async (email: string | null, cookie?: string, env: Record<string, string> = envAvec()) => {
    const reponse = await appliquerSessionSignee(NextResponse.next(), { email, cookie, env, maintenant: MAINTENANT });
    return reponse.headers.get("set-cookie");
  };

  it("pose le cookie avec les attributs qui le rendent lisible par les apps et par elles seules", async () => {
    const c = (await entete(EMAIL))!;
    expect(c).toContain(`${NOM_COOKIE_SESSION_SIGNEE}=`);
    expect(c).toContain(`Domain=${DOMAINE}`);
    for (const attribut of ["HttpOnly", "Secure", "SameSite=lax", "Path=/", `Max-Age=${DUREE_COOKIE_S}`]) {
      expect(c).toContain(attribut);
    }
  });

  it("l'efface avec les MÊMES domaine et chemin (sinon le navigateur le garde)", async () => {
    const c = (await entete(null, "x.y.z"))!;
    expect(c).toContain(`${NOM_COOKIE_SESSION_SIGNEE}=;`);
    expect(c).toContain("Max-Age=0");
    expect(c).toContain(`Domain=${DOMAINE}`);
    expect(c).toContain("Path=/");
  });

  it("n'ajoute rien quand il n'y a rien à faire", async () => {
    expect(await entete(null)).toBeNull();
  });

  it("une clé corrompue ne bloque pas la réponse : pas de cookie, une erreur sans secret", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const corrompue = { ...paire.privee, d: "pas-une-vraie-clef" };
    const env = { AUTH_COOKIE_DOMAIN: DOMAINE, HUB_SESSION_PRIVATE_JWK: JSON.stringify(corrompue) };
    const reponse = await appliquerSessionSignee(NextResponse.next(), { email: EMAIL, cookie: undefined, env });
    expect(reponse.headers.get("set-cookie")).toBeNull();
    expect(reponse.status).toBe(200);
    expect(erreur).toHaveBeenCalled();
    expect(JSON.stringify(erreur.mock.calls)).not.toContain("pas-une-vraie-clef");
  });
});
