// tests/chantierCoutsRoute.test.ts — GET /api/chantier/couts, qui remplace la page `/couts`.
//
// Ce qu'on éprouve : sans session 401 et AUCUN fetch d'app (les jetons ne partent pas) ; invité du hub 404
// (même sans accès à rien, il n'apprend pas que la route existe) ; propriétaire 200 avec les totaux par
// période, `no-store` ; 429.

import { beforeEach, describe, expect, it, vi } from "vitest";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  fetchAllSummaries: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/fetchSummary", () => ({ fetchAllSummaries: moq.fetchAllSummaries }));
vi.mock("@/lib/sources", () => ({ getSources: () => [] }));

import { GET } from "@/app/api/chantier/couts/route";

const PROPRIETAIRE = "proprio@example.test";

let ip = 0;
/** Chaque requête vient d'un client distinct : la limite de débit ne se mélange pas aux cas. */
const requete = (client = `10.3.0.${++ip}`) =>
  new Request("https://hubperso.com/api/chantier/couts", { headers: { "x-real-ip": client } });

beforeEach(() => {
  moq.auth.mockReset();
  moq.fetchAllSummaries.mockReset();
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
  moq.fetchAllSummaries.mockResolvedValue([
    {
      state: "ok",
      source: { id: "a", name: "a" },
      summary: {
        app: { id: "a", name: "A" },
        usage: { cost: { amount: 12.5, currency: "CAD", period: "mois" } },
      },
    },
  ]);
});

describe("GET /api/chantier/couts", () => {
  it("sans session : 401, et aucune app n'est interrogée (les jetons ne partent pas)", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await GET(requete());
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(moq.fetchAllSummaries).not.toHaveBeenCalled();
  });

  it("session sans adresse : 401", async () => {
    moq.auth.mockResolvedValue({ user: {} });
    expect((await GET(requete())).status).toBe(401);
    expect(moq.fetchAllSummaries).not.toHaveBeenCalled();
  });

  it("un invité du hub : 404, pas 403, et aucune app n'est interrogée", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@example.test" } });
    const r = await GET(requete());
    expect(r.status).toBe(404);
    expect(moq.fetchAllSummaries).not.toHaveBeenCalled();
  });

  it("sans AUTHORIZED_EMAIL configuré, personne n'est propriétaire (échec fermé)", async () => {
    vi.stubEnv("AUTHORIZED_EMAIL", "");
    const r = await GET(requete());
    expect(r.status).toBe(404);
  });

  it("le propriétaire : 200, les totaux par période, no-store", async () => {
    const r = await GET(requete());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const corps = await r.json();
    expect(corps.totaux).toEqual([{ periode: "ce mois-ci", cad: 12.5, apps: 1 }]);
    expect(corps.detail[0]).toMatchObject({ nom: "A", enLigne: true, suivie: true });
    expect(moq.fetchAllSummaries).toHaveBeenCalledTimes(1);
  });

  it("trop vite : 429 avant toute lecture", async () => {
    const client = "10.3.9.9";
    for (let i = 0; i < 6; i++) expect((await GET(requete(client))).status).toBe(200);
    moq.fetchAllSummaries.mockClear();
    const r = await GET(requete(client));
    expect(r.status).toBe(429);
    expect(moq.fetchAllSummaries).not.toHaveBeenCalled();
  });
});
