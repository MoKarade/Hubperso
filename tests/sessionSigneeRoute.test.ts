// tests/sessionSigneeRoute.test.ts — GET /api/session/signee : propriétaire seul, et l'ÉTAT du cookie signé
// (jamais le cookie ni une clé). Les clés sont générées en mémoire par le script de production.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { genererPaire } from "@/scripts/cleSession.mjs";

const moq = vi.hoisted(() => ({ auth: vi.fn(), cookie: vi.fn() }));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (nom: string) => moq.cookie(nom) }) }));

import { GET } from "@/app/api/session/signee/route";
import { NOM_COOKIE_SESSION_SIGNEE, signerSession } from "@/lib/sessionSignee";
import { controlerSessionSignee } from "@/lib/sessionSigneeControle";

const PROPRIETAIRE = "proprio@example.test";
const paire = genererPaire();
const autre = genererPaire();
const publiques = (p = paire) => JSON.stringify({ keys: [p.publique] });
const signer = (email = PROPRIETAIRE, p = paire, maintenant = new Date()) =>
  signerSession(email, { jwk: p.privee, kid: p.kid }, maintenant);

let ip = 0;
const requete = () => new Request("https://hubperso.com/api/session/signee", { headers: { "x-real-ip": `10.5.0.${++ip}` } });
const poserCookie = (valeur: string | undefined) =>
  moq.cookie.mockImplementation((nom: string) => (nom === NOM_COOKIE_SESSION_SIGNEE && valeur ? { value: valeur } : undefined));

beforeEach(() => {
  moq.auth.mockReset();
  moq.cookie.mockReset();
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  vi.stubEnv("HUB_SESSION_PUBLIC_KEYS", publiques());
  moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
  poserCookie(undefined);
});

describe("GET /api/session/signee", () => {
  it("sans session : 401, no-store", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await GET(requete());
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("un invité du hub : 404, pas 403", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@example.test" } });
    expect((await GET(requete())).status).toBe(404);
  });

  it("cookie signé par le hub : valide, avec le kid et l'expiration, et RIEN d'autre", async () => {
    const cookie = await signer();
    poserCookie(cookie);
    const r = await GET(requete());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
    const corps = await r.json();
    expect(corps).toEqual({ etat: "valide", kid: paire.kid, expireLe: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) });
    expect(JSON.stringify(corps)).not.toContain(cookie);
  });

  it("pas de cookie : absent", async () => {
    expect(await (await GET(requete())).json()).toEqual({ etat: "absent" });
  });

  it("cookie d'une autre adresse, d'une autre clé ou illisible : invalide", async () => {
    for (const mauvais of [await signer("autre@example.test"), await signer(PROPRIETAIRE, autre), "pas.un.jeton"]) {
      poserCookie(mauvais);
      expect(await (await GET(requete())).json()).toEqual({ etat: "invalide" });
    }
  });

  it("clés publiques absentes ou illisibles : non-configure, même avec un cookie", async () => {
    poserCookie(await signer());
    for (const valeur of ["", "{pas du json", JSON.stringify({ pas: "de keys" })]) {
      vi.stubEnv("HUB_SESSION_PUBLIC_KEYS", valeur);
      expect(await (await GET(requete())).json()).toEqual({ etat: "non-configure" });
    }
  });
});

describe("controlerSessionSignee", () => {
  it("un cookie expiré est invalide", async () => {
    const vieux = await signer(PROPRIETAIRE, paire, new Date("2026-01-01T00:00:00Z"));
    const r = await controlerSessionSignee(vieux, PROPRIETAIRE, { HUB_SESSION_PUBLIC_KEYS: publiques() }, new Date("2026-10-28T00:00:00Z"));
    expect(r).toEqual({ etat: "invalide" });
  });
});
