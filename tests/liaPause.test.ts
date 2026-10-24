// tests/liaPause.test.ts — la pause de LIA, gardée par le serveur du hub.
//
// Trois étages : le jugement du corps (pur), la base sur le VRAI schéma (PGlite + migrations RÉELLES de `drizzle/`, comme
// `tests/historiqueDb.test.ts`), puis la route `/api/lia/pause` et son garde (session, propriétaire). Le refus de
// `/api/lia/ask` pendant la pause est éprouvé dans `tests/liaAsk.test.ts`.

import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { liaReglages } from "../lib/db/schema";
import { lireCorpsPause, REPONSE_EN_PAUSE, TAILLE_MAX_CORPS_PAUSE } from "../lib/liaPause";

const porteur = vi.hoisted(() => ({ db: undefined as unknown, base: true }));
vi.mock("../lib/db", () => ({
  get db() {
    return porteur.db;
  },
  baseConfiguree: () => porteur.base,
}));

const moq = vi.hoisted(() => ({ auth: vi.fn(), aAcces: vi.fn() }));
vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: vi.fn(async () => {}) }));
vi.mock("@/lib/personnes", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/personnes")>();
  return { ...vrai, aAcces: moq.aAcces };
});

import { GET, PUT } from "@/app/api/lia/pause/route";
import { ecrirePause, lirePause } from "../lib/liaPauseDb";

const client = new PGlite();
const dbTest = drizzle(client);
porteur.db = dbTest;

beforeAll(async () => {
  await migrate(dbTest, { migrationsFolder: resolve(process.cwd(), "drizzle") });
});

describe("lireCorpsPause", () => {
  it("accepte exactement { pause: booléen }", () => {
    expect(lireCorpsPause('{"pause":true}')).toEqual({ ok: true, pause: true });
    expect(lireCorpsPause('{"pause":false}')).toEqual({ ok: true, pause: false });
  });

  it("refuse tout le reste, sans citer la valeur reçue", () => {
    const mauvais = [
      "", "pas du json", "null", "[]", "true", '"pause"', "{}",
      '{"pause":"true"}', '{"pause":1}', '{"pause":null}', '{"pause":true,"autre":1}', '{"Pause":true}',
    ];
    for (const m of mauvais) {
      const r = lireCorpsPause(m);
      expect(r.ok, m).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(400);
        expect(JSON.stringify(r)).not.toContain("true\"");
      }
    }
  });

  it("refuse un corps trop gros avant de le lire (413)", () => {
    const gros = `{"pause":true,"x":"${"a".repeat(TAILLE_MAX_CORPS_PAUSE)}"}`;
    const r = lireCorpsPause(gros);
    expect(r).toMatchObject({ ok: false, status: 413 });
  });
});

describe("REPONSE_EN_PAUSE", () => {
  it("est un 423 « paused », distinct du 503 « indisponible »", () => {
    expect(REPONSE_EN_PAUSE.status).toBe(423);
    expect(REPONSE_EN_PAUSE.corps.error).toBe("paused");
  });
});

describe("lirePause / ecrirePause (vrai schéma)", () => {
  beforeEach(async () => {
    porteur.base = true;
    porteur.db = dbTest;
    await dbTest.execute(sql`TRUNCATE TABLE ${liaReglages}`);
  });
  afterEach(() => {
    porteur.db = dbTest;
  });

  it("sans ligne : pas en pause, jamais modifiée", async () => {
    expect(await lirePause()).toEqual({ pause: false, modifieLe: null });
  });

  it("poser puis lever la pause se relit, sur UNE seule ligne", async () => {
    const posee = await ecrirePause(true);
    expect(posee).toMatchObject({ pause: true });
    expect(typeof (posee as { modifieLe: string }).modifieLe).toBe("string");
    expect(await lirePause()).toMatchObject({ pause: true });

    expect(await ecrirePause(false)).toMatchObject({ pause: false });
    expect(await lirePause()).toMatchObject({ pause: false });

    const lignes = await dbTest.select().from(liaReglages);
    expect(lignes).toHaveLength(1);
  });

  it("la contrainte de la table interdit une deuxième ligne", async () => {
    await expect(dbTest.insert(liaReglages).values({ id: 2, pause: true })).rejects.toThrow();
  });

  it("base illisible : « indisponible » (échec fermé), jamais « pas en pause »", async () => {
    await dbTest.execute(sql`ALTER TABLE ${liaReglages} RENAME TO lia_reglages_absente`);
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await lirePause()).toBe("indisponible");
      expect(await ecrirePause(true)).toBe("indisponible");
    } finally {
      await dbTest.execute(sql`ALTER TABLE lia_reglages_absente RENAME TO lia_reglages`);
      vi.restoreAllMocks();
    }
  });

  it("aucune base configurée : rien n'a pu être posé, donc pas en pause ; mais on ne peut rien écrire", async () => {
    porteur.base = false;
    expect(await lirePause()).toEqual({ pause: false, modifieLe: null });
    expect(await ecrirePause(true)).toBe("indisponible");
  });
});

let ip = 0;
const req = (methode: "GET" | "PUT", corps?: string) =>
  new Request("https://hubperso.com/api/lia/pause", {
    method: methode,
    headers: { "x-real-ip": `10.3.0.${++ip}` },
    ...(corps !== undefined && { body: corps }),
  });

describe("/api/lia/pause", () => {
  beforeEach(async () => {
    porteur.base = true;
    porteur.db = dbTest;
    await dbTest.execute(sql`TRUNCATE TABLE ${liaReglages}`);
    vi.stubEnv("AUTHORIZED_EMAIL", "marc@exemple.invalid");
    moq.auth.mockResolvedValue({ user: { email: "marc@exemple.invalid" } });
    moq.aAcces.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    moq.auth.mockReset();
    moq.aAcces.mockReset();
    vi.restoreAllMocks();
  });

  it("sans session : 401 en lecture comme en écriture, et rien n'est écrit", async () => {
    moq.auth.mockResolvedValue(null);
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await PUT(req("PUT", '{"pause":true}'))).status).toBe(401);
    expect(await dbTest.select().from(liaReglages)).toHaveLength(0);
  });

  it("session sans accès au hub : 401", async () => {
    moq.aAcces.mockResolvedValue(false);
    expect((await PUT(req("PUT", '{"pause":true}'))).status).toBe(401);
  });

  it("un invité du hub ne lit ni ne change la pause (403)", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@exemple.invalid" } });
    expect((await GET(req("GET"))).status).toBe(403);
    expect((await PUT(req("PUT", '{"pause":true}'))).status).toBe(403);
    expect(await dbTest.select().from(liaReglages)).toHaveLength(0);
  });

  it("le propriétaire pose, lit puis lève la pause ; jamais de cache", async () => {
    const lecture0 = await GET(req("GET"));
    expect(lecture0.status).toBe(200);
    expect(lecture0.headers.get("cache-control")).toBe("no-store");
    expect(await lecture0.json()).toEqual({ pause: false, modifieLe: null });

    const posee = await PUT(req("PUT", '{"pause":true}'));
    expect(posee.status).toBe(200);
    expect(posee.headers.get("cache-control")).toBe("no-store");
    expect(await posee.json()).toMatchObject({ pause: true });
    expect(await (await GET(req("GET"))).json()).toMatchObject({ pause: true });

    expect(await (await PUT(req("PUT", '{"pause":false}'))).json()).toMatchObject({ pause: false });
  });

  it("corps hors forme : 400 sans toucher à la base ; trop gros : 413", async () => {
    expect((await PUT(req("PUT", '{"pause":"oui"}'))).status).toBe(400);
    expect((await PUT(req("PUT", "x".repeat(TAILLE_MAX_CORPS_PAUSE + 1)))).status).toBe(413);
    expect(await dbTest.select().from(liaReglages)).toHaveLength(0);
  });

  it("base absente : 503, jamais un « pas en pause » inventé à l'écriture", async () => {
    porteur.base = false;
    expect((await PUT(req("PUT", '{"pause":true}'))).status).toBe(503);
  });
});
