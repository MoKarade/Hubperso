// @vitest-environment jsdom
//
// tests/chantierCadreDom.test.ts — ce que `ChantierCadre` fait APRÈS son premier rendu : attendre que le
// cadre soit prêt, lui poster le relevé, ne le relire que par `If-None-Match`, ne rien lire onglet caché,
// ne répondre à personne d'autre que son cadre. Même montage que tests/composantsDom.test.ts.

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

function monter() {
  act(() => racine.render(h(ChantierCadre)));
  const cadre = conteneur.querySelector("iframe")!;
  const poste = vi.spyOn(cadre.contentWindow!, "postMessage").mockImplementation(() => {});
  return { cadre, poste };
}

/** Les messages de DONNÉES postés au cadre (relevé ou état), sans les sondes. */
function donnees(poste: ReturnType<typeof monter>["poste"]) {
  return poste.mock.calls.map((c) => c[0] as { type: string; message?: string; octets?: ArrayBuffer }).filter((m) => m.type !== "chantier-ping");
}

/** Le cadre annonce qu'il est prêt (ou n'importe quelle autre fenêtre se fait passer pour lui). */
async function message(donnee: unknown, source: Window | null) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { data: donnee, source }));
  });
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

  it("ne lit rien tant que le cadre n'a pas dit qu'il est prêt", async () => {
    monter();
    await avancer(60_000 * 3);
    expect(fetchMoq).not.toHaveBeenCalled();
  });

  it("prêt : lit le relevé avec la session, le poste à son cadre, retient l'ETag", async () => {
    const { cadre, poste } = monter();
    fetchMoq.mockResolvedValue(reponse(200, '"1760000000000"'));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    expect(fetchMoq).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMoq.mock.calls[0]!;
    expect(url).toBe("/api/chantier/releve");
    expect(init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(init.headers).toEqual({});
    expect(donnees(poste)).toHaveLength(1);
    expect(donnees(poste)[0]).toMatchObject({ type: "chantier-releve" });
    expect(donnees(poste)[0]!.octets).toBeInstanceOf(ArrayBuffer);
  });

  it("relit chaque minute avec If-None-Match ; 304 : rien n'est reposté", async () => {
    const { cadre, poste } = monter();
    fetchMoq.mockResolvedValueOnce(reponse(200, '"42"')).mockResolvedValue(reponse(304, '"42"'));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    await avancer(60_000);
    expect(fetchMoq).toHaveBeenCalledTimes(2);
    expect(fetchMoq.mock.calls[1]![1].headers).toEqual({ "If-None-Match": '"42"' });
    expect(donnees(poste)).toHaveLength(1);
  });

  it("un nouveau relevé (200 après 304) est reposté", async () => {
    const { cadre, poste } = monter();
    fetchMoq
      .mockResolvedValueOnce(reponse(200, '"42"'))
      .mockResolvedValueOnce(reponse(304, '"42"'))
      .mockResolvedValue(reponse(200, '"43"'));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    await avancer(60_000 * 2);
    expect(donnees(poste)).toHaveLength(2);
    expect(fetchMoq.mock.calls[2]![1].headers).toEqual({ "If-None-Match": '"42"' });
  });

  it("une panne est dite au cadre (jamais un relevé vide), et le bandeau s'efface au retour", async () => {
    const { cadre, poste } = monter();
    fetchMoq
      .mockResolvedValueOnce(reponse(200, '"42"'))
      .mockResolvedValueOnce(reponse(500))
      .mockResolvedValue(reponse(304, '"42"'));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    await avancer(60_000);
    expect(donnees(poste)[1]).toMatchObject({ type: "chantier-etat" });
    expect(donnees(poste)[1]!.message).toContain("indisponible");
    await avancer(60_000);
    expect(donnees(poste)[2]).toEqual({ type: "chantier-etat", message: "" });
    await avancer(60_000);
    expect(donnees(poste)).toHaveLength(3);
  });

  it("le réseau tombe : un message, pas une exception", async () => {
    const { cadre, poste } = monter();
    fetchMoq.mockRejectedValue(new TypeError("Failed to fetch"));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    expect(donnees(poste)[0]).toMatchObject({ type: "chantier-etat" });
  });

  it("n'écoute QUE son cadre : une autre fenêtre ou un autre message ne déclenche rien", async () => {
    const { cadre } = monter();
    fetchMoq.mockResolvedValue(reponse(200, '"1"'));
    await message({ type: "chantier-pret" }, window);
    await message({ type: "chantier-pret" }, null);
    await message({ type: "autre" }, cadre.contentWindow);
    await message("chantier-pret", cadre.contentWindow);
    expect(fetchMoq).not.toHaveBeenCalled();
  });

  it("onglet caché : rien n'est lu ; au retour, une lecture tout de suite", async () => {
    const { cadre } = monter();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
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

  it("sonde le cadre à son chargement, puis chaque seconde jusqu'à sa réponse", async () => {
    const { cadre, poste } = monter();
    await avancer(3_000);
    expect(poste.mock.calls).toEqual([[{ type: "chantier-ping" }, "*"], [{ type: "chantier-ping" }, "*"], [{ type: "chantier-ping" }, "*"]]);
    cadre.dispatchEvent(new Event("load"));
    expect(poste).toHaveBeenCalledTimes(4);
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    const fini = poste.mock.calls.length;
    await avancer(5_000);
    expect(poste.mock.calls.length).toBe(fini); // il a répondu : plus de sonde
  });

  it("un deuxième « prêt » (réponse à une sonde) ne redemande rien", async () => {
    const { cadre } = monter();
    fetchMoq.mockResolvedValue(reponse(200, '"42"'));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    expect(fetchMoq).toHaveBeenCalledTimes(1);
  });

  it("démonté : plus de minuteur ni d'écoute", async () => {
    const { cadre } = monter();
    fetchMoq.mockResolvedValue(reponse(304, '"1"'));
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    fetchMoq.mockClear();
    act(() => racine.unmount());
    racine = createRoot(conteneur);
    await avancer(60_000 * 3);
    await message({ type: "chantier-pret" }, cadre.contentWindow);
    expect(fetchMoq).not.toHaveBeenCalled();
  });
});
