// tests/chantierGestesPc.test.ts — GET/POST /api/chantier/gestes/pc, la lecture et l'accusé du PC.
//
// Même montage que tests/ganttRoute.test.ts. Ce qu'on éprouve : GANTT_SECRET absent → 503 (jamais 401), secret
// absent ou faux → 401 et RIEN n'est lu ni écrit ; comparaison par `memeJeton` ; lire ne marque rien ; l'accusé
// est validé avant toute écriture ; base en panne → 500 (jamais un 200 qui la cache) ; limite de débit → 429.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TAILLE_MAX_ACCUSE } from "@/lib/chantierGestes";

const SECRET = "secret-de-test-gantt-0123456789ab";

const moq = vi.hoisted(() => ({
  baseConfiguree: vi.fn(() => true),
  assurerMigrations: vi.fn(async () => {}),
  gestesEnAttente: vi.fn(),
  accuserGestes: vi.fn(),
  memeJeton: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ baseConfiguree: moq.baseConfiguree }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: moq.assurerMigrations }));
vi.mock("@/lib/chantierGestesDb", () => ({
  gestesEnAttente: moq.gestesEnAttente,
  accuserGestes: moq.accuserGestes,
}));
vi.mock("@/lib/jetonApp", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/jetonApp")>();
  moq.memeJeton.mockImplementation(vrai.memeJeton);
  return { ...vrai, memeJeton: moq.memeJeton };
});

import { GET, POST } from "@/app/api/chantier/gestes/pc/route";

const GESTE = { v: 1, id: "mh3k2x9a-4fzq1w", ref: "Org/depot#12", geste: "fusionner", texte: null, quand: "2026-10-27T10:00:00.000Z" };

let ip = 0;
/** Chaque requête vient d'un client distinct : la limite de débit ne se mélange pas aux cas. */
function requete(methode: "GET" | "POST", authorization?: string, corps?: string, client = `10.5.0.${++ip}`) {
  const headers = new Headers({ "x-real-ip": client });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://hubperso.com/api/chantier/gestes/pc", { method: methode, headers, body: corps });
}
const bon = `Bearer ${SECRET}`;
const accuse = (ids: unknown) => JSON.stringify({ ids });

beforeEach(() => {
  moq.baseConfiguree.mockReset().mockReturnValue(true);
  moq.assurerMigrations.mockReset().mockResolvedValue(undefined);
  moq.gestesEnAttente.mockReset().mockResolvedValue([GESTE]);
  moq.accuserGestes.mockReset().mockImplementation(async (ids: string[]) => ids);
  vi.stubEnv("GANTT_SECRET", SECRET);
});

describe.each(["GET", "POST"] as const)("%s /api/chantier/gestes/pc — la porte", (methode) => {
  const corps = methode === "POST" ? accuse(["mh3k2x9a-4fzq1w"]) : undefined;

  it("GANTT_SECRET absent côté hub : 503, jamais 401, rien n'est lu ni écrit", async () => {
    vi.stubEnv("GANTT_SECRET", "");
    const r = await (methode === "GET" ? GET : POST)(requete(methode, bon, corps));
    expect(r.status).toBe(503);
    expect(moq.gestesEnAttente).not.toHaveBeenCalled();
    expect(moq.accuserGestes).not.toHaveBeenCalled();
  });

  it("sans secret ou avec un faux : 401, rien n'est lu ni écrit", async () => {
    for (const auth of [undefined, "Bearer faux", "Basic abc", SECRET]) {
      const r = await (methode === "GET" ? GET : POST)(requete(methode, auth, corps));
      expect(r.status).toBe(401);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
    expect(moq.gestesEnAttente).not.toHaveBeenCalled();
    expect(moq.accuserGestes).not.toHaveBeenCalled();
    expect(moq.assurerMigrations).not.toHaveBeenCalled();
  });

  it("compare le secret par memeJeton (temps constant)", async () => {
    await (methode === "GET" ? GET : POST)(requete(methode, bon, corps));
    expect(moq.memeJeton).toHaveBeenCalled();
  });

  it("sans base : 503", async () => {
    moq.baseConfiguree.mockReturnValue(false);
    expect((await (methode === "GET" ? GET : POST)(requete(methode, bon, corps))).status).toBe(503);
  });

  it("limite de débit : 429 au-delà de 30 par minute pour un même client", async () => {
    const statuts: number[] = [];
    const client = `10.5.9.${methode === "GET" ? 1 : 2}`;
    for (let i = 0; i < 31; i++) {
      statuts.push((await (methode === "GET" ? GET : POST)(requete(methode, bon, corps, client))).status);
    }
    expect(statuts.at(-1)).toBe(429);
    expect(statuts.slice(0, 30).every((s) => s === 200)).toBe(true);
  });
});

describe("GET /api/chantier/gestes/pc", () => {
  it("rend les gestes en attente, sans cache, et ne marque rien", async () => {
    const r = await GET(requete("GET", bon));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ ok: true, gestes: [GESTE] });
    expect(moq.assurerMigrations).toHaveBeenCalledOnce();
    expect(moq.accuserGestes).not.toHaveBeenCalled();
  });

  it("base en panne : 500, jamais une liste vide qui la cache", async () => {
    moq.gestesEnAttente.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(requete("GET", bon))).status).toBe(500);
  });
});

describe("POST /api/chantier/gestes/pc", () => {
  it("accuse les identifiants et rend ceux réellement pris", async () => {
    moq.accuserGestes.mockResolvedValue(["mh3k2x9a-4fzq1w"]);
    const r = await POST(requete("POST", bon, accuse(["mh3k2x9a-4fzq1w", "inconnu-123456"])));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, pris: ["mh3k2x9a-4fzq1w"] });
    expect(moq.accuserGestes).toHaveBeenCalledWith(["mh3k2x9a-4fzq1w", "inconnu-123456"]);
  });

  it("corps illisible : 400 ; hors contrat : 422 ; rien n'est écrit", async () => {
    expect((await POST(requete("POST", bon, "{pas du json"))).status).toBe(400);
    for (const mauvais of [accuse([]), accuse("x"), accuse([1]), accuse(["BAD ID"]), JSON.stringify({ ids: ["mh3k2x9a-4fzq1w"], en_plus: 1 }), "[]"]) {
      expect((await POST(requete("POST", bon, mauvais))).status).toBe(422);
    }
    expect(moq.accuserGestes).not.toHaveBeenCalled();
  });

  it("corps trop gros : 413, annoncé ou non", async () => {
    const gros = "x".repeat(TAILLE_MAX_ACCUSE + 1);
    expect((await POST(requete("POST", bon, gros))).status).toBe(413);
    const menteur = requete("POST", bon, "{}");
    menteur.headers.set("content-length", String(TAILLE_MAX_ACCUSE + 1));
    expect((await POST(menteur)).status).toBe(413);
    expect(moq.accuserGestes).not.toHaveBeenCalled();
  });

  it("base en panne : 500", async () => {
    moq.accuserGestes.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(requete("POST", bon, accuse(["mh3k2x9a-4fzq1w"])))).status).toBe(500);
  });
});
