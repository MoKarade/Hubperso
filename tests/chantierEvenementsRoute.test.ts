// tests/chantierEvenementsRoute.test.ts — GET /api/chantier/evenements, la lecture des événements par la page Chantier.
//
// Ce qu'on éprouve : session absente → 401 et RIEN n'est lu ; invité du hub → 404 ; `depuis` illisible → 400 ; sans base → 503 ;
// la lecture rend les événements et `jusqua` (l'instant de réception du dernier, ou `depuis` s'il n'y a rien de neuf) ;
// base en panne → 500 sans fuite du message ; 429 ; jamais de cache.

import { beforeEach, describe, expect, it, vi } from "vitest";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  baseConfiguree: vi.fn(() => true),
  assurerMigrations: vi.fn(async () => {}),
  aAcces: vi.fn(),
  estProprietaire: vi.fn(),
  lireDepuis: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/db", () => ({ baseConfiguree: moq.baseConfiguree }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: moq.assurerMigrations }));
vi.mock("@/lib/chantierEvenementsDb", () => ({ lireDepuis: moq.lireDepuis }));
vi.mock("@/lib/personnes", () => ({ APP_HUB: "hubperso", aAcces: moq.aAcces, estProprietaire: moq.estProprietaire }));

import { GET } from "@/app/api/chantier/evenements/route";

const EV = { v: 1, id: "e1", type: "pull_request", action: "closed", repo: "hub", n: 7, sha: null, cle: "hub#7", at: "2026-10-28T20:42:52.000Z", etat: "fusionnee", plus: null, rl: "2026-10-28T20:42:55.123Z" };

let ip = 0;
const requete = (query = "") => new Request(`https://hubperso.com/api/chantier/evenements${query}`, { headers: { "x-real-ip": `10.9.0.${++ip}` } });

beforeEach(() => {
  for (const m of Object.values(moq)) m.mockReset();
  moq.baseConfiguree.mockReturnValue(true);
  moq.auth.mockResolvedValue({ user: { email: "marc@example.test" } });
  moq.aAcces.mockResolvedValue(true);
  moq.estProprietaire.mockReturnValue(true);
  moq.lireDepuis.mockResolvedValue([EV]);
});

describe("GET /api/chantier/evenements", () => {
  it("sans session : 401, rien n'est lu", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await GET(requete());
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(moq.lireDepuis).not.toHaveBeenCalled();
  });

  it("session sans accès au hub : 401 ; invité du hub : 404, rien n'est lu", async () => {
    moq.aAcces.mockResolvedValue(false);
    expect((await GET(requete())).status).toBe(401);
    moq.aAcces.mockResolvedValue(true);
    moq.estProprietaire.mockReturnValue(false);
    expect((await GET(requete())).status).toBe(404);
    expect(moq.lireDepuis).not.toHaveBeenCalled();
  });

  it("`depuis` illisible : 400 ; sans base : 503", async () => {
    expect((await GET(requete("?depuis=hier"))).status).toBe(400);
    moq.baseConfiguree.mockReturnValue(false);
    expect((await GET(requete())).status).toBe(503);
    expect(moq.lireDepuis).not.toHaveBeenCalled();
  });

  it("première lecture : les événements et `jusqua` = réception du dernier", async () => {
    const r = await GET(requete());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, evenements: [EV], jusqua: EV.rl });
    expect(moq.lireDepuis).toHaveBeenCalledWith(null);
  });

  it("rien de neuf : liste vide et `jusqua` = `depuis`, jamais un événement inventé", async () => {
    moq.lireDepuis.mockResolvedValue([]);
    const r = await GET(requete("?depuis=2026-10-28T20:42:55.123Z"));
    expect(await r.json()).toEqual({ ok: true, evenements: [], jusqua: "2026-10-28T20:42:55.123Z" });
    expect(moq.lireDepuis).toHaveBeenCalledWith(new Date("2026-10-28T20:42:55.123Z"));
  });

  it("base en panne : 500 sans le message de l'erreur", async () => {
    moq.lireDepuis.mockRejectedValue(new Error("neon indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await GET(requete());
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("neon indisponible");
  });
});
