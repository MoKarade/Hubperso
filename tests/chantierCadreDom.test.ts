// @vitest-environment jsdom
//
// tests/chantierCadreDom.test.ts — ce que `ChantierCadre` fait APRÈS son premier rendu : recevoir le canal
// du cadre, lui poster le relevé, ne le relire que par `If-None-Match`, ne rien lire onglet caché, ne
// répondre à personne d'autre que son cadre — et ne JAMAIS écrire par `postMessage(…, "*")`.
// Même montage que tests/composantsDom.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChantierCadre } from "@/components/ChantierCadre";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let conteneur: HTMLDivElement;
let racine: Root;
const fetchMoq = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMoq);
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
});

afterEach(() => {
  act(() => racine.unmount());
  conteneur.remove();
  fetchMoq.mockReset();
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
  return { postMessage: vi.fn(), close: vi.fn() };
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

/** Les messages de DONNÉES écrits dans le canal (sans le « ok » d'accueil). */
function donnees(port: FaussePort) {
  return port.postMessage.mock.calls
    .map((c) => c[0] as { type: string; message?: string; octets?: ArrayBuffer })
    .filter((m) => m.type !== "chantier-ok");
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
    expect(port.postMessage.mock.calls[0]![0]).toEqual({ type: "chantier-ok" });
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
});
