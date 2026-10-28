// tests/notesLiaRoute.test.ts — GET /api/chantier/notes-lia, la lecture du PC.
//
// Même montage que tests/chantierGestesPc.test.ts. Ce qu'on éprouve : GANTT_SECRET absent → 503 (jamais 401), secret
// absent ou faux → 401 et MemoryAI n'est PAS interrogée ; comparaison par `memeJeton` ; le nombre sort du résumé en
// direct ; résumé illisible → `null` (pas 0) ; limite de débit → 429.

import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "secret-de-test-gantt-0123456789ab";

const moq = vi.hoisted(() => ({ fetchSummaryLive: vi.fn(), memeJeton: vi.fn() }));

vi.mock("@/lib/fetchSummary", () => ({ fetchSummaryLive: moq.fetchSummaryLive }));
vi.mock("@/lib/jetonApp", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/jetonApp")>();
  moq.memeJeton.mockImplementation(vrai.memeJeton);
  return { ...vrai, memeJeton: moq.memeJeton };
});

import { GET } from "@/app/api/chantier/notes-lia/route";

let ip = 0;
/** Chaque requête vient d'un client distinct : la limite de débit ne se mélange pas aux cas. */
function requete(authorization?: string, client = `10.6.0.${++ip}`) {
  const headers = new Headers({ "x-real-ip": client });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://hubperso.com/api/chantier/notes-lia", { headers });
}
const bon = `Bearer ${SECRET}`;
const resume = (value: number) => ({
  state: "ok",
  source: { id: "memoryai" },
  summary: { metrics: [{ label: "Notes de LIA non lues", value, format: "number" }] },
});

beforeEach(() => {
  moq.fetchSummaryLive.mockReset().mockResolvedValue(resume(2));
  vi.stubEnv("GANTT_SECRET", SECRET);
});

describe("GET /api/chantier/notes-lia", () => {
  it("GANTT_SECRET absent côté hub : 503, jamais 401, MemoryAI n'est pas interrogée", async () => {
    vi.stubEnv("GANTT_SECRET", "");
    const r = await GET(requete(bon));
    expect(r.status).toBe(503);
    expect(moq.fetchSummaryLive).not.toHaveBeenCalled();
  });

  it("sans secret, ou avec un faux : 401, MemoryAI n'est pas interrogée", async () => {
    for (const auth of [undefined, "", "Bearer", "Bearer faux", `Basic ${SECRET}`, SECRET]) {
      const r = await GET(requete(auth));
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ ok: false, raison: "secret refusé" });
    }
    expect(moq.fetchSummaryLive).not.toHaveBeenCalled();
  });

  it("compare le secret par memeJeton (temps constant)", async () => {
    await GET(requete(bon));
    expect(moq.memeJeton).toHaveBeenCalled();
  });

  it("bon secret : rend le nombre de MemoryAI, lu en direct, sans cache", async () => {
    const r = await GET(requete(bon));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ ok: true, notesLia: 2 });
    expect(moq.fetchSummaryLive).toHaveBeenCalledTimes(1);
    expect(moq.fetchSummaryLive.mock.calls[0]?.[0]).toMatchObject({ id: "memoryai" });
  });

  it("zéro note : 0, pas null", async () => {
    moq.fetchSummaryLive.mockResolvedValue(resume(0));
    expect(await (await GET(requete(bon))).json()).toEqual({ ok: true, notesLia: 0 });
  });

  it("MemoryAI injoignable : 200 avec null, jamais 0", async () => {
    moq.fetchSummaryLive.mockResolvedValue({ state: "unreachable", source: { id: "memoryai" }, detail: "délai" });
    const r = await GET(requete(bon));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, notesLia: null });
  });

  it("limite de débit : 429 au-delà de 30 appels par minute et par client", async () => {
    const client = "10.6.9.9";
    let dernier = 200;
    for (let i = 0; i < 31; i++) dernier = (await GET(requete(bon, client))).status;
    expect(dernier).toBe(429);
  });
});
