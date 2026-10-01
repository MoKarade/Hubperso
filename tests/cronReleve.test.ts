// tests/cronReleve.test.ts — POST /api/cron/releve, l'horloge du hub.
//
// La décision pure (`decideCron`) est déjà couverte par tests/cronAuth.test.ts. Ici, c'est
// la ROUTE qu'on éprouve de bout en bout :
//   - CRON_SECRET absent → 503 (horloge désactivée), jamais 401 ;
//   - secret absent ou faux → 401, et rien n'est lu ni écrit ;
//   - secret correct : comparaison par `memeJeton` (temps constant), jamais `===` ;
//   - sans base → 503 ; avec base → migrations PUIS relevés PUIS élagage ;
//   - un échec d'écriture → 500 (jamais un 200 qui cache la panne du 15/09) ;
//   - limite de débit → 429 au-delà de 10 appels par minute et par client.
//
// Remplacés : la collecte des résumés (réseau), l'écriture en base, les migrations et la
// base. `memeJeton` reste le VRAI, simplement observé.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "secret-de-test-horloge-0123456789";

const moq = vi.hoisted(() => ({
  baseConfiguree: vi.fn(() => true),
  assurerMigrations: vi.fn(async () => {}),
  etatMigrations: vi.fn(() => ({ tentee: true, erreur: null as string | null })),
  fetchAllSummaries: vi.fn(),
  enregistrerReleve: vi.fn(),
  elaguerHistorique: vi.fn(async () => 0),
  memeJeton: vi.fn(),
  ordre: [] as string[],
}));

vi.mock("@/lib/db", () => ({ baseConfiguree: moq.baseConfiguree }));
vi.mock("@/lib/migrations", () => ({
  assurerMigrations: moq.assurerMigrations,
  etatMigrations: moq.etatMigrations,
}));
vi.mock("@/lib/fetchSummary", () => ({
  fetchAllSummaries: moq.fetchAllSummaries,
  TIMEOUT_CRON_MS: 20_000,
}));
vi.mock("@/lib/historiqueDb", () => ({
  enregistrerReleve: moq.enregistrerReleve,
  elaguerHistorique: moq.elaguerHistorique,
}));
vi.mock("@/lib/jetonApp", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/jetonApp")>();
  moq.memeJeton.mockImplementation(vrai.memeJeton);
  return { ...vrai, memeJeton: moq.memeJeton };
});

import { POST } from "@/app/api/cron/releve/route";

let ip = 0;
/** Chaque requête vient d'un client distinct : la limite de débit ne se mélange pas aux cas. */
function requete(authorization?: string, client = `10.0.0.${++ip}`): Request {
  const headers = new Headers({ "x-real-ip": client });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://hubperso.com/api/cron/releve", { method: "POST", headers });
}

function resultat(id: string, state = "ok") {
  return { source: { id }, state };
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  moq.ordre.length = 0;
  moq.assurerMigrations.mockImplementation(async () => {
    moq.ordre.push("migrations");
  });
  moq.fetchAllSummaries.mockImplementation(async () => {
    moq.ordre.push("collecte");
    return [resultat("financeai"), resultat("carai", "unreachable")];
  });
  moq.enregistrerReleve.mockResolvedValue("ecrit");
  moq.elaguerHistorique.mockImplementation(async () => {
    moq.ordre.push("elagage");
    return 3;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  moq.baseConfiguree.mockReset().mockReturnValue(true);
  moq.assurerMigrations.mockReset();
  moq.fetchAllSummaries.mockReset();
  moq.enregistrerReleve.mockReset();
  moq.elaguerHistorique.mockReset();
  moq.memeJeton.mockClear();
});

function rienLuNiEcrit() {
  expect(moq.assurerMigrations).not.toHaveBeenCalled();
  expect(moq.fetchAllSummaries).not.toHaveBeenCalled();
  expect(moq.enregistrerReleve).not.toHaveBeenCalled();
  expect(moq.elaguerHistorique).not.toHaveBeenCalled();
}

describe("POST /api/cron/releve — authentification", () => {
  it("CRON_SECRET absent côté serveur : 503, horloge désactivée, rien lu ni écrit", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
    rienLuNiEcrit();
  });

  it("sans en-tête Authorization : 401, rien lu ni écrit", async () => {
    const res = await POST(requete());
    expect(res.status).toBe(401);
    rienLuNiEcrit();
  });

  it("secret faux : 401, et le corps ne renvoie jamais le secret attendu", async () => {
    const res = await POST(requete("Bearer mauvais-secret"));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(SECRET);
    rienLuNiEcrit();
  });

  it("secret correct sans « Bearer » : 401", async () => {
    const res = await POST(requete(SECRET));
    expect(res.status).toBe(401);
    rienLuNiEcrit();
  });

  it("le secret est comparé par memeJeton (temps constant), jamais par ===", async () => {
    await POST(requete("Bearer presque-" + SECRET));
    expect(moq.memeJeton).toHaveBeenCalled();
    moq.memeJeton.mockClear();
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(moq.memeJeton).toHaveBeenCalledWith(SECRET, SECRET);
  });
});

describe("POST /api/cron/releve — relevé", () => {
  it("sans base : 503, aucune migration ni collecte", async () => {
    moq.baseConfiguree.mockReturnValue(false);
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    rienLuNiEcrit();
  });

  it("succès : migrations, puis collecte, puis un relevé par app, puis élagage", async () => {
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(moq.ordre).toEqual(["migrations", "collecte", "elagage"]);
    expect(moq.enregistrerReleve).toHaveBeenCalledTimes(2);
    expect(moq.fetchAllSummaries.mock.calls[0]![2]).toBe(20_000);
    const corps = await res.json();
    expect(corps).toMatchObject({ ok: true, ecrits: 2, elagues: 3 });
    expect(corps.releves).toEqual([
      { appId: "financeai", etat: "ok", issue: "ecrit" },
      { appId: "carai", etat: "unreachable", issue: "ecrit" },
    ]);
    expect(corps.raison).toBeUndefined();
  });

  it("rien d'écrit par espacement : 200 avec la raison, jamais un échec", async () => {
    moq.enregistrerReleve.mockResolvedValue("espace");
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps.ok).toBe(true);
    expect(corps.ecrits).toBe(0);
    expect(corps.raison).toMatch(/espacement/);
  });

  it("un échec d'écriture : 500 avec l'état des migrations (la panne du 15/09 ne se cache plus)", async () => {
    moq.enregistrerReleve.mockResolvedValueOnce("ecrit").mockResolvedValueOnce("echec");
    moq.etatMigrations.mockReturnValue({ tentee: true, erreur: "schéma absent" });
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    const corps = await res.json();
    expect(corps).toMatchObject({ ok: false, ecrits: 1, echecs: 1 });
    expect(corps.migrations).toEqual({ tentee: true, erreur: "schéma absent" });
  });
});

describe("POST /api/cron/releve — limite de débit", () => {
  it("au-delà de 10 appels par minute pour un même client : 429, avant toute vérification", async () => {
    const client = "192.0.2.77";
    for (let i = 0; i < 10; i++) {
      expect((await POST(requete("Bearer faux", client))).status).toBe(401);
    }
    moq.memeJeton.mockClear();
    const res = await POST(requete(`Bearer ${SECRET}`, client));
    expect(res.status).toBe(429);
    expect(moq.memeJeton).not.toHaveBeenCalled();
    rienLuNiEcrit();
  });
});
