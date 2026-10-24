// tests/liaEtatPartage.test.ts — l'état partagé de LIA (Hubperso#433) : une seule LIA, un seul état, gardé par MemoryAI.
//
// Le module pur juge ce qui passe dans les deux sens ; la route ne fait que le relais derrière la session du hub.
// Prouve : 401 sans session (aucun appel à MemoryAI), 403 pour un invité, 503 sans jeton, relais des statuts
// (200 / 204 / 409 / 400 / 413 / 503), corps de la page ou réponse de MemoryAI hors contrat refusés, aucun jeton dans
// une réponse, jamais de cache, et que la route ne devient jamais publique.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENVIES_DEPART } from "@mokarade/lia-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROPRIETAIRE = "proprietaire@exemple.test";
const JETON = "jeton-memoryai-de-test-0123456789";

const moq = vi.hoisted(() => ({ auth: vi.fn(), aAcces: vi.fn() }));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: vi.fn(async () => undefined) }));
vi.mock("@/lib/personnes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/personnes")>()),
  aAcces: moq.aAcces,
}));

import { GET, PUT } from "../app/api/lia/etat/route";
import { isPublicPath } from "../lib/authGuard";
import { TAILLE_MAX_ETAT, lireCorpsEtat, relayerReponse } from "../lib/liaEtatPartage";
import { SOURCE_DEFS } from "../lib/sources";

const memoire = SOURCE_DEFS.find((d) => d.id === "memoryai")!;

/** Un état conforme au contrat du paquet (humeur d'une des 40, aucune donnée de Marc). */
const ETAT = {
  version: 3,
  maj: 1_792_800_000_000,
  envies: ENVIES_DEPART,
  journal: [],
  lente: {},
  humeur: "neutre",
  relances: { jour: "2026-10-24", n: 0 },
};
const ETAT_PLUS_RECENT = { ...ETAT, version: 9, maj: ETAT.maj + 60_000 };

const get = () => GET(new Request("https://www.hubperso.com/api/lia/etat"));
const put = (corps: string) =>
  PUT(new Request("https://www.hubperso.com/api/lia/etat", { method: "PUT", body: corps }));

const reponseJson = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });

let appel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  vi.stubEnv(memoire.tokenEnv, JETON);
  moq.auth.mockReset();
  moq.aAcces.mockReset();
  moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
  moq.aAcces.mockResolvedValue(true);
  appel = vi.fn(async () => reponseJson(ETAT));
  vi.stubGlobal("fetch", appel);
});

describe("lireCorpsEtat : ce que la page écrit", () => {
  it("rend l'état nettoyé quand il est conforme, sans les clés inconnues", () => {
    const lu = lireCorpsEtat(JSON.stringify({ ...ETAT, intrus: "x" }));
    expect(lu).toEqual({ ok: true, etat: ETAT });
  });

  it("refuse en 413 un corps trop gros, avant même de le lire comme du JSON", () => {
    const lu = lireCorpsEtat("x".repeat(TAILLE_MAX_ETAT + 1));
    expect(lu).toMatchObject({ ok: false, status: 413 });
  });

  it("refuse en 400 un JSON illisible, un état hors contrat et une humeur inconnue, sans citer la valeur", () => {
    for (const brut of ["pas du json", "[]", JSON.stringify({ ...ETAT, version: "3" }), JSON.stringify({ ...ETAT, humeur: 12 })]) {
      const lu = lireCorpsEtat(brut);
      expect(lu).toMatchObject({ ok: false, status: 400 });
      if (!lu.ok) expect(lu.message).not.toContain("pas du json");
    }
  });
});

describe("relayerReponse : ce que MemoryAI répond", () => {
  it("GET 200 rend l'état valide, 204 rend 204 sans corps", () => {
    expect(relayerReponse("GET", 200, JSON.stringify(ETAT))).toEqual({ status: 200, corps: ETAT });
    expect(relayerReponse("GET", 204, "")).toEqual({ status: 204, corps: null });
  });

  it("PUT 200 rend l'état gardé ; PUT 409 rend l'état plus récent de MemoryAI", () => {
    expect(relayerReponse("PUT", 200, JSON.stringify(ETAT))).toEqual({ status: 200, corps: ETAT });
    expect(relayerReponse("PUT", 409, JSON.stringify(ETAT_PLUS_RECENT))).toEqual({ status: 409, corps: ETAT_PLUS_RECENT });
  });

  it("PUT 409 sans état exploitable (ligne abîmée) reste un 409 sans état : LIA garde le sien", () => {
    expect(relayerReponse("PUT", 409, JSON.stringify({ error: "version_depassee" }))).toEqual({
      status: 409,
      corps: { error: "version_depassee" },
    });
  });

  it("PUT 400 et 413 passent tels quels, sans le message de MemoryAI", () => {
    expect(relayerReponse("PUT", 400, "n'importe quoi").status).toBe(400);
    expect(relayerReponse("PUT", 413, "").status).toBe(413);
  });

  it("un 200 hors contrat ou illisible devient 503, jamais réparé", () => {
    expect(relayerReponse("GET", 200, JSON.stringify({ ...ETAT, version: "x" })).status).toBe(503);
    expect(relayerReponse("GET", 200, "<html>").status).toBe(503);
    expect(relayerReponse("PUT", 200, "").status).toBe(503);
  });

  it("503 (mémoire gelée), 401, 403 et tout autre statut deviennent 503 : la page n'apprend pas pourquoi", () => {
    for (const statut of [401, 403, 404, 500, 503]) {
      const r = relayerReponse("GET", statut, JSON.stringify({ message: "secret interne" }));
      expect(r.status).toBe(503);
      expect(JSON.stringify(r.corps)).not.toContain("secret interne");
    }
  });
});

describe("GET /api/lia/etat", () => {
  it("401 sans session, et n'appelle pas MemoryAI", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await get();
    expect(r.status).toBe(401);
    expect(appel).not.toHaveBeenCalled();
  });

  it("401 pour une personne connectée qui n'a pas l'accès au hub, sans appel", async () => {
    moq.aAcces.mockResolvedValue(false);
    expect((await get()).status).toBe(401);
    expect(appel).not.toHaveBeenCalled();
  });

  it("403 pour un invité du hub, sans appel : l'état de LIA est celui de Marc", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@exemple.test" } });
    const r = await get();
    expect(r.status).toBe(403);
    expect(appel).not.toHaveBeenCalled();
  });

  it("503 sans jeton pour MemoryAI, sans appel", async () => {
    vi.stubEnv(memoire.tokenEnv, "");
    const r = await get();
    expect(r.status).toBe(503);
    expect(appel).not.toHaveBeenCalled();
  });

  it("propriétaire : appelle MemoryAI avec le jeton existant et l'en-tête propriétaire, rend 200 et l'état, no-store", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual(ETAT);
    const [url, init] = appel.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${memoire.accueilUrl}/api/etat-lia`);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({ "x-hub-token": JETON, "x-lia-proprietaire": "1" });
  });

  it("204 quand MemoryAI n'a aucun état", async () => {
    appel.mockResolvedValue(new Response(null, { status: 204 }));
    const r = await get();
    expect(r.status).toBe(204);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toBe("");
  });

  it("503 quand MemoryAI est injoignable, sans le jeton dans la réponse", async () => {
    appel.mockRejectedValue(new Error(`connexion refusée ${JETON}`));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await get();
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain(JETON);
  });

  it("aucune réponse, quel que soit le statut de MemoryAI, ne contient le jeton", async () => {
    for (const reponse of [
      reponseJson(ETAT),
      reponseJson({ error: "x", jeton: JETON }, 401),
      new Response(JETON, { status: 500 }),
      reponseJson({ ...ETAT, humeur: JETON }),
    ]) {
      appel.mockResolvedValueOnce(reponse);
      const r = await get();
      expect(await r.text()).not.toContain(JETON);
    }
  });
});

describe("PUT /api/lia/etat", () => {
  it("401 sans session et 403 pour un invité, sans appel", async () => {
    moq.auth.mockResolvedValue(null);
    expect((await put(JSON.stringify(ETAT))).status).toBe(401);
    moq.auth.mockResolvedValue({ user: { email: "invite@exemple.test" } });
    expect((await put(JSON.stringify(ETAT))).status).toBe(403);
    expect(appel).not.toHaveBeenCalled();
  });

  it("refuse un corps hors contrat (400) ou trop gros (413) sans appeler MemoryAI", async () => {
    expect((await put("pas du json")).status).toBe(400);
    expect((await put(JSON.stringify({ ...ETAT, humeur: 1 }))).status).toBe(400);
    expect((await put("x".repeat(TAILLE_MAX_ETAT + 1))).status).toBe(413);
    expect(appel).not.toHaveBeenCalled();
  });

  it("relaie l'état nettoyé (sans les clés inconnues) avec le jeton, et rend l'état gardé", async () => {
    const r = await put(JSON.stringify({ ...ETAT, intrus: "x" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(ETAT);
    const [url, init] = appel.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${memoire.accueilUrl}/api/etat-lia`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual(ETAT);
    expect(init.headers).toMatchObject({
      "x-hub-token": JETON,
      "x-lia-proprietaire": "1",
      "content-type": "application/json",
    });
  });

  it("409 : rend l'état plus récent que MemoryAI garde, pour que la page l'adopte", async () => {
    appel.mockResolvedValue(reponseJson(ETAT_PLUS_RECENT, 409));
    const r = await put(JSON.stringify(ETAT));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual(ETAT_PLUS_RECENT);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("503 quand la mémoire est gelée : LIA garde son état local", async () => {
    appel.mockResolvedValue(reponseJson({ error: "gelee", message: "interne" }, 503));
    const r = await put(JSON.stringify(ETAT));
    expect(r.status).toBe(503);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

describe("la route reste derrière le garde du hub, sans jeton côté client", () => {
  it("n'est jamais laissée passer par le garde (ni elle ni un préfixe)", () => {
    expect(isPublicPath("/api/lia/etat")).toBe(false);
    expect(isPublicPath("/api/lia/etat/")).toBe(false);
  });

  it("n'est pas dans le matcher du middleware (aucune exclusion de plus)", () => {
    const mw = readFileSync(resolve(process.cwd(), "middleware.ts"), "utf8");
    expect(/matcher:\s*\[[^\]]*lia/.test(mw)).toBe(false);
  });

  it("la page la monte par etatHttp, sans jeton ni en-tête écrit à la main", () => {
    const boot = readFileSync(resolve(process.cwd(), "components/LiaBoot.tsx"), "utf8");
    expect(boot).toContain('import { etatHttp } from "@mokarade/lia-ui/etat-http"');
    expect(boot).toContain('etatHttp("/api/lia/etat")');
    expect(boot).not.toMatch(/HUB_TOKEN|x-hub-token|x-lia-proprietaire/i);
  });
});
