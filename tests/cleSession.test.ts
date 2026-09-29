// tests/cleSession.test.ts — le générateur de clé de session ne fuit jamais la clé privée.
//
// Les clés générées ici vivent EN MÉMOIRE le temps du test : aucune n'est écrite, aucune n'est
// réelle. Le script est appelé avec des entrées-sorties injectées (pas de disque, pas d'écran).
import { createPublicKey, verify, sign, createPrivateKey, type JsonWebKey } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALGORITHME,
  ecrirePriveeHorsDepot,
  empreinteJwk,
  estDansDepot,
  fusionnerJwks,
  genererPaire,
  principal,
  versJwks,
} from "@/scripts/cleSession.mjs";

// Chemins construits avec `join`/`tmpdir` : le test passe à l'identique sous Windows et Linux (CI).
const BASE = tmpdir();
const RACINE = join(BASE, "depot-fictif", "hubperso");
const HORS = join(BASE, "ailleurs", "cle.jwk.json");
const DANS = join(RACINE, "cle.json");

function lancer(argv: string[], racine = RACINE) {
  const sorties: string[] = [];
  const ecritures: { chemin: string; contenu: string; options: { flag: string; mode: number } }[] = [];
  const code = principal(argv, {
    racine,
    dossierTemporaire: join(BASE, "ailleurs"),
    suffixe: () => "abcd1234",
    ecrire: (chemin: string, contenu: string, options: { flag: string; mode: number }) => {
      ecritures.push({ chemin, contenu, options });
    },
    log: (t: string) => sorties.push(t),
  });
  return { code, ecran: sorties.join("\n"), ecritures };
}

describe("genererPaire", () => {
  it("produit une clé ES256 P-256 avec kid = empreinte RFC 7638", () => {
    const p = genererPaire();
    expect(p.publique).toMatchObject({ kty: "EC", crv: "P-256", alg: ALGORITHME, use: "sig", kid: p.kid });
    expect(p.kid).toBe(empreinteJwk(p.publique));
    expect(p.kid).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("la partie publique ne contient jamais le secret d", () => {
    const p = genererPaire();
    expect("d" in p.publique).toBe(false);
    expect(typeof p.privee.d).toBe("string");
  });

  it("deux paires ont deux kid différents", () => {
    expect(genererPaire().kid).not.toBe(genererPaire().kid);
  });

  it("la clé privée signe, la publique vérifie (et une autre clé refuse)", () => {
    const a = genererPaire();
    const b = genererPaire();
    const message = Buffer.from("en-tete.charge");
    const signature = sign("sha256", message, {
      key: createPrivateKey({ key: a.privee as unknown as JsonWebKey, format: "jwk" }),
      dsaEncoding: "ieee-p1363",
    });
    const ok = (cle: typeof a) =>
      verify("sha256", message, { key: createPublicKey({ key: cle.publique as unknown as JsonWebKey, format: "jwk" }), dsaEncoding: "ieee-p1363" }, signature);
    expect(ok(a)).toBe(true);
    expect(ok(b)).toBe(false);
  });
});

describe("fusionnerJwks (rotation)", () => {
  it("ajoute la nouvelle clé à côté de l'ancienne", () => {
    const ancienne = genererPaire();
    const nouvelle = genererPaire();
    const cles = fusionnerJwks(versJwks([ancienne.publique]), nouvelle.publique);
    expect(cles.map((c: { kid: string }) => c.kid)).toEqual([ancienne.kid, nouvelle.kid]);
  });

  it("refuse un kid déjà présent, un JSON illisible, un JWKS sans keys", () => {
    const p = genererPaire();
    expect(() => fusionnerJwks(versJwks([p.publique]), p.publique)).toThrow(/déjà/);
    expect(() => fusionnerJwks("pas du json", p.publique)).toThrow(/illisible/);
    expect(() => fusionnerJwks("{}", p.publique)).toThrow(/keys/);
  });

  it("refuse un JWKS existant qui contient une clé privée", () => {
    const p = genererPaire();
    const fuite = JSON.stringify({ keys: [p.privee] });
    expect(() => fusionnerJwks(fuite, genererPaire().publique)).toThrow(/PRIVÉE/);
  });
});

describe("estDansDepot / ecrirePriveeHorsDepot", () => {
  it("reconnaît un chemin dans le dépôt, pas un chemin voisin ni extérieur", () => {
    expect(estDansDepot(DANS, RACINE)).toBe(true);
    expect(estDansDepot(join(RACINE, "scripts", "..", "cle.json"), RACINE)).toBe(true);
    expect(estDansDepot(RACINE, RACINE)).toBe(true);
    expect(estDansDepot(join(BASE, "depot-fictif", "hubperso-autre", "cle.json"), RACINE)).toBe(false);
    expect(estDansDepot(HORS, RACINE)).toBe(false);
  });

  it("refuse d'écrire dans le dépôt et n'écrit rien", () => {
    const p = genererPaire();
    let ecrit = false;
    expect(() =>
      ecrirePriveeHorsDepot(p.privee, DANS, RACINE, () => {
        ecrit = true;
      }),
    ).toThrow(/dépôt/);
    expect(ecrit).toBe(false);
  });
});

describe("script principal", () => {
  it("écrit la clé privée hors dépôt (wx, 0600) et NE L'AFFICHE PAS", () => {
    const { code, ecran, ecritures } = lancer([]);
    expect(code).toBe(0);
    expect(ecritures).toHaveLength(1);
    const { chemin, contenu, options } = ecritures[0]!;
    expect(estDansDepot(chemin, RACINE)).toBe(false);
    expect(options).toEqual({ flag: "wx", mode: 0o600 });
    const privee = JSON.parse(contenu);
    expect(privee.d).toBeTruthy();
    // La clé privée (champ d, et tout le JSON écrit) ne doit apparaître nulle part à l'écran.
    expect(ecran).not.toContain(privee.d);
    expect(ecran).not.toContain(contenu);
    expect(ecran).not.toMatch(/"d"\s*:/);
  });

  it("affiche le kid et un JWKS public d'une ligne dont le kid correspond", () => {
    const { ecran, ecritures } = lancer([]);
    const kid = JSON.parse(ecritures[0]!.contenu).kid;
    expect(ecran).toContain(`kid : ${kid}`);
    const ligne = ecran.split("\n").find((l) => l.startsWith('{"keys"'));
    const jwks = JSON.parse(ligne as string);
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kid).toBe(kid);
    expect("d" in jwks.keys[0]).toBe(false);
  });

  it("--garder produit un JWKS à deux clés (rotation)", () => {
    const ancienne = genererPaire();
    const { ecran } = lancer(["--garder", versJwks([ancienne.publique])]);
    const jwks = JSON.parse(ecran.split("\n").find((l) => l.startsWith('{"keys"')) as string);
    expect(jwks.keys).toHaveLength(2);
    expect(jwks.keys[0].kid).toBe(ancienne.kid);
  });

  it("échoue proprement, sans écrire, si --sortie pointe dans le dépôt", () => {
    const { code, ecran, ecritures } = lancer(["--sortie", DANS]);
    expect(code).toBe(1);
    expect(ecritures).toHaveLength(0);
    expect(ecran).toMatch(/dépôt/);
  });

  it("échoue sur une option inconnue", () => {
    expect(lancer(["--truc"]).code).toBe(1);
  });
});
