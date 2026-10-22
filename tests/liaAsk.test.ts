// tests/liaAsk.test.ts — le contrat « ask » de LIA côté hub : validation pure, puis la route.
//
// Ce qu'on éprouve : demande refusée si hors forme (jamais réparée), réponse de MemoryAI refusée
// si hors contrat, humeurs alignées sur lia-ui, route : jeton d'app OU session, jeton faux sans
// repli sur la session, relais avec le jeton du hub, TOUT échec = 503, la question jamais journalisée.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLOCS_MAX,
  PUCES_MAX,
  QUESTION_MAX,
  TEXTE_MAX,
  corpsPourMemoryAi,
  validerDemande,
  validerReponse,
} from "@/lib/liaAsk";

describe("validerDemande", () => {
  it("accepte une question, rognée, avec ou sans page", () => {
    expect(validerDemande({ question: "  Où en est le budget ? " })).toEqual({
      ok: true,
      valeur: { question: "Où en est le budget ?" },
    });
    expect(validerDemande({ question: "x", page: "/couts" })).toEqual({
      ok: true,
      valeur: { question: "x", page: "/couts" },
    });
  });

  it("refuse tout ce qui sort de la forme", () => {
    const mauvais: unknown[] = [
      null, [], "texte", {}, { question: 3 }, { question: "   " },
      { question: "x".repeat(QUESTION_MAX + 1) },
      { question: "x", page: "couts" }, { question: "x", page: 4 }, { question: "x", page: "/" + "a".repeat(200) },
    ];
    for (const m of mauvais) expect(validerDemande(m).ok, JSON.stringify(m)).toBe(false);
  });

  it("n'envoie à MemoryAI que question, page et la source déterminée par le hub", () => {
    const corps = JSON.parse(
      corpsPourMemoryAi({ question: "q", page: "/a" }, "jobai"),
    );
    expect(corps).toEqual({ question: "q", page: "/a", source: "jobai" });
  });
});

describe("validerReponse", () => {
  it("accepte le contrat complet et retire les clés inconnues", () => {
    const r = validerReponse({
      text: "Bonjour",
      chips: [{ id: "a", label: "Oui", extra: 1 }],
      mood: "calme",
      blocks: [{ type: "x" }],
      autre: "ignoré",
    });
    expect(r).toEqual({
      ok: true,
      valeur: { text: "Bonjour", chips: [{ id: "a", label: "Oui" }], mood: "calme", blocks: [{ type: "x" }] },
    });
  });

  it("refuse une réponse hors contrat plutôt que de la réparer", () => {
    const mauvais: unknown[] = [
      null, "texte", {}, { text: "" }, { text: 1 }, { text: "x".repeat(TEXTE_MAX + 1) },
      { text: "x", chips: "non" }, { text: "x", chips: Array.from({ length: PUCES_MAX + 1 }, () => ({ id: "a", label: "b" })) },
      { text: "x", chips: [{ id: "a" }] }, { text: "x", mood: "furieux" },
      { text: "x", blocks: Array.from({ length: BLOCS_MAX + 1 }, () => ({})) }, { text: "x", blocks: {} },
    ];
    for (const m of mauvais) expect(validerReponse(m).ok, JSON.stringify(m)).toBe(false);
  });
});

const moq = vi.hoisted(() => ({ auth: vi.fn(), aAcces: vi.fn(), fetch: vi.fn() }));
vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: vi.fn(async () => {}) }));
vi.mock("@/lib/personnes", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/personnes")>();
  return { ...vrai, aAcces: moq.aAcces };
});

import { POST } from "@/app/api/lia/ask/route";

const JETON_APP = "jeton-de-test-jobai-0123456789";
const JETON_MEMOIRE = "jeton-de-test-memoryai-0123456789";
let ip = 0;
function requete(corps: unknown, entetes: Record<string, string> = {}) {
  const headers = new Headers({ "x-real-ip": `10.2.0.${++ip}`, ...entetes });
  const brut = typeof corps === "string" ? corps : JSON.stringify(corps);
  return new Request("https://hubperso.com/api/lia/ask", { method: "POST", headers, body: brut });
}
const reponseMemoire = (corps: unknown, status = 200) =>
  moq.fetch.mockResolvedValue(new Response(JSON.stringify(corps), { status }));

describe("POST /api/lia/ask", () => {
  beforeEach(() => {
    vi.stubEnv("HUB_TOKEN_JOBAI", JETON_APP);
    vi.stubEnv("HUB_TOKEN_MEMORYAI", JETON_MEMOIRE);
    vi.stubGlobal("fetch", moq.fetch);
    moq.auth.mockResolvedValue(null);
    moq.aAcces.mockResolvedValue(false);
    reponseMemoire({ text: "Bonjour", mood: "calme" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    moq.auth.mockReset();
    moq.aAcces.mockReset();
    moq.fetch.mockReset();
    vi.restoreAllMocks();
  });

  it("sans jeton ni session : 401, MemoryAI n'est pas appelée", async () => {
    const r = await POST(requete({ question: "q" }));
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(moq.fetch).not.toHaveBeenCalled();
  });

  it("jeton d'app faux : 401, sans repli sur une session valide", async () => {
    moq.auth.mockResolvedValue({ user: { email: "marc@exemple.invalid" } });
    moq.aAcces.mockResolvedValue(true);
    const r = await POST(requete({ question: "q" }, { "x-hub-token": "jeton-de-test-faux" }));
    expect(r.status).toBe(401);
    expect(moq.fetch).not.toHaveBeenCalled();
  });

  it("jeton d'app valide : relaie à MemoryAI avec le jeton du hub et la source tirée du jeton", async () => {
    const r = await POST(requete({ question: "Où en est le budget ?", source: "financeai" }, { "x-hub-token": JETON_APP }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ text: "Bonjour", mood: "calme" });
    const [url, init] = moq.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://memoryai.hubperso.com/api/ask");
    expect(new Headers(init.headers).get("x-hub-token")).toBe(JETON_MEMOIRE);
    // La source vient du JETON, jamais du corps envoyé par l'app.
    expect(JSON.parse(String(init.body))).toEqual({ question: "Où en est le budget ?", source: "jobai" });
  });

  it("session avec accès au hub : source « hub »", async () => {
    moq.auth.mockResolvedValue({ user: { email: "marc@exemple.invalid" } });
    moq.aAcces.mockResolvedValue(true);
    const r = await POST(requete({ question: "q", page: "/" }));
    expect(r.status).toBe(200);
    const [, init] = moq.fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).source).toBe("hub");
  });

  it("session sans accès au hub : 401", async () => {
    moq.auth.mockResolvedValue({ user: { email: "autre@exemple.invalid" } });
    const r = await POST(requete({ question: "q" }));
    expect(r.status).toBe(401);
  });

  it("corps invalide : 400 ; trop gros : 413 ; rien n'est relayé", async () => {
    const h = { "x-hub-token": JETON_APP };
    expect((await POST(requete("pas du json", h))).status).toBe(400);
    expect((await POST(requete({ question: "" }, h))).status).toBe(400);
    expect((await POST(requete({ question: "x".repeat(9000) }, h))).status).toBe(413);
    expect(moq.fetch).not.toHaveBeenCalled();
  });

  it("MemoryAI non configurée : 503, aucun appel réseau", async () => {
    vi.stubEnv("HUB_TOKEN_MEMORYAI", "");
    const r = await POST(requete({ question: "q" }, { "x-hub-token": JETON_APP }));
    expect(r.status).toBe(503);
    expect(moq.fetch).not.toHaveBeenCalled();
  });

  it("MemoryAI en erreur, injoignable ou hors contrat : toujours 503, jamais une réponse inventée", async () => {
    const h = { "x-hub-token": JETON_APP };
    reponseMemoire({ error: "x" }, 500);
    expect((await POST(requete({ question: "q" }, h))).status).toBe(503);
    reponseMemoire({ text: "" });
    expect((await POST(requete({ question: "q" }, h))).status).toBe(503);
    moq.fetch.mockRejectedValue(new Error("réseau"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(requete({ question: "q" }, h))).status).toBe(503);
  });

  it("n'écrit jamais la question dans les journaux d'erreur", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    moq.fetch.mockRejectedValue(new Error("échec avec la question secrète"));
    await POST(requete({ question: "question secrète" }, { "x-hub-token": JETON_APP }));
    expect(JSON.stringify(journal.mock.calls)).not.toContain("secrète");
  });
});
