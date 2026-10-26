// tests/chantierReleveRoute.test.ts — GET /api/chantier/releve, la lecture du relevé par la page Chantier.
//
// Ce qu'on éprouve : session absente → 401 et RIEN n'est lu ; invité du hub → 404 (il n'apprend pas que la
// page existe) ; sans base → 503 ; aucun relevé → 404 `aucun` ; ETag connu → 304 sans lire le contenu ;
// 200 → le gzip tel quel, `Content-Encoding: gzip`, `no-store` ; gzip illisible → 500 ; panne → 500 ; 429.

import { gzipSync, gunzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  baseConfiguree: vi.fn(() => true),
  assurerMigrations: vi.fn(async () => {}),
  aAcces: vi.fn(),
  estProprietaire: vi.fn(),
  lireEnteteGantt: vi.fn(),
  lireGantt: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/db", () => ({ baseConfiguree: moq.baseConfiguree }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: moq.assurerMigrations }));
vi.mock("@/lib/ganttDb", () => ({ lireEnteteGantt: moq.lireEnteteGantt, lireGantt: moq.lireGantt }));
vi.mock("@/lib/personnes", () => ({
  APP_HUB: "hubperso",
  aAcces: moq.aAcces,
  estProprietaire: moq.estProprietaire,
}));

import { GET } from "@/app/api/chantier/releve/route";
import { etagDuReleve } from "@/lib/chantierReleve";

const RECU = new Date("2026-10-26T21:00:03.000Z");
const ENVOYE = new Date("2026-10-26T21:00:00.000Z");
const GANTT = { asof: "2026-10-26T21:00:00Z", nodes: [] };
const GZ_B64 = gzipSync(Buffer.from(JSON.stringify(GANTT))).toString("base64");

let ip = 0;
/** Chaque requête vient d'un client distinct : la limite de débit ne se mélange pas aux cas. */
function requete(entetes: Record<string, string> = {}, client = `10.2.0.${++ip}`) {
  return new Request("https://hubperso.com/api/chantier/releve", {
    headers: { "x-real-ip": client, ...entetes },
  });
}

beforeEach(() => {
  for (const m of Object.values(moq)) m.mockReset();
  moq.baseConfiguree.mockReturnValue(true);
  moq.auth.mockResolvedValue({ user: { email: "marc@example.test" } });
  moq.aAcces.mockResolvedValue(true);
  moq.estProprietaire.mockReturnValue(true);
  moq.lireEnteteGantt.mockResolvedValue({ recuLe: RECU, envoyeLe: ENVOYE });
  moq.lireGantt.mockResolvedValue({ recuLe: RECU, envoyeLe: ENVOYE, donneesGzB64: GZ_B64 });
});

describe("GET /api/chantier/releve", () => {
  it("sans session : 401, et rien n'est lu en base", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await GET(requete());
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(moq.lireEnteteGantt).not.toHaveBeenCalled();
    expect(moq.lireGantt).not.toHaveBeenCalled();
  });

  it("session sans accès au hub : 401", async () => {
    moq.aAcces.mockResolvedValue(false);
    expect((await GET(requete())).status).toBe(401);
    expect(moq.lireGantt).not.toHaveBeenCalled();
  });

  it("invité du hub (pas le propriétaire) : 404, rien n'est lu", async () => {
    moq.estProprietaire.mockReturnValue(false);
    const r = await GET(requete());
    expect(r.status).toBe(404);
    expect(moq.lireEnteteGantt).not.toHaveBeenCalled();
    expect(moq.lireGantt).not.toHaveBeenCalled();
  });

  it("sans base : 503", async () => {
    moq.baseConfiguree.mockReturnValue(false);
    expect((await GET(requete())).status).toBe(503);
  });

  it("aucun relevé reçu : 404 `aucun`, jamais un relevé vide", async () => {
    moq.lireEnteteGantt.mockResolvedValue(null);
    const r = await GET(requete());
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("aucun");
  });

  it("ETag connu : 304 sans corps, et le contenu n'est PAS relu", async () => {
    const etag = etagDuReleve(RECU);
    const r = await GET(requete({ "if-none-match": etag }));
    expect(r.status).toBe(304);
    expect(r.headers.get("etag")).toBe(etag);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toBe("");
    expect(moq.lireGantt).not.toHaveBeenCalled();
  });

  it("ETag périmé : 200 et le gzip tel que le PC l'a envoyé", async () => {
    const r = await GET(requete({ "if-none-match": '"1"' }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-encoding")).toBe("gzip");
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("etag")).toBe(etagDuReleve(RECU));
    expect(r.headers.get("x-releve-envoye")).toBe(ENVOYE.toISOString());
    expect(r.headers.get("x-releve-recu")).toBe(RECU.toISOString());
    const octets = Buffer.from(await r.arrayBuffer());
    expect(JSON.parse(gunzipSync(octets).toString("utf8"))).toEqual(GANTT);
  });

  it("gzip illisible en base : 500 explicite, pas un corps cassé annoncé gzip", async () => {
    moq.lireGantt.mockResolvedValue({ recuLe: RECU, envoyeLe: ENVOYE, donneesGzB64: "AAAA" });
    const r = await GET(requete());
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("illisible");
  });

  it("lecture qui échoue : 500, jamais un 200 qui cache la panne", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    moq.lireEnteteGantt.mockRejectedValue(new Error("neon indisponible"));
    const r = await GET(requete());
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("neon");
  });

  it("trop de lectures d'un même client : 429", async () => {
    const client = "10.9.9.9";
    let dernier = 200;
    for (let i = 0; i < 31; i++) dernier = (await GET(requete({}, client))).status;
    expect(dernier).toBe(429);
  });
});
