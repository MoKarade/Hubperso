// tests/chantierRattrapageRoute.test.ts — GET /api/chantier/rattrapage, le rattrapage GitHub lu par le hub à l'ouverture de la page.
//
// Ce qu'on éprouve : session absente → 401 et RIEN n'est lu ; invité → 404 ; `depuis` illisible → 400 ; sans jeton → 503 « non branché »
// SANS aucun appel réseau ; avec jeton : l'état rendu, gardé 5 minutes en mémoire ; panne → 500 sans fuite du message ni du jeton ; 429.

import { beforeEach, describe, expect, it, vi } from "vitest";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  assurerMigrations: vi.fn(async () => {}),
  aAcces: vi.fn(),
  estProprietaire: vi.fn(),
  rattraper: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: moq.assurerMigrations }));
vi.mock("@/lib/personnes", () => ({ APP_HUB: "hubperso", aAcces: moq.aAcces, estProprietaire: moq.estProprietaire }));
vi.mock("@/lib/chantierRattrapage", () => ({ rattraper: moq.rattraper }));

let ip = 0;
const requete = (query = "") => new Request(`https://hubperso.com/api/chantier/rattrapage${query}`, { headers: { "x-real-ip": `10.8.0.${++ip}` } });
const RESULTAT = { evenements: [{ id: "snap:hub#5:x" }], incomplets: [], erreurs: [] };

// La mémoire de 5 minutes vit dans le module : chaque test le recharge pour repartir à vide.
async function route() {
  vi.resetModules();
  return (await import("@/app/api/chantier/rattrapage/route")).GET;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const m of Object.values(moq)) m.mockReset();
  moq.auth.mockResolvedValue({ user: { email: "marc@example.test" } });
  moq.assurerMigrations.mockResolvedValue(undefined);
  moq.aAcces.mockResolvedValue(true);
  moq.estProprietaire.mockReturnValue(true);
  moq.rattraper.mockResolvedValue(RESULTAT);
  vi.stubEnv("CHANTIER_GITHUB_TOKEN", "ghp_secret_de_test");
});

describe("GET /api/chantier/rattrapage", () => {
  it("sans session : 401, rien n'est lu", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await (await route())(requete());
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(moq.rattraper).not.toHaveBeenCalled();
  });

  it("session sans accès au hub : 401 ; invité du hub : 404, rien n'est lu", async () => {
    const GET = await route();
    moq.aAcces.mockResolvedValue(false);
    expect((await GET(requete())).status).toBe(401);
    moq.aAcces.mockResolvedValue(true);
    moq.estProprietaire.mockReturnValue(false);
    expect((await GET(requete())).status).toBe(404);
    expect(moq.rattraper).not.toHaveBeenCalled();
  });

  it("`depuis` illisible : 400", async () => {
    expect((await (await route())(requete("?depuis=hier"))).status).toBe(400);
    expect(moq.rattraper).not.toHaveBeenCalled();
  });

  it("sans jeton : 503 « non branché », aucun appel réseau", async () => {
    vi.stubEnv("CHANTIER_GITHUB_TOKEN", "");
    const fetchEspion = vi.spyOn(globalThis, "fetch");
    const r = await (await route())(requete());
    expect(r.status).toBe(503);
    expect((await r.json()).message).toContain("Non branché");
    expect(moq.rattraper).not.toHaveBeenCalled();
    expect(fetchEspion).not.toHaveBeenCalled();
    fetchEspion.mockRestore();
  });

  it("avec jeton : l'état rendu, avec l'heure de lecture ; relu depuis la mémoire pendant 5 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T22:00:00Z"));
    try {
      const GET = await route();
      const r = await GET(requete());
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true, ...RESULTAT, lu_le: "2026-10-28T22:00:00.000Z" });
      expect(moq.rattraper).toHaveBeenCalledTimes(1);
      expect(moq.rattraper.mock.calls[0]![0]).toMatchObject({ depuis: null });
      vi.setSystemTime(new Date("2026-10-28T22:04:59Z"));
      await GET(requete());
      expect(moq.rattraper).toHaveBeenCalledTimes(1);
      vi.setSystemTime(new Date("2026-10-28T22:05:01Z"));
      await GET(requete());
      expect(moq.rattraper).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("une panne : 500 sans le message de l'erreur ni le jeton", async () => {
    moq.rattraper.mockRejectedValue(new Error("boom ghp_secret_de_test"));
    const r = await (await route())(requete());
    expect(r.status).toBe(500);
    const texte = await r.text();
    expect(texte).not.toContain("boom");
    expect(texte).not.toContain("ghp_secret");
  });

  it("trop de lectures de suite : 429", async () => {
    const GET = await route();
    const mm = "10.8.1.1";
    const r = () => GET(new Request("https://hubperso.com/api/chantier/rattrapage", { headers: { "x-real-ip": mm } }));
    for (let i = 0; i < 6; i += 1) expect((await r()).status).toBe(200);
    expect((await r()).status).toBe(429);
  });
});
