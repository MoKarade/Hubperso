// tests/graphesRoute.test.ts — la route qui sert un graphe de code (non fiable) au propriétaire.
//
// Prouve : refus sans session / pour un invité / dépôt inconnu ; propriétaire → HTML réécrit servi
// avec la CSP en bac à sable ; échec honnête (502) quand le graphe est indisponible ou refusé.
// Et que `next.config.mjs` NE double PAS la CSP globale sur cette route.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROPRIETAIRE = "proprietaire@exemple.test";

const moq = vi.hoisted(() => ({ auth: vi.fn(), charger: vi.fn() }));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/graphes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/graphes")>()),
  chargerGraphe: moq.charger,
}));

import { CSP_GRAPHE, GET } from "../app/api/graphes/[depot]/route";
import { VIS_LOCAL, VIS_SRI } from "../lib/grapheHtml";
import { BASCULE_2D, LIB3D, VISUALISEUR3D } from "../lib/grapheVue3d";

const PAGE_GRAPHE = `<html><script>
const RAW_NODES = [{"id": "a", "label": "</script><img src=x onerror=alert(1)>", "source_file": "lib/a.ts", "file_type": "code", "size": 14, "degree": 1}, {"id": "b", "label": "b", "source_file": "app/b.tsx", "file_type": "code", "size": 10, "degree": 1}];
const RAW_EDGES = [{"from": "a", "to": "b", "label": "calls", "confidence": "EXTRACTED"}];
const LEGEND = [];
</script></html>`;

const appeler = (depot: string, requete = "") =>
  GET(new Request(`https://www.hubperso.com/api/graphes/${depot}${requete}`), {
    params: Promise.resolve({ depot }),
  });

const HTML = `<html><script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js" integrity="${VIS_SRI}"></script></html>`;

beforeEach(() => {
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  moq.auth.mockReset();
  moq.charger.mockReset();
});

describe("GET /api/graphes/[depot]", () => {
  it("401 sans session, et ne charge rien", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await appeler("hubperso");
    expect(r.status).toBe(401);
    expect(moq.charger).not.toHaveBeenCalled();
  });

  it("403 pour une personne connectée qui n'est pas le propriétaire", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@exemple.test" } });
    const r = await appeler("hubperso");
    expect(r.status).toBe(403);
    expect(moq.charger).not.toHaveBeenCalled();
  });

  it("404 pour un dépôt inconnu, sans jamais l'envoyer à GitHub", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    for (const mauvais of ["inconnu", "../x", "MoKarade%2Fautre"]) {
      expect((await appeler(mauvais)).status).toBe(404);
    }
    expect(moq.charger).not.toHaveBeenCalled();
  });

  it("propriétaire, vue 2D : sert le HTML réécrit avec le bouton 3D, en bac à sable, sans cache", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    moq.charger.mockResolvedValue({ ok: true, graphe: { meta: {}, html: HTML } });
    const r = await appeler("hubperso", "?vue=2d");
    expect(r.status).toBe(200);
    expect(moq.charger).toHaveBeenCalledWith("Hubperso");
    const corps = await r.text();
    expect(corps).toContain(`<script src="${VIS_LOCAL}"></script>`);
    expect(corps).not.toContain("unpkg.com");
    expect(corps).toContain(`<script src="${BASCULE_2D}"></script>`);
    expect(r.headers.get("content-type")).toMatch(/^text\/html/);
    expect(r.headers.get("content-security-policy")).toBe(CSP_GRAPHE);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("la CSP isole : sandbox sans allow-same-origin, aucun réseau, aucune navigation", () => {
    expect(CSP_GRAPHE).toMatch(/^sandbox allow-scripts;/);
    for (const interdit of ["allow-same-origin", "allow-top-navigation", "allow-popups", "allow-forms"]) {
      expect(CSP_GRAPHE).not.toContain(interdit);
    }
    expect(CSP_GRAPHE).toContain("connect-src 'none'");
    expect(CSP_GRAPHE).toContain("default-src 'none'");
    expect(CSP_GRAPHE).not.toMatch(/https?:/);
  });

  it("502 avec la cause quand le graphe est indisponible", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    moq.charger.mockResolvedValue({ ok: false, detail: "ce dépôt n'a encore publié aucun graphe" });
    const r = await appeler("hubperso");
    expect(r.status).toBe(502);
    expect(await r.text()).toContain("aucun graphe");
    expect(r.headers.get("content-security-policy")).toBeNull();
  });

  it("502 quand le HTML est refusé (version de vis-network inattendue), jamais servi", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    moq.charger.mockResolvedValue({
      ok: true,
      graphe: { meta: {}, html: HTML.replace("9.1.6", "9.9.9") },
    });
    const r = await appeler("hubperso", "?vue=2d");
    expect(r.status).toBe(502);
    expect(await r.text()).toContain("version inattendue");
  });
});

describe("GET /api/graphes/[depot] — vue 3D", () => {
  const graphe = (html: string) => ({ ok: true, graphe: { meta: { sha: "abcdef0123456789abcdef0123456789abcdef01" }, html } });

  it("par défaut : une page du hub (scripts du hub seulement), pas le HTML du dépôt", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    moq.charger.mockResolvedValue(graphe(PAGE_GRAPHE));
    const r = await appeler("hubperso");
    expect(r.status).toBe(200);
    const corps = await r.text();
    expect(corps).toContain(`<script src="${LIB3D}"></script>`);
    expect(corps).toContain(`<script src="${VISUALISEUR3D}"></script>`);
    // le HTML du dépôt n'est jamais servi : ni son script, ni son texte non échappé
    expect(corps).not.toContain("RAW_NODES");
    expect(corps).not.toContain("</script><img");
    expect(corps).toContain("\\u003c/script>\\u003cimg");
    expect(r.headers.get("content-security-policy")).toBe(CSP_GRAPHE);
    expect(r.headers.get("cache-control")).toContain("no-store");
  });

  it("?vue=3d explicite = la même vue ; une valeur inconnue donne aussi la 3D", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    moq.charger.mockResolvedValue(graphe(PAGE_GRAPHE));
    for (const q of ["?vue=3d", "?vue=nimporte"]) {
      expect(await (await appeler("hubperso", q)).text()).toContain(LIB3D);
    }
  });

  it("format de graph.html inattendu : repli sur la 2D, avec la raison écrite sur la page", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    moq.charger.mockResolvedValue(graphe(HTML));
    const r = await appeler("hubperso");
    expect(r.status).toBe(200);
    const corps = await r.text();
    expect(corps).toContain(VIS_LOCAL);
    expect(corps).toMatch(/data-cause="Vue 3D indisponible : RAW_NODES introuvable/);
    expect(corps).not.toContain(LIB3D);
  });

  it("refuse la vue 3D sans session et pour un invité, comme la 2D", async () => {
    moq.auth.mockResolvedValue(null);
    expect((await appeler("hubperso", "?vue=3d")).status).toBe(401);
    moq.auth.mockResolvedValue({ user: { email: "invite@exemple.test" } });
    expect((await appeler("hubperso", "?vue=3d")).status).toBe(403);
    expect(moq.charger).not.toHaveBeenCalled();
  });
});

describe("next.config.mjs", () => {
  it("exclut /api/graphes/ de la CSP globale (la route porte la sienne)", async () => {
    const { default: config } = await import("../next.config.mjs");
    const regles = await config.headers!();
    const globale = regles.find((r: { headers: { key: string }[] }) =>
      r.headers.some((h) => h.key === "Content-Security-Policy"),
    )!;
    const motif = new RegExp("^" + globale.source.replace(/^\//, "\\/") + "$");
    expect(motif.test("/api/graphes/hubperso")).toBe(false);
    expect(motif.test("/")).toBe(true);
    expect(motif.test("/couts")).toBe(true);
    expect(motif.test("/api/cout")).toBe(true);
    // La source du fichier le dit aussi, pour qu'on ne la « simplifie » pas par erreur.
    expect(readFileSync(resolve(process.cwd(), "next.config.mjs"), "utf8")).toContain("api/graphes/");
  });
});
