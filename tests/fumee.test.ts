// tests/fumee.test.ts — scripts/fumee.mjs et scripts/retour-arriere-vercel.mjs.
// Seul réseau permis : un serveur HTTP local sur 127.0.0.1, arrêté en fin de test ; l'API
// Vercel est simulée par un `fetch` injecté. Aucune donnée réelle.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construireUrls, executer as fumee, sonder } from "../scripts/fumee.mjs";
import { choisirCible, executer as retour } from "../scripts/retour-arriere-vercel.mjs";

let serveur: Server;
let base: string;

beforeAll(async () => {
  serveur = createServer((req, res) => {
    const chemin = req.url ?? "/";
    if (chemin === "/ok") return void res.writeHead(200).end("<html>bonjour</html>");
    if (chemin === "/500") return void res.writeHead(500).end("boum");
    if (chemin === "/sante-ok") return void res.writeHead(200).end(JSON.stringify({ ok: true }));
    if (chemin === "/api/sante")
      return void res.writeHead(200).end(JSON.stringify({ ok: false, cause: "base" }));
    if (chemin === "/boucle") return void res.writeHead(302, { location: "/boucle" }).end();
    if (chemin === "/saut") return void res.writeHead(302, { location: "/ok" }).end();
    if (chemin === "/lent") return; // ne répond jamais
    if (chemin === "/gros") return void res.writeHead(200).end("x".repeat(200 * 1024));
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => serveur.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});

afterAll(async () => {
  serveur.closeAllConnections();
  await new Promise((r) => serveur.close(r));
});

const rapide = { delaiMs: 300, pauseMs: 1 };

describe("sonder", () => {
  it("200 ok", async () => {
    expect((await sonder(`${base}/ok`, rapide)).ok).toBe(true);
  });
  it("500 = panne, après 2 essais", async () => {
    const r = await sonder(`${base}/500`, rapide);
    expect(r).toMatchObject({ ok: false, detail: "HTTP 500", essais: 2 });
  });
  it("200 avec {ok:false} sur /api/sante = PANNE", async () => {
    const r = await sonder(`${base}/api/sante`, rapide);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("PANNE");
  });
  it("délai dépassé", async () => {
    const r = await sonder(`${base}/lent`, rapide);
    expect(r).toMatchObject({ ok: false, detail: "délai dépassé" });
  });
  it("boucle de redirection bornée", async () => {
    const r = await sonder(`${base}/boucle`, rapide);
    expect(r.detail).toContain("redirections");
  });
  it("une redirection simple est suivie", async () => {
    expect((await sonder(`${base}/saut`, rapide)).ok).toBe(true);
  });
  it("corps énorme refusé", async () => {
    const r = await sonder(`${base}/gros`, rapide);
    expect(r.detail).toContain("trop gros");
  });
});

describe("liste et sortie", () => {
  const config = { base: "https://hubperso.com", urls: ["/ok", "/500"] };
  it("refuse une URL hors liste", () => {
    expect(() => construireUrls(config, { chemins: ["/admin"] })).toThrow(/hors liste/);
  });
  it("refuse une base http non locale", () => {
    expect(() => construireUrls(config, { urlBase: "http://exemple.test" })).toThrow(/https/);
  });
  it("code 1 et sortie sans en-tête ni cookie", async () => {
    const lignes: string[] = [];
    const code = await fumee(config, { urlBase: base, sortie: (l: string) => lignes.push(l), ...rapide });
    expect(code).toBe(1);
    const texte = lignes.join("\n");
    expect(texte).toContain("PANNE");
    expect(texte).not.toMatch(/set-cookie|authorization|cookie:/i);
  });
  it("code 0 quand tout va bien", async () => {
    const code = await fumee({ base, urls: ["/ok", "/saut"] }, { urlBase: base, sortie: () => {}, ...rapide });
    expect(code).toBe(0);
  });
});

describe("retour arrière Vercel", () => {
  const SECRET = "jeton-secret-de-test";
  const deps = [
    { uid: "dpl_ancien", url: "a.vercel.app", created: 1, target: "production", state: "READY" },
    { uid: "dpl_actuel", url: "c.vercel.app", created: 3, target: "production", state: "READY" },
    { uid: "dpl_prec", url: "b.vercel.app", created: 2, target: "production", state: "READY" },
    { uid: "dpl_rate", url: "r.vercel.app", created: 4, target: "production", state: "ERROR" },
  ];

  function faux(appels: { url: string; method: string }[]) {
    return async (url: string, init?: { method?: string }) => {
      appels.push({ url, method: init?.method ?? "GET" });
      if (init?.method === "POST") return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ deployments: deps }), { status: 200 });
    };
  }

  it("choisit le précédent prêt, pas un déploiement en erreur", () => {
    expect(choisirCible(deps).cible.uid).toBe("dpl_prec");
    expect(choisirCible(deps, "dpl_ancien").cible.uid).toBe("dpl_ancien");
  });
  it("refuse s'il n'y a pas de précédent", () => {
    expect(() => choisirCible(deps.slice(0, 1))).toThrow(/précédent/);
  });
  it("mode essai par défaut : aucun POST, aucun secret affiché", async () => {
    const appels: { url: string; method: string }[] = [];
    const lignes: string[] = [];
    const code = await retour({
      env: { VERCEL_TOKEN: SECRET, VERCEL_PROJECT_ID: "prj_test" },
      args: [],
      fetchImpl: faux(appels) as unknown as typeof fetch,
      sortie: (l: string) => lignes.push(l),
    });
    expect(code).toBe(0);
    expect(appels.every((a) => a.method === "GET")).toBe(true);
    expect(lignes.join("\n")).toContain("Mode essai");
    expect(lignes.join("\n")).not.toContain(SECRET);
  });
  it("--executer appelle le rollback sur la cible", async () => {
    const appels: { url: string; method: string }[] = [];
    await retour({
      env: { VERCEL_TOKEN: SECRET, VERCEL_PROJECT_ID: "prj_test" },
      args: ["--executer"],
      fetchImpl: faux(appels) as unknown as typeof fetch,
      sortie: () => {},
    });
    const post = appels.find((a) => a.method === "POST");
    expect(post?.url).toBe("https://api.vercel.com/v1/projects/prj_test/rollback/dpl_prec");
  });
  it("jeton absent : erreur sans appel réseau", async () => {
    const appels: { url: string; method: string }[] = [];
    await expect(
      retour({ env: { VERCEL_PROJECT_ID: "prj_test" }, args: [], fetchImpl: faux(appels) as unknown as typeof fetch }),
    ).rejects.toThrow(/VERCEL_TOKEN absent/);
    expect(appels).toHaveLength(0);
  });
  it("une erreur HTTP n'expose pas le jeton", async () => {
    const err = await retour({
      env: { VERCEL_TOKEN: SECRET, VERCEL_PROJECT_ID: "prj_test" },
      args: [],
      fetchImpl: (async () => new Response("", { status: 403 })) as unknown as typeof fetch,
    }).catch((e: Error) => e);
    expect(String(err)).not.toContain(SECRET);
  });
});
