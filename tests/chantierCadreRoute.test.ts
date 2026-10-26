// tests/chantierCadreRoute.test.ts — GET /api/chantier/cadre, le document de la page Chantier.
//
// Prouve : refus sans session (401) et pour un invité (404, il n'apprend pas que la page existe) ; le
// propriétaire reçoit le document avec la CSP en bac à sable et rien de cachable ; le fichier est lu une
// seule fois ; un document introuvable est une erreur dite, pas une page vide. Et que `next.config.mjs`
// exclut cette route de la CSP globale (sinon `frame-ancestors 'none'` interdirait le cadre), embarque le
// fichier avec la route, et n'exclut RIEN d'autre.

import { beforeEach, describe, expect, it, vi } from "vitest";

const PROPRIETAIRE = "proprietaire@exemple.test";

const moq = vi.hoisted(() => ({ auth: vi.fn(), readFile: vi.fn() }));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("node:fs/promises", () => ({ readFile: moq.readFile }));

import { CSP_CADRE } from "@/lib/chantierCadre";

async function appeler() {
  // Module neuf à chaque cas : le document y est gardé en mémoire.
  vi.resetModules();
  const { GET } = await import("../app/api/chantier/cadre/route");
  return GET();
}

beforeEach(() => {
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  moq.auth.mockReset();
  moq.readFile.mockReset();
  moq.readFile.mockResolvedValue("<!doctype html><title>Chantier</title>");
});

describe("GET /api/chantier/cadre", () => {
  it("401 sans session, et ne lit rien", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await appeler();
    expect(r.status).toBe(401);
    expect(moq.readFile).not.toHaveBeenCalled();
  });

  it("404 pour une personne connectée qui n'est pas le propriétaire", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@exemple.test" } });
    const r = await appeler();
    expect(r.status).toBe(404);
    expect(moq.readFile).not.toHaveBeenCalled();
  });

  it("404 sans AUTHORIZED_EMAIL : une configuration vide n'ouvre rien", async () => {
    vi.stubEnv("AUTHORIZED_EMAIL", "");
    moq.auth.mockResolvedValue({ user: { email: "" } });
    expect((await appeler()).status).toBe(404);
  });

  it("le propriétaire reçoit le document, en bac à sable, sans cache", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    const r = await appeler();
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("<title>Chantier</title>");
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("content-security-policy")).toBe(CSP_CADRE);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(String(moq.readFile.mock.calls[0]![0])).toMatch(/chantier[\\/]cadre\.html$/);
  });

  it("les refus portent aussi les en-têtes de sécurité (la CSP globale ne s'applique pas ici)", async () => {
    moq.auth.mockResolvedValue(null);
    const r = await appeler();
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });

  it("document introuvable : 500 dit, jamais une page vide ; la requête suivante réessaie", async () => {
    vi.resetModules();
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    moq.readFile.mockRejectedValueOnce(new Error("ENOENT"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("../app/api/chantier/cadre/route");
    const raté = await GET();
    expect(raté.status).toBe(500);
    expect(await raté.text()).toContain("introuvable");
    const reussi = await GET();
    expect(reussi.status).toBe(200);
    expect(moq.readFile).toHaveBeenCalledTimes(2);
  });

  it("le fichier n'est lu qu'une fois par instance", async () => {
    vi.resetModules();
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    const { GET } = await import("../app/api/chantier/cadre/route");
    await GET();
    await GET();
    expect(moq.readFile).toHaveBeenCalledTimes(1);
  });
});

describe("next.config.mjs", () => {
  it("/couts redirige (307, pas permanent) vers l'onglet Coûts du Chantier", async () => {
    const { default: config } = await import("../next.config.mjs");
    const redirections = await config.redirects!();
    expect(redirections).toEqual([{ source: "/couts", destination: "/chantier?onglet=couts", permanent: false }]);
  });

  it("exclut le cadre de la CSP globale, lui seul, et l'embarque avec la route", async () => {
    const { default: config } = await import("../next.config.mjs");
    const blocs = await config.headers!();
    const globale = blocs.find((b: { headers: { key: string }[] }) =>
      b.headers.some((h) => h.key === "Content-Security-Policy"),
    )!;
    const motif = new RegExp("^" + globale.source.replace(/^\//, "\\/") + "$");
    expect(motif.test("/api/chantier/cadre")).toBe(false);
    expect(motif.test("/api/chantier/cadre/")).toBe(false);
    // Le reste de la route Chantier garde la CSP du hub.
    expect(motif.test("/api/chantier/releve")).toBe(true);
    expect(motif.test("/api/chantier/cadre-autre")).toBe(true);
    expect(motif.test("/chantier")).toBe(true);
    expect(motif.test("/")).toBe(true);

    const propre = blocs.find((b: { source: string }) => b.source === "/api/chantier/cadre")!;
    const cles = propre.headers.map((h: { key: string }) => h.key);
    expect(cles).not.toContain("Content-Security-Policy");
    expect(propre.headers.find((h: { key: string }) => h.key === "X-Frame-Options")!.value).toBe("SAMEORIGIN");

    expect(config.outputFileTracingIncludes!["/api/chantier/cadre"]).toContain("./chantier/cadre.html");
  });

  it("la CSP du hub interdit toujours la mise en cadre ailleurs", async () => {
    const { default: config } = await import("../next.config.mjs");
    const blocs = await config.headers!();
    const globale = blocs.find((b: { headers: { key: string }[] }) =>
      b.headers.some((h) => h.key === "Content-Security-Policy"),
    )!;
    const csp = globale.headers.find((h: { key: string }) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(globale.headers.find((h: { key: string }) => h.key === "X-Frame-Options")!.value).toBe("DENY");
  });
});
