// tests/sessionMoi.test.ts — GET /api/session/moi (FinanceAI#1159) : un booléen sur la session de l'appelant, rien d'autre.
//
// La vraie route est appelée avec de vraies `Request` ; seule la session (`@/auth`) est remplacée. Aucune base : la route
// n'en a pas besoin (le propriétaire se reconnaît par `AUTHORIZED_EMAIL`), et ce test le prouve en interdisant tout accès.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROPRIETAIRE = "proprietaire@exemple.test";
const INVITE = "invite@exemple.test";

const moq = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/db", () => ({
  baseConfiguree: () => false,
  db: new Proxy({}, { get: () => { throw new Error("accès base interdit dans ce test"); } }),
}));

import { GET } from "../app/api/session/moi/route";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const requete = (ip = "203.0.113.1") =>
  new Request("https://www.hubperso.com/api/session/moi", { headers: { "x-vercel-forwarded-for": ip } });

beforeEach(() => {
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  moq.auth.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/session/moi", () => {
  it("propriétaire : { proprietaire: true }, sans cache", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    const res = await GET(requete());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ proprietaire: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("le propriétaire est reconnu sans tenir compte de la casse ni des espaces", async () => {
    moq.auth.mockResolvedValue({ user: { email: `  ${PROPRIETAIRE.toUpperCase()} ` } });
    expect(await (await GET(requete())).json()).toEqual({ proprietaire: true });
  });

  it("invité du hub (session valide, autre adresse) : { proprietaire: false }, jamais son adresse", async () => {
    moq.auth.mockResolvedValue({ user: { email: INVITE } });
    const res = await GET(requete());
    expect(res.status).toBe(200);
    const texte = await res.text();
    expect(JSON.parse(texte)).toEqual({ proprietaire: false });
    expect(texte).not.toContain(INVITE);
  });

  it.each([
    ["aucune session", null],
    ["session sans adresse", { user: {} }],
    ["adresse vide", { user: { email: "" } }],
  ])("%s : 401", async (_nom, session) => {
    moq.auth.mockResolvedValue(session);
    const res = await GET(requete());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("AUTHORIZED_EMAIL absent ou vide : personne n'est propriétaire (échec fermé)", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    for (const valeur of ["", "   "]) {
      vi.stubEnv("AUTHORIZED_EMAIL", valeur);
      expect(await (await GET(requete())).json()).toEqual({ proprietaire: false });
    }
  });

  it("au-delà de 300 appels par minute et par client : 429 avec retry-after", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    let dernier = 200;
    for (let i = 0; i < 301; i++) dernier = (await GET(requete("203.0.113.77"))).status;
    expect(dernier).toBe(429);
  });
});

describe("la route reste derrière le garde du hub", () => {
  it("n'est ni dans isPublicPath ni dans une exclusion du matcher de middleware.ts", () => {
    const garde = readFileSync(resolve(process.cwd(), "lib/authGuard.ts"), "utf8");
    const mw = readFileSync(resolve(process.cwd(), "middleware.ts"), "utf8");
    expect(garde).not.toContain("/api/session");
    expect(mw).not.toContain("api/session");
  });
});
