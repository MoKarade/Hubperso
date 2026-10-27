// tests/chantierGestesRoute.test.ts — POST /api/chantier/gestes.
//
// Ce qu'on éprouve : sans session 401 et RIEN n'est écrit ; invité du hub 404 ; une demande qui ne vient pas de
// notre page 403 ; corps hors contrat refusé avant toute écriture ; un `id` déjà reçu ne crée pas de seconde ligne ;
// base en panne : 503, jamais un « déposé » mensonger.

import { beforeEach, describe, expect, it, vi } from "vitest";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  deposerGeste: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/chantierGestesDb", () => ({ deposerGeste: moq.deposerGeste }));

import { POST } from "@/app/api/chantier/gestes/route";

const PROPRIETAIRE = "proprio@example.test";
const GESTE = { v: 1, id: "mh3k2x9a-4fzq1w", ref: "Org/depot#12", geste: "fusionner", texte: null, quand: "2026-10-27T10:00:00.000Z" };

let ip = 0;
/** Chaque requête vient d'un client distinct : la limite de débit ne se mélange pas aux cas. */
function requete(corps: unknown = GESTE, entetes: Record<string, string> = {}, client = `10.4.0.${++ip}`) {
  return new Request("https://www.hubperso.com/api/chantier/gestes", {
    method: "POST",
    headers: { "x-real-ip": client, origin: "https://www.hubperso.com", host: "www.hubperso.com", ...entetes },
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
  });
}

beforeEach(() => {
  moq.auth.mockReset();
  moq.deposerGeste.mockReset();
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
  moq.deposerGeste.mockResolvedValue({ nouveau: true });
});

describe("POST /api/chantier/gestes", () => {
  it("sans session : 401, rien n'est écrit", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await POST(requete());
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(moq.deposerGeste).not.toHaveBeenCalled();
  });

  it("un invité du hub : 404, pas 403, rien n'est écrit", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@example.test" } });
    expect((await POST(requete())).status).toBe(404);
    expect(moq.deposerGeste).not.toHaveBeenCalled();
  });

  it("une demande qui ne vient pas de notre page : 403, rien n'est écrit", async () => {
    expect((await POST(requete(GESTE, { origin: "https://autre.exemple" }))).status).toBe(403);
    const sansOrigine = new Request("https://www.hubperso.com/api/chantier/gestes", {
      method: "POST",
      headers: { "x-real-ip": "10.4.9.9", host: "www.hubperso.com" },
      body: JSON.stringify(GESTE),
    });
    expect((await POST(sansOrigine)).status).toBe(403);
    expect(moq.deposerGeste).not.toHaveBeenCalled();
  });

  it("un corps illisible : 400 ; trop gros : 413 ; hors contrat : 422, rien n'est écrit", async () => {
    expect((await POST(requete("pas du json"))).status).toBe(400);
    expect((await POST(requete(`{"x":"${"a".repeat(5000)}"}`))).status).toBe(413);
    const r = await POST(requete({ ...GESTE, geste: "supprimer" }));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: "invalid", message: "geste : fusionner, fait, reponse" });
    expect(moq.deposerGeste).not.toHaveBeenCalled();
  });

  it("un geste valide : 201 et la ligne est déposée telle que validée", async () => {
    const r = await POST(requete());
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, id: GESTE.id, nouveau: true });
    expect(moq.deposerGeste).toHaveBeenCalledWith(GESTE);
  });

  it("un `id` déjà reçu : 200, « nouveau: false »", async () => {
    moq.deposerGeste.mockResolvedValue({ nouveau: false });
    const r = await POST(requete());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: GESTE.id, nouveau: false });
  });

  it("la base en panne : 503, jamais « déposé »", async () => {
    moq.deposerGeste.mockRejectedValue(new Error("connexion refusée"));
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await POST(requete());
    expect(r.status).toBe(503);
    expect((await r.json()).ok).toBeUndefined();
    erreurs.mockRestore();
  });

  it("au-delà de 20 par minute pour un même client : 429", async () => {
    for (let i = 0; i < 20; i++) expect((await POST(requete(GESTE, {}, "10.4.8.8"))).status).toBe(201);
    expect((await POST(requete(GESTE, {}, "10.4.8.8"))).status).toBe(429);
  });
});
