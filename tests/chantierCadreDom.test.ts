// @vitest-environment jsdom
//
// tests/chantierCadreDom.test.ts — ce que `ChantierCadre` fait APRÈS son premier rendu : recevoir le canal
// du cadre, lui poster le relevé, ne le relire que par `If-None-Match`, ne rien lire onglet caché, ne
// répondre à personne d'autre que son cadre — et ne JAMAIS écrire par `postMessage(…, "*")`.
// Même montage que tests/composantsDom.test.ts.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChantierCadre } from "@/components/ChantierCadre";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let conteneur: HTMLDivElement;
let racine: Root;
const fetchMoq = vi.fn();
/** Les coûts des apps : une autre route, lue à part (5 min) ; le relevé garde son propre mock. */
const coutsMoq = vi.fn();
/** Les gestes de l'onglet « À toi » : une troisième route, écrite seulement sur demande du cadre. */
const gestesMoq = vi.fn();
/** Le document du cadre lui-même : le hub n'en lit que l'ETag (HEAD), pour savoir qu'un déploiement l'a changé. */
const versionMoq = vi.fn();
/** Les événements GitHub en direct : une cinquième route, lue toutes les 10 s ; ici rien de neuf, sauf test qui dit le contraire. */
const evenementsMoq = vi.fn();
const COUTS = { suivies: 1, apps: 2, alertes: 0, totaux: [], note: null, detail: [] };

beforeEach(() => {
  vi.useFakeTimers();
  coutsMoq.mockResolvedValue({ ok: true, status: 200, json: async () => COUTS });
  gestesMoq.mockResolvedValue({ ok: true, status: 201 });
  versionMoq.mockResolvedValue({ status: 200, headers: { get: () => '"v1"' } });
  evenementsMoq.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, evenements: [], jusqua: null }) });
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url === "/api/chantier/couts"
      ? coutsMoq(url, init)
      : url === "/api/chantier/gestes"
        ? gestesMoq(url, init)
        : url === "/api/chantier/cadre"
          ? versionMoq(url, init)
          : url.startsWith("/api/chantier/evenements")
            ? evenementsMoq(url, init)
            : fetchMoq(url, init),
  );
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
});

afterEach(() => {
  act(() => racine.unmount());
  conteneur.remove();
  fetchMoq.mockReset();
  coutsMoq.mockReset();
  gestesMoq.mockReset();
  versionMoq.mockReset();
  evenementsMoq.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const reponse = (status: number, etag?: string) => ({
  status,
  headers: { get: (nom: string) => (nom.toLowerCase() === "etag" ? (etag ?? null) : null) },
  arrayBuffer: async () => new ArrayBuffer(8),
});

/** Un bout de canal : tout ce que le hub y écrit est gardé. */
function faussePort() {
  return { postMessage: vi.fn(), close: vi.fn(), onmessage: null as ((m: { data: unknown }) => void) | null };
}
type FaussePort = ReturnType<typeof faussePort>;

function monter() {
  act(() => racine.render(h(ChantierCadre)));
  const cadre = conteneur.querySelector("iframe")!;
  // Le hub n'a le droit d'écrire dans la fenêtre du cadre que par un canal : tout `postMessage` direct est un échec.
  const direct = vi.spyOn(cadre.contentWindow!, "postMessage").mockImplementation(() => {});
  return { cadre, direct };
}

/** Le cadre se présente (ou une autre fenêtre se fait passer pour lui), avec son canal. */
async function presenter(source: Window | null, port: FaussePort | null, donnee: unknown = { type: "chantier-pret" }, origine = "null") {
  await act(async () => {
    window.dispatchEvent(
      Object.assign(new Event("message"), { source, data: donnee, origin: origine, ports: port ? [port] : [] }),
    );
  });
}

/** Les messages de DONNÉES du relevé écrits dans le canal (sans le « ok » d'accueil ni les coûts). */
function donnees(port: FaussePort) {
  return port.postMessage.mock.calls
    .map((c) => c[0] as { type: string; message?: string; octets?: ArrayBuffer })
    .filter((m) => m.type !== "chantier-ok" && m.type !== "chantier-couts" && m.type !== "chantier-geste" && m.type !== "chantier-version-neuve" && m.type !== "chantier-evenements");
}

/** Les réponses aux gestes écrites dans le canal. */
function reponsesGestes(port: FaussePort) {
  return port.postMessage.mock.calls
    .map((c) => c[0] as { type: string; id?: string; ok?: boolean; erreur?: string })
    .filter((m) => m.type === "chantier-geste");
}

/** Le cadre remet un geste par son canal. */
async function geste(port: FaussePort, donnee: unknown) {
  await act(async () => {
    port.onmessage?.({ data: donnee });
  });
}

/** Les messages de coûts écrits dans le canal. */
function couts(port: FaussePort) {
  return port.postMessage.mock.calls
    .map((c) => c[0] as { type: string; couts?: unknown; erreur?: string })
    .filter((m) => m.type === "chantier-couts");
}

async function avancer(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("ChantierCadre", () => {
  it("un cadre isolé : bac à sable sans allow-same-origin, le document du hub, aucun référent", () => {
    const { cadre } = monter();
    expect(cadre.getAttribute("src")).toBe("/api/chantier/cadre");
    expect(cadre.getAttribute("sandbox")).toBe("allow-scripts allow-popups allow-popups-to-escape-sandbox");
    expect(cadre.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(cadre.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(cadre.title).not.toBe("");
  });

  it("ne lit rien tant que le cadre ne s'est pas présenté", async () => {
    monter();
    await avancer(60_000 * 3);
    expect(fetchMoq).not.toHaveBeenCalled();
  });

  it("présenté : répond « ok », lit le relevé avec la session, l'écrit dans le canal, retient l'ETag", async () => {
    const { cadre, direct } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(200, '"1760000000000"'));
    await presenter(cadre.contentWindow, port);
    expect(port.postMessage.mock.calls[0]![0]).toEqual({ type: "chantier-ok", gestes: true });
    expect(fetchMoq).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMoq.mock.calls[0]!;
    expect(url).toBe("/api/chantier/releve");
    expect(init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(init.headers).toEqual({});
    expect(donnees(port)).toHaveLength(1);
    expect(donnees(port)[0]).toMatchObject({ type: "chantier-releve" });
    expect(donnees(port)[0]!.octets).toBeInstanceOf(ArrayBuffer);
    // les octets sont TRANSFÉRÉS au canal (pas copiés), et rien ne passe par la fenêtre
    expect(port.postMessage.mock.calls[1]![1]).toHaveLength(1);
    expect(direct).not.toHaveBeenCalled();
  });

  it("lit les événements GitHub toutes les 10 s depuis le dernier reçu, les écrit dans le canal, dit une panne en clair", async () => {
    const { cadre } = monter();
    const port = faussePort();
    const evts = () =>
      port.postMessage.mock.calls
        .map((c) => c[0] as { type: string; evenements?: unknown[]; erreur?: string })
        .filter((m) => m.type === "chantier-evenements");
    fetchMoq.mockResolvedValue(reponse(200, '"1"'));
    evenementsMoq
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, evenements: [{ id: "a" }], jusqua: "2026-10-28T21:00:00.000Z" }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ ok: false }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, evenements: [], jusqua: "2026-10-28T21:00:00.000Z" }) });
    await presenter(cadre.contentWindow, port);
    expect(evenementsMoq.mock.calls[0]![0]).toBe("/api/chantier/evenements");
    expect(evts()[0]).toMatchObject({ evenements: [{ id: "a" }] });
    await avancer(10_000);
    expect(evenementsMoq.mock.calls[1]![0]).toBe("/api/chantier/evenements?depuis=" + encodeURIComponent("2026-10-28T21:00:00.000Z"));
    expect(evts()[1]!.erreur).toBeTruthy();
    expect(evts()[1]!.evenements).toBeUndefined();
    await avancer(10_000);
    expect(evts()[2]).toMatchObject({ evenements: [] });
  });

  it("relit chaque minute avec If-None-Match ; 304 : rien n'est réécrit", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValueOnce(reponse(200, '"42"')).mockResolvedValue(reponse(304, '"42"'));
    await presenter(cadre.contentWindow, port);
    await avancer(60_000);
    expect(fetchMoq).toHaveBeenCalledTimes(2);
    expect(fetchMoq.mock.calls[1]![1].headers).toEqual({ "If-None-Match": '"42"' });
    expect(donnees(port)).toHaveLength(1);
  });

  it("un nouveau relevé (200 après 304) est réécrit", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq
      .mockResolvedValueOnce(reponse(200, '"42"'))
      .mockResolvedValueOnce(reponse(304, '"42"'))
      .mockResolvedValue(reponse(200, '"43"'));
    await presenter(cadre.contentWindow, port);
    await avancer(60_000 * 2);
    expect(donnees(port)).toHaveLength(2);
    expect(fetchMoq.mock.calls[2]![1].headers).toEqual({ "If-None-Match": '"42"' });
  });

  it("une panne est dite au cadre (jamais un relevé vide), et le bandeau s'efface au retour", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq
      .mockResolvedValueOnce(reponse(200, '"42"'))
      .mockResolvedValueOnce(reponse(500))
      .mockResolvedValue(reponse(304, '"42"'));
    await presenter(cadre.contentWindow, port);
    await avancer(60_000);
    expect(donnees(port)[1]).toMatchObject({ type: "chantier-etat" });
    expect(donnees(port)[1]!.message).toContain("indisponible");
    await avancer(60_000);
    expect(donnees(port)[2]).toEqual({ type: "chantier-etat", message: "" });
    await avancer(60_000);
    expect(donnees(port)).toHaveLength(3);
  });

  it("le réseau tombe : un message, pas une exception", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockRejectedValue(new TypeError("Failed to fetch"));
    await presenter(cadre.contentWindow, port);
    expect(donnees(port)[0]).toMatchObject({ type: "chantier-etat" });
  });

  it("n'écoute QUE son cadre : autre fenêtre, autre origine, autre message ou pas de canal ne déclenchent rien", async () => {
    const { cadre } = monter();
    fetchMoq.mockResolvedValue(reponse(200, '"1"'));
    const port = faussePort();
    await presenter(window, port);
    await presenter(null, port);
    await presenter(cadre.contentWindow, port, { type: "chantier-pret" }, "https://autre.exemple");
    await presenter(cadre.contentWindow, port, { type: "autre" });
    await presenter(cadre.contentWindow, port, "chantier-pret");
    await presenter(cadre.contentWindow, null); // « prêt » sans canal : rien à qui répondre
    expect(fetchMoq).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("le premier canal est le bon : le cadre se représente tant qu'il n'a pas reçu « ok », les suivants sont ignorés", async () => {
    const { cadre } = monter();
    fetchMoq.mockResolvedValue(reponse(200, '"42"'));
    const premier = faussePort();
    const second = faussePort();
    await presenter(cadre.contentWindow, premier);
    await presenter(cadre.contentWindow, second);
    expect(fetchMoq).toHaveBeenCalledTimes(1);
    expect(second.postMessage).not.toHaveBeenCalled();
  });

  it("onglet caché : rien n'est lu ; au retour, une lecture tout de suite", async () => {
    const { cadre } = monter();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, faussePort());
    fetchMoq.mockClear();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await avancer(60_000 * 5);
    expect(fetchMoq).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMoq).toHaveBeenCalledTimes(1);
  });

  it("les coûts des apps sont lus avec la session et postés dans le canal, puis relus toutes les 5 minutes", async () => {
    const { cadre, direct } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    expect(coutsMoq).toHaveBeenCalledTimes(1);
    expect(coutsMoq.mock.calls[0]![1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(couts(port)).toEqual([{ type: "chantier-couts", couts: COUTS }]);
    await avancer(60_000 * 4);
    expect(coutsMoq).toHaveBeenCalledTimes(1); // pas avant 5 minutes
    await avancer(60_000 * 2);
    expect(coutsMoq).toHaveBeenCalledTimes(2);
    expect(direct).not.toHaveBeenCalled();
  });

  it("des coûts illisibles sont dits au cadre en clair, jamais un total vide ; le relevé n'en souffre pas", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(200, '"1"'));
    coutsMoq.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await presenter(cadre.contentWindow, port);
    expect(couts(port)).toHaveLength(1);
    expect(couts(port)[0]!.couts).toBeUndefined();
    expect(couts(port)[0]!.erreur).toMatch(/Trop de lectures/);
    expect(donnees(port)).toHaveLength(1);
    coutsMoq.mockRejectedValue(new TypeError("Failed to fetch"));
    await avancer(60_000 * 5);
    expect(couts(port).at(-1)!.erreur).toMatch(/le hub ne répond pas/);
  });

  it("onglet caché : les coûts ne sont pas relus non plus", async () => {
    const { cadre } = monter();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, faussePort());
    coutsMoq.mockClear();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await avancer(60_000 * 10);
    expect(coutsMoq).not.toHaveBeenCalled();
  });

  it("un geste du cadre est déposé par le hub avec la session, et le cadre en est informé", async () => {
    const { cadre, direct } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    const corps = { v: 1, id: "abc-123456", ref: "Org/depot#12", geste: "fusionner", texte: null, quand: "2026-10-27T10:00:00.000Z" };
    await geste(port, { type: "chantier-geste", geste: corps });
    expect(gestesMoq).toHaveBeenCalledTimes(1);
    const [url, init] = gestesMoq.mock.calls[0]!;
    expect(url).toBe("/api/chantier/gestes");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(init.body)).toEqual(corps);
    expect(reponsesGestes(port)).toEqual([{ type: "chantier-geste", id: "abc-123456", ok: true }]);
    expect(direct).not.toHaveBeenCalled();
  });

  it("un geste refusé ou un hub qui ne répond pas est dit au cadre en clair, jamais « déposé »", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    gestesMoq.mockResolvedValue({ ok: false, status: 401 });
    await geste(port, { type: "chantier-geste", geste: { id: "abc-123456" } });
    expect(reponsesGestes(port)[0]).toMatchObject({ id: "abc-123456", ok: false });
    expect(reponsesGestes(port)[0]!.erreur).toMatch(/session/);
    gestesMoq.mockRejectedValue(new TypeError("Failed to fetch"));
    await geste(port, { type: "chantier-geste", geste: { id: "def-654321" } });
    expect(reponsesGestes(port)[1]).toMatchObject({ id: "def-654321", ok: false });
    expect(reponsesGestes(port)[1]!.erreur).toMatch(/le hub ne répond pas/);
  });

  it("ce qui n'a pas la forme d'un geste n'est jamais relayé", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    for (const donnee of [null, "geste", { type: "autre", geste: { id: "abc-123456" } }, { type: "chantier-geste" },
      { type: "chantier-geste", geste: "x" }, { type: "chantier-geste", geste: { ref: "sans id" } }, { type: "chantier-geste", geste: { id: 5 } }]) {
      await geste(port, donnee);
    }
    expect(gestesMoq).not.toHaveBeenCalled();
    expect(reponsesGestes(port)).toEqual([]);
  });

  it("démonté : le canal est fermé, plus de minuteur ni d'écoute", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    fetchMoq.mockClear();
    act(() => racine.unmount());
    racine = createRoot(conteneur);
    expect(port.close).toHaveBeenCalled();
    await avancer(60_000 * 3);
    await presenter(cadre.contentWindow, faussePort());
    expect(fetchMoq).not.toHaveBeenCalled();
  });

  it("caché (hors de /chantier) : rien n'est lu ; de retour : une lecture tout de suite, et le document n'est pas rechargé", async () => {
    act(() => racine.render(h(ChantierCadre, { actif: true })));
    const cadre = conteneur.querySelector("iframe")!;
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    fetchMoq.mockClear();

    act(() => racine.render(h(ChantierCadre, { actif: false })));
    expect(conteneur.querySelector("iframe")).toBe(cadre);
    expect(cadre.className).toContain("chantier-cadre--cache");
    await avancer(60_000 * 5);
    expect(fetchMoq).not.toHaveBeenCalled();

    act(() => racine.render(h(ChantierCadre, { actif: true })));
    await avancer(0);
    expect(conteneur.querySelector("iframe")).toBe(cadre);
    expect(cadre.className).not.toContain("cache");
    expect(fetchMoq).toHaveBeenCalledTimes(1);
  });

  it("l'adresse du cadre ne change jamais (un autre src le rechargerait) ; l'onglet demandé passe par le canal", async () => {
    act(() => racine.render(h(ChantierCadre, { actif: true, onglet: "gantt" })));
    const cadre = conteneur.querySelector("iframe")!;
    expect(cadre.getAttribute("src")).toBe("/api/chantier/cadre#gantt");
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);

    act(() => racine.render(h(ChantierCadre, { actif: false, onglet: null })));
    act(() => racine.render(h(ChantierCadre, { actif: true, onglet: "couts" })));
    expect(cadre.getAttribute("src")).toBe("/api/chantier/cadre#gantt");
    expect(port.postMessage).toHaveBeenCalledWith({ type: "chantier-onglet", onglet: "couts" });
  });
});

describe("ChantierCadre : le cadre se met à jour sans que l'on recharge la page", () => {
  const versionsNeuves = (port: FaussePort) => port.postMessage.mock.calls.filter((c) => (c[0] as { type: string }).type === "chantier-version-neuve");

  it("la version du document se lit par HEAD (aucun corps, aucune base), à la présentation puis toutes les 5 minutes", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    expect(versionMoq).toHaveBeenCalledTimes(1);
    expect(versionMoq.mock.calls[0]![1]).toMatchObject({ method: "HEAD", cache: "no-store", credentials: "same-origin" });
    await avancer(60_000 * 5);
    expect(versionMoq).toHaveBeenCalledTimes(2);
    expect(versionsNeuves(port)).toHaveLength(0);
  });

  it("un déploiement change l'ETag : le cadre est prévenu une fois, par son canal", async () => {
    const { cadre, direct } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    versionMoq.mockResolvedValue({ status: 200, headers: { get: () => '"v2"' } });
    await avancer(60_000 * 5);
    expect(versionsNeuves(port)).toHaveLength(1);
    await avancer(60_000 * 5);
    expect(versionsNeuves(port)).toHaveLength(1);
    expect(direct).not.toHaveBeenCalled();
  });

  it("une panne ou un refus de la route ne prévient personne et ne casse rien", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    versionMoq.mockRejectedValueOnce(new Error("réseau")).mockResolvedValue({ status: 401, headers: { get: () => null } });
    await avancer(60_000 * 10);
    expect(versionsNeuves(port)).toHaveLength(0);
  });

  it("caché (hors de /chantier) : la version n'est pas relue", async () => {
    act(() => racine.render(h(ChantierCadre, { actif: true })));
    const cadre = conteneur.querySelector("iframe")!;
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, faussePort());
    versionMoq.mockClear();
    act(() => racine.render(h(ChantierCadre, { actif: false })));
    await avancer(60_000 * 10);
    expect(versionMoq).not.toHaveBeenCalled();
  });

  it("le cadre dit qu'il se recharge : le canal est fermé et celui du document neuf est accepté", async () => {
    const { cadre } = monter();
    const ancien = faussePort();
    fetchMoq.mockResolvedValue(reponse(200, '"1"'));
    await presenter(cadre.contentWindow, ancien);
    await act(async () => {
      ancien.onmessage?.({ data: { type: "chantier-recharge" } });
    });
    expect(ancien.close).toHaveBeenCalled();
    // le relevé n'est plus écrit dans l'ancien canal
    ancien.postMessage.mockClear();
    await avancer(60_000);
    expect(ancien.postMessage).not.toHaveBeenCalled();

    const neuf = faussePort();
    await presenter(cadre.contentWindow, neuf);
    expect(neuf.postMessage.mock.calls[0]![0]).toEqual({ type: "chantier-ok", gestes: true });
    // l'ETag d'avant est oublié : le document neuf reçoit le relevé en entier, pas un 304
    expect(fetchMoq.mock.calls.at(-1)![1].headers).toEqual({});
  });
});

describe("ChantierCadre : le clic droit du cadre est relayé à LIA", () => {
  const clic = { type: "chantier-clic-droit", x: 120, y: 48, genre: "une barre du Gantt", texte: "Hubperso#604" };

  /** Ce que `LiaBoot` recevrait : les événements de la fenêtre. */
  function ecouter() {
    const recus: Array<{ cadre: unknown; x: number; y: number; description: { genre: string; texte?: string } }> = [];
    const ecouteur = (e: Event) => recus.push((e as CustomEvent).detail);
    window.addEventListener("hub:lia-clic-cadre", ecouteur);
    return { recus, arreter: () => window.removeEventListener("hub:lia-clic-cadre", ecouteur) };
  }

  it("un clic droit conforme part vers LIA avec le cadre, la place et la description", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    const { recus, arreter } = ecouter();
    await geste(port, clic);
    arreter();
    expect(recus).toEqual([{ cadre, x: 120, y: 48, description: { genre: "une barre du Gantt", texte: "Hubperso#604" } }]);
  });

  it("un message mal formé, ou venu d'un autre type, n'envoie rien à LIA ni n'écrit un geste", async () => {
    const { cadre } = monter();
    const port = faussePort();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await presenter(cadre.contentWindow, port);
    const { recus, arreter } = ecouter();
    for (const donnee of [null, "clic", { ...clic, x: "1" }, { ...clic, genre: "" }, { ...clic, y: Infinity }, { type: "autre", x: 1, y: 1, genre: "g" }]) {
      await geste(port, donnee);
    }
    arreter();
    expect(recus).toEqual([]);
    expect(gestesMoq).not.toHaveBeenCalled();
  });

  it("cadre caché (hors de /chantier) : rien n'est relayé", async () => {
    act(() => racine.render(h(ChantierCadre, { actif: false })));
    const cadre = conteneur.querySelector("iframe")!;
    vi.spyOn(cadre.contentWindow!, "postMessage").mockImplementation(() => {});
    const port = faussePort();
    await presenter(cadre.contentWindow, port);
    const { recus, arreter } = ecouter();
    await geste(port, clic);
    arreter();
    expect(recus).toEqual([]);
  });
});

// Le cadre décide, à chaque clic droit, ce qui a été visé (`GENRES`, `clicDroitDe` dans chantier/cadre.html) : un
// élément qu'aucun genre ne couvre ne donne AUCUN menu (relevé réel du 28/10 : une carte de la vue Vitesse).
// On exécute ces deux définitions telles qu'elles sont publiées, sur le balisage que le cadre produit.
describe("chantier/cadre.html : tout ce que l'on voit ouvre le menu de LIA", () => {
  const SOURCE = readFileSync(resolve(process.cwd(), "chantier", "cadre.html"), "utf8");
  const debut = SOURCE.indexOf("const GENRES = [");
  const fin = SOURCE.indexOf("function direAuHub(");
  const clicDroitDe = new Function(`${SOURCE.slice(debut, fin)}; return clicDroitDe;`)() as (
    el: Element | null,
  ) => { genre: string; texte: string } | null;

  // jsdom n'a pas `innerText` : le navigateur du cadre, si ; on le remplace par `textContent`.
  const viser = (html: string, selecteur: string) => {
    if (!("innerText" in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
    document.body.innerHTML = html;
    return clicDroitDe(document.querySelector(selecteur));
  };

  const carte =
    '<article class="qa"><h3>Claude</h3><div class="qm"><b>12</b></div><svg class="qsp" viewBox="0 0 10 10"><rect width="3" height="3"/></svg><div class="qbar"><span></span></div></article>';

  it("le programme a bien été extrait", () => {
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);
  });

  it("vue Vitesse (bureau et téléphone) : la carte d'un acteur et chacune de ses parties", () => {
    for (const cadre of [`<main id="view">${carte}</main>`, `<main id="mv">${carte}</main>`]) {
      for (const cible of [".qa", ".qm b", ".qsp rect", ".qbar span", "h3"]) {
        const r = viser(cadre, cible);
        expect(r?.genre, cible).toBe("une carte de vitesse par acteur");
        expect(r?.texte, cible).toContain("Claude");
      }
    }
  });

  it("un graphique, une section, la page : chacun répond, aussi sur le téléphone", () => {
    const graphique = '<section class="band"><h2><span>Délais</span></h2><figure class="fg"><figcaption>Délai</figcaption><svg><rect/></svg></figure></section>';
    expect(viser(`<main id="mv">${graphique}</main>`, "svg rect")?.genre).toBe("un graphique");
    expect(viser(`<main id="mv">${graphique}</main>`, "h2 span")?.genre).toBe("une section de la page");
    expect(viser('<main id="mv"><p>Rien</p></main>', "p")?.genre).toBe("la page");
    expect(viser('<main id="view"><p>Rien</p></main>', "p")?.genre).toBe("la page");
    expect(viser('<header class="mh"><h1>Chantier</h1></header><main id="mv"></main>', "h1")?.genre).toBe("la page");
  });

  it("le plus précis gagne : une barre du Gantt ou un bouton restent ce qu'ils sont", () => {
    expect(viser('<main id="view"><div class="grow"><div class="gbx">x</div></div></main>', ".gbx")?.genre).toBe("une barre du Gantt");
    expect(viser('<main id="mv"><button>Voir</button></main>', "button")?.genre).toBe("un bouton");
  });
});

// Ce que LIA reçoit d'une barre : les FAITS du relevé (Marc, 28/10 : « je veux qu'il puisse voir et analyser lui-même »), pas seulement 300
// caractères de texte. `faitsDe` est pur (tout ce qu'il lit lui est donné) : on l'exécute tel que publié sur un petit relevé.
describe("chantier/cadre.html : une barre du Gantt donne ses faits à LIA", () => {
  const SOURCE = readFileSync(resolve(process.cwd(), "chantier", "cadre.html"), "utf8");
  const debut = SOURCE.indexOf("const GENRES = [");
  const fin = SOURCE.indexOf("function direAuHub(");
  const { faitsDe, clicDroitDe } = new Function(`${SOURCE.slice(debut, fin)}; return { faitsDe, clicDroitDe };`)() as {
    faitsDe: (n: unknown, h: unknown) => string;
    clicDroitDe: (el: Element | null) => { genre: string; texte: string; donnees: string } | null;
  };

  const H = {
    LV: { app: "App", mission: "Mission", "tâche": "Tâche" },
    STE: { acc: "acceptée", cours: "en cours", todo: "à faire", marc: "attend Marc", aband: "abandonnée" } as Record<string, string>,
    ORDRE: ["acc", "cours", "marc", "todo"],
    path: (n: { parent?: unknown }) => {
      const p: unknown[] = [];
      for (let c = n.parent as { parent?: unknown } | undefined; c; c = c.parent as { parent?: unknown } | undefined) p.unshift(c);
      return p as Array<{ t: string }>;
    },
    stLabel: (n: { e: string }) => H.STE[n.e],
    quand: (t: number) => `t${t}`,
    dur: (ms: number) => `${Math.round(ms / 3600000)} h`,
    retTxt: () => "attend ton geste",
    court: (t: string) => t,
    asof: 5_000_000_000,
  };
  const app = { ref: "a", lvl: "app", t: "Hubperso", app: "Hubperso", parent: undefined };
  const mission = { ref: "m", lvl: "mission", t: "Gantt source de vérité", parent: app };
  const t1 = { ref: "t1", lvl: "tâche", leaf: true, t: "Barres par état", e: "acc", start: 1000, end: 4_000_000, open: false, parent: mission, pr: { repo: "Hubperso", n: 573 }, acteurs: [{ qui: "Claude", commits: 3 }] };
  const t2 = { ref: "t2", lvl: "tâche", leaf: true, t: "Page chantier", e: "cours", start: 2000, open: true, parent: mission, acteurs: [{ qui: "Claude" }, { qui: "Marc" }] };
  const t3 = { ref: "t3", lvl: "tâche", leaf: true, t: "Relais mobile", e: "marc", open: true, parent: mission, geste: { t: "choisir" }, oub: {} };
  Object.assign(mission, { ls: [t1, t2, t3], ce: { acc: 1, cours: 1, marc: 1 }, start: 1000, fe: 9000 });

  it("une mission : le chemin, le compte par état, les dates, les acteurs et ce qui reste à suivre", () => {
    const f = faitsDe(mission, H);
    expect(f).toContain("Mission « Gantt source de vérité » (dans Hubperso)");
    expect(f).toContain("3 tâches : 1 acceptée, 1 en cours, 1 attend Marc");
    expect(f).toContain("début : t1000");
    expect(f).toContain("fin prévue : t9000");
    expect(f).toContain("acteurs : Claude (2 tâches), Marc (1 tâche)");
    expect(f).toContain("« Page chantier » en cours");
    expect(f).not.toContain("« Barres par état » acceptée"); // une tâche acceptée n'est plus « à suivre »
  });

  it("une app ou une mission dit le détail de ce qui coince : tâches bloquées et ce qu'elles attendent, preuves en retard, gestes de Marc", () => {
    const b1 = { ref: "b1", n: 12, lvl: "tâche", leaf: true, t: "Brancher la réparation", e: "blk", open: true, waits: [{ n: 9, open: true, ref: "x#9" }, { unknown: true, ref: "y#3" }] };
    const r1 = { ref: "r1", lvl: "tâche", leaf: true, t: "Poser le jeton", e: "ret", open: true, oub: {} };
    const r2 = { ref: "r2", lvl: "tâche", leaf: true, t: "Autre preuve", e: "ret", open: true };
    const g = { ...mission, ls: [b1, r1, r2, t3, t2], ce: { blk: 1, ret: 2, marc: 1, cours: 1 } };
    const f = faitsDe(g, H);
    expect(f).toContain("bloquées : « Brancher la réparation » attend #9, y#3");
    expect(f).toContain("preuve manquante ou en retard (date = fusion) : « Poser le jeton » : attend ton geste ; « Autre preuve »");
    expect(f).toContain("attendent Marc : « Relais mobile » : choisir");
    expect(f).toContain("autres à suivre : « Page chantier » en cours");
    expect(f.indexOf("bloquées")).toBeLessThan(f.indexOf("preuve manquante")); // l'urgent d'abord
  });

  it("les tâches fusionnées qui attendent leur preuve ont leurs titres et la date de fusion, pas seulement un compte", () => {
    const f1 = { ref: "f1", lvl: "tâche", leaf: true, t: "Preuve de DriveAI", e: "fus", open: true, merged: 4_000_000 };
    const p1 = { ref: "p1", lvl: "tâche", leaf: true, t: "Preuve automatique", e: "prog", open: true };
    const g = { ...mission, ls: [f1, p1, t2], ce: { fus: 1, prog: 1, cours: 1 } };
    const f = faitsDe(g, { ...H, STE: { ...H.STE, fus: "fusionnée, à prouver", prog: "attend sa preuve" }, ORDRE: ["fus", "prog", "cours"] });
    expect(f).toContain("fusionnées, preuve à poser (idem) : « Preuve de DriveAI » (t4000000) ; « Preuve automatique »");
    expect(f).not.toContain("autres à suivre : « Preuve");
  });

  it("une app chargée (7 preuves en retard, 8 fusionnées à prouver, des bloquées et des gestes) nomme tous les titres des preuves dans les 1 200 caractères", () => {
    const mk = (e: string, i: number, extra = {}) => ({ ref: `${e}${i}`, lvl: "tâche", leaf: true, t: `Tâche ${e} numéro ${i} avec un titre assez long pour peser`, e, open: true, ...extra });
    const ls = [
      ...Array.from({ length: 7 }, (_, i) => mk("ret", i, { oub: {}, merged: 3_000_000 + i })),
      ...Array.from({ length: 8 }, (_, i) => mk(i % 2 ? "fus" : "prog", i, { merged: 4_000_000 + i })),
      ...Array.from({ length: 3 }, (_, i) => mk("blk", i, { waits: [{ n: 100 + i, open: true, ref: `x#${100 + i}` }] })),
      ...Array.from({ length: 2 }, (_, i) => mk("marc", i, { geste: { t: "valider la durée du refresh token Google" } })),
    ];
    const g = { ...mission, ls, ce: { ret: 7, fus: 4, prog: 4, blk: 3, marc: 2 } };
    // longueur d'une vraie date courte (« ven. 17/10 », « hier 14:10 ») ; les autres dates (relevé, début…) gardent la forme du banc d'essai
    const quand = (t: number) => t < 3_000_000 || t >= 5_000_000 ? H.quand(t) : `mar. 27/10 ${t < 4_000_000 ? "r" + (t - 3_000_000) : "f" + (t - 4_000_000)}`;
    const f = faitsDe(g, { ...H, quand, retTxt: () => "preuve attendue depuis trois jours, la sonde ne lit rien", STE: { ...H.STE, fus: "fusionnée, à prouver", prog: "attend sa preuve" } });
    expect(f.length).toBeLessThanOrEqual(1200);
    for (let i = 0; i < 7; i++) expect(f).toContain(`Tâche ret numéro ${i}`);
    // chaque preuve en retard et chaque fusionnée dit quand elle a été fusionnée
    for (let i = 0; i < 7; i++) expect(f).toContain(`(mar. 27/10 r${i})`);
    for (let i = 0; i < 8; i++) expect(f).toContain(`(mar. 27/10 f${i})`);
    expect(f).toContain("attendent Marc : « Tâche marc numéro 0"); // les gestes de Marc ne sont pas coupés
    for (let i = 0; i < 8; i++) expect(f).toContain(`Tâche ${i % 2 ? "fus" : "prog"} numéro ${i}`);
    expect(f).not.toContain("… et"); // rien n'est caché derrière un compte
  });

  it("sans acteur relevé, les faits le disent au lieu de se taire (LIA n'en invente pas)", () => {
    const sans = { ...mission, ls: [{ ...t2, acteurs: [] }], ce: { cours: 1 } };
    expect(faitsDe(sans, H)).toContain("acteurs : non relevés");
  });

  it("une tâche : son état, sa durée, sa PR, ses acteurs, un geste attendu et un retard", () => {
    const f = faitsDe(t1, H);
    expect(f).toContain("Tâche « Barres par état » (dans Hubperso › Gantt source de vérité)");
    expect(f).toContain("état : acceptée");
    expect(f).toContain("(durée 1 h)");
    expect(f).toContain("PR : Hubperso#573");
    expect(f).toContain("travaillé par : Claude (3 commits)");
    const g = faitsDe(t3, H);
    expect(g).toContain("début : pas commencée");
    expect(g).toContain("geste attendu de Marc : choisir");
    expect(g).toContain("retard : attend ton geste");
  });

  it("les faits restent sous 1 200 caractères et ne portent rien d'inventé : sans relevé, rien", () => {
    const grosse = { ...mission, ls: Array.from({ length: 80 }, (_, i) => ({ ...t2, ref: `x${i}`, t: `Tâche numéro ${i} ${"mot ".repeat(10)}` })), ce: { cours: 80 } };
    expect(faitsDe(grosse, H).length).toBeLessThanOrEqual(1200);
    expect(faitsDe(null, H)).toBe("");
    expect(faitsDe({ t: "sans ref" }, H)).toBe("");
  });

  it("le clic droit sur une ligne d'app ou une barre de mission lit ses faits dans le relevé (les apps sont dans M.apps, pas dans M.N)", () => {
    const g = globalThis as Record<string, unknown>;
    Object.assign(g, { M: { N: { m: mission, t1, t2, t3 }, apps: [app], asof: H.asof }, LV: H.LV, STE: H.STE, ORDRE: H.ORDRE, path: H.path, stLabel: H.stLabel, quand: H.quand, dur: H.dur, retTxt: H.retTxt, court: H.court });
    if (!("innerText" in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
    Object.assign(app, { ref: "app:a", ls: [t1, t2, t3], ce: { acc: 1, cours: 1, marc: 1 }, start: 1000, fe: 9000 });
    try {
      document.body.innerHTML = `<main id="view"><div class="grow" data-ref="app:a"><button class="gbx" data-open="app:a">barre</button></div><div class="grow" data-ref="m"><button class="rb" data-open="m">Gantt</button></div></main>`;
      const barreApp = clicDroitDe(document.querySelector('[data-open="app:a"]'))!;
      expect(barreApp.genre).toBe("une barre du Gantt");
      expect(barreApp.donnees).toContain("App « Hubperso »");
      expect(barreApp.donnees).toContain("3 tâches : 1 acceptée, 1 en cours, 1 attend Marc");
      expect(barreApp.donnees).toContain("fin prévue : t9000");
      const ligneMission = clicDroitDe(document.querySelector('[data-open="m"]'))!;
      expect(ligneMission.donnees).toContain("Mission « Gantt source de vérité »");
    } finally {
      for (const k of ["M", "LV", "STE", "ORDRE", "path", "stLabel", "quand", "dur", "retTxt", "court"]) delete g[k];
    }
  });

  it("un graphique donne à LIA ses mesures (les infobulles de ses barres et points) et sa description, pas seulement son titre et ses axes", () => {
    if (!("innerText" in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
    document.body.innerHTML = `<main id="view"><figure class="fg"><figcaption>Durée d'une tâche</figcaption>
      <svg class="cch" role="img" aria-label="Durée des 12 tâches finies, médiane 3,5 h"><rect class="hit" data-tip="&lt; 1 h : 2 tâches (17 %)"></rect><rect class="hit" data-tip="1–6 h : 7 tâches (58 %)&#10;dont 2 prévues"></rect><rect class="hit" data-tip="1–6 h : 7 tâches (58 %)&#10;dont 2 prévues"></rect></svg>
      <div class="kp2"><b>3,5 h</b><span>médiane</span></div></figure></main>`;
    const r = clicDroitDe(document.querySelector(".hit"))!;
    expect(r.genre).toBe("un graphique");
    expect(r.donnees).toContain("graphique : Durée des 12 tâches finies, médiane 3,5 h");
    expect(r.donnees).toContain("mesures : < 1 h : 2 tâches (17 %) ; 1–6 h : 7 tâches (58 %), dont 2 prévues");
    expect(r.donnees.match(/1–6 h : 7 tâches/g)).toHaveLength(1); // une mesure répétée n'est dite qu'une fois
  });

  it("un graphique chargé garde chaque mesure entière sous 1 200 caractères et compte celles qu'il ne peut pas dire", () => {
    if (!("innerText" in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
    const tips = Array.from({ length: 80 }, (_, i) => `<rect class="hit" data-tip="jour ${i} : ${i * 3} tâches acceptées"></rect>`).join("");
    document.body.innerHTML = `<main id="view"><figure class="fg"><figcaption>Acceptées par jour</figcaption><svg role="img" aria-label="Acceptées par jour">${tips}</svg></figure></main>`;
    const r = clicDroitDe(document.querySelector(".hit"))!;
    expect(r.donnees.length).toBeLessThanOrEqual(1200);
    expect(r.donnees).toContain("jour 0 : 0 tâches acceptées");
    expect(r.donnees).toMatch(/… et \d+ autres mesures$/);
    expect(r.donnees).not.toMatch(/jour \d+ : \d+ tâches acceptée$/); // jamais une mesure coupée en deux
  });

  it("le clic droit sur un élément qui n'est pas dans le relevé donne le texte du bloc en entier, au-delà du repère de 300 caractères", () => {
    if (!("innerText" in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
    document.body.innerHTML = `<main id="view"><article class="qa"><h3>Claude</h3><p>${"chiffre ".repeat(100)}</p></article></main>`;
    const r = clicDroitDe(document.querySelector(".qa h3"))!;
    expect(r.texte.length).toBe(300);
    expect(r.donnees.length).toBeGreaterThan(600);
    expect(r.donnees.length).toBeLessThanOrEqual(1200);
    document.body.innerHTML = '<main id="view"><button>OK</button></main>';
    expect(clicDroitDe(document.querySelector("button"))!.donnees).toBe("");
  });
});

// L'appui long du cadre (650 ms, sans bouger de plus de 8 px) : le PC ne sait pas le faire dans un cadre isolé, la CI le fait (Hubperso#616).
// On exécute les écouteurs tels que publiés sur un faux `document` qui les enregistre, puis on rejoue les gestes.
describe("chantier/cadre.html : l'appui long ouvre le menu de LIA sur une barre du Gantt", () => {
  const SOURCE = readFileSync(resolve(process.cwd(), "chantier", "cadre.html"), "utf8");
  const debut = SOURCE.indexOf("const GENRES = [");
  const marqueFin = "['pointerup', 'pointercancel', 'scroll'].forEach(t => document.addEventListener(t, finLong, true));";
  const fin = SOURCE.indexOf(marqueFin) + marqueFin.length;
  type Gestionnaire = (e: Record<string, unknown>) => void;
  let ecouteurs: Record<string, Gestionnaire[]>;
  let dit: ReturnType<typeof vi.fn>;
  let barre: Element;

  const lancer = (type: string, e: Record<string, unknown>) => (ecouteurs[type] ?? []).forEach((g) => g(e));
  const doigt = (type: string, x: number, y: number, cible: Element = barre, pointerType = "touch") =>
    lancer(type, { type, pointerType, clientX: x, clientY: y, target: cible, shiftKey: false });

  beforeEach(() => {
    vi.useFakeTimers();
    if (!("innerText" in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
    document.body.innerHTML = '<main id="view"><div class="grow"><button class="gbx" data-open="t1">Barre</button><input id="champ"></div></main>';
    barre = document.querySelector(".gbx")!;
    ecouteurs = {};
    dit = vi.fn(() => true);
    const faussDocument = { addEventListener: (t: string, g: Gestionnaire) => (ecouteurs[t] = [...(ecouteurs[t] ?? []), g]) };
    new Function("document", "window", `${SOURCE.slice(debut, fin)}`)(faussDocument, { hubClicDroit: dit });
  });
  afterEach(() => vi.useRealTimers());

  it("un doigt tenu 700 ms sur la barre : le menu s'ouvre au point d'appui, avec le bon genre", () => {
    doigt("pointerdown", 120.4, 48.6);
    vi.advanceTimersByTime(649);
    expect(dit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(51);
    expect(dit).toHaveBeenCalledTimes(1);
    expect(dit.mock.calls[0]![0]).toMatchObject({ type: "chantier-clic-droit", x: 120, y: 49, genre: "une barre du Gantt" });
  });

  it("levé trop tôt, déplacé de plus de 8 px, à la souris ou dans un champ : rien", () => {
    doigt("pointerdown", 10, 10);
    vi.advanceTimersByTime(300);
    doigt("pointerup", 10, 10);
    vi.advanceTimersByTime(1000);
    doigt("pointerdown", 10, 10);
    doigt("pointermove", 30, 10);
    vi.advanceTimersByTime(1000);
    doigt("pointerdown", 10, 10, barre, "mouse");
    vi.advanceTimersByTime(1000);
    doigt("pointerdown", 10, 10, document.querySelector("#champ")!);
    vi.advanceTimersByTime(1000);
    expect(dit).not.toHaveBeenCalled();
  });

  it("un petit tremblement (moins de 8 px) ne coupe pas l'appui long", () => {
    doigt("pointerdown", 10, 10);
    doigt("pointermove", 14, 13);
    vi.advanceTimersByTime(700);
    expect(dit).toHaveBeenCalledTimes(1);
  });
});

