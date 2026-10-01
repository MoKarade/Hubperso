// tests/sante.test.ts — GET /api/sante : santé publique pour la vigie de l'Atelier.
//
// Même patron que JobAI#49 et BatchChef#154. Quatre cas :
//   - `DATABASE_URL` absent (VRAI `lib/db`) → 503 { ok: false, cause: "base" } ;
//   - base joignable (Postgres en mémoire, PGlite, à la place de Neon) → 200 { ok: true } ;
//   - base qui refuse la requête → 503, même corps, détail seulement au journal serveur ;
//   - base joignable mais variable REQUISE absente → 503 { ok: false, cause: "configuration" },
//     les NOMS manquants seulement au journal serveur, jamais dans la réponse (F7).
//
// Dans aucun cas le corps ne porte un nom de variable, une valeur ou un message brut.

import { afterEach, describe, expect, it, vi } from "vitest";
import { VARIABLES_ATTENDUES } from "../lib/variablesAttendues";

const NO_STORE = "no-store";
const TEMOIN = "VALEUR-TEMOIN-NE-DOIT-PAS-SORTIR";
const NOMS = VARIABLES_ATTENDUES.map((v) => v.nom);

/** Aucun nom de variable attendue, aucune valeur témoin, aucun mot de connexion. */
function verifierCorpsMuet(corps: string) {
  expect(corps).not.toMatch(/neon|postgres|manquant|refus/i);
  expect(corps).not.toContain(TEMOIN);
  for (const nom of NOMS) expect(corps, `le corps nomme ${nom}`).not.toContain(nom);
}

let ip = 0;
/** Une requête de la vigie ; chaque test a son propre client, la limite ne s'y mélange pas. */
function requete(client = `10.0.0.${++ip}`): Request {
  return new Request("https://hubperso.com/api/sante", { headers: { "x-real-ip": client } });
}

/** Pose toutes les variables REQUISES avec la valeur témoin. */
function poserRequises(sauf: string[] = []) {
  for (const v of VARIABLES_ATTENDUES) {
    if (v.exigence === "requise" && !sauf.includes(v.nom)) vi.stubEnv(v.nom, TEMOIN);
  }
  for (const nom of sauf) vi.stubEnv(nom, "");
}

/** Remplace la base par un Postgres réel en mémoire, et neutralise les migrations Neon. */
function baseEnMemoire(execute?: () => Promise<unknown>) {
  vi.doMock("@/lib/db", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const db = drizzle(new PGlite());
    return {
      baseConfiguree: () => true,
      db: execute ? { execute } : db,
    };
  });
  vi.doMock("@/lib/migrations", () => ({ assurerMigrations: async () => {} }));
}

afterEach(() => {
  vi.doUnmock("@/lib/db");
  vi.doUnmock("@/lib/migrations");
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/sante — base non configurée (vrai lib/db)", () => {
  it('503 { ok: false, cause: "base" }, no-store, corps muet', async () => {
    poserRequises(["DATABASE_URL"]);
    const { GET } = await import("@/app/api/sante/route");
    const res = await GET(requete());
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe(NO_STORE);
    const corps = await res.text();
    expect(JSON.parse(corps)).toEqual({ ok: false, cause: "base" });
    verifierCorpsMuet(corps);
  });
});

describe("GET /api/sante — base réelle en mémoire (PGlite)", () => {
  it("200 { ok: true }, no-store, quand base et variables requises sont là", async () => {
    poserRequises();
    baseEnMemoire();
    const { GET } = await import("@/app/api/sante/route");
    const res = await GET(requete());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(NO_STORE);
    const corps = await res.text();
    expect(JSON.parse(corps)).toEqual({ ok: true });
    verifierCorpsMuet(corps);
  });

  it("une base qui refuse : 503 base, le détail part au journal serveur seulement", async () => {
    poserRequises();
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    baseEnMemoire(async () => {
      throw new Error(`connexion refusée postgres://${TEMOIN}@neon`);
    });
    const { GET } = await import("@/app/api/sante/route");
    const res = await GET(requete());
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe(NO_STORE);
    const corps = await res.text();
    expect(JSON.parse(corps)).toEqual({ ok: false, cause: "base" });
    verifierCorpsMuet(corps);
    expect(journal).toHaveBeenCalled();
  });

  it('variable requise absente : 503 { ok: false, cause: "configuration" }, noms au journal seulement', async () => {
    poserRequises(["GOOGLE_CLIENT_SECRET"]);
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    baseEnMemoire();
    const { GET } = await import("@/app/api/sante/route");
    const res = await GET(requete());
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe(NO_STORE);
    const corps = await res.text();
    expect(JSON.parse(corps)).toEqual({ ok: false, cause: "configuration" });
    verifierCorpsMuet(corps);
    // Le journal serveur nomme la variable (pour que Marc sache quoi poser sur Vercel)…
    const journalise = journal.mock.calls.flat().map(String).join(" ");
    expect(journalise).toContain("GOOGLE_CLIENT_SECRET");
    // … mais jamais une valeur, même là.
    expect(journalise).not.toContain(TEMOIN);
  });

  it("limite de débit : au 11e appel d'un même client dans la minute, 429 SANS toucher la base", async () => {
    poserRequises();
    const execute = vi.fn(async () => undefined);
    baseEnMemoire(execute);
    const { GET } = await import("@/app/api/sante/route");
    const client = "192.0.2.10";
    for (let i = 0; i < 10; i++) expect((await GET(requete(client))).status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(10);
    const res = await GET(requete(client));
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe(NO_STORE);
    verifierCorpsMuet(await res.text());
    expect(execute).toHaveBeenCalledTimes(10);
    // Un autre client n'est pas pénalisé.
    expect((await GET(requete("192.0.2.11"))).status).toBe(200);
  });

  it("une variable OPTIONNELLE absente ne rend pas la sonde rouge", async () => {
    poserRequises();
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("HUB_TOKEN_CARAI", "");
    baseEnMemoire();
    const { GET } = await import("@/app/api/sante/route");
    const res = await GET(requete());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
