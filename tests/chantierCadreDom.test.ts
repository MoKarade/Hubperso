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
const COUTS = { suivies: 1, apps: 2, alertes: 0, totaux: [], note: null, detail: [] };

beforeEach(() => {
  vi.useFakeTimers();
  coutsMoq.mockResolvedValue({ ok: true, status: 200, json: async () => COUTS });
  gestesMoq.mockResolvedValue({ ok: true, status: 201 });
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url === "/api/chantier/couts" ? coutsMoq(url, init) : url === "/api/chantier/gestes" ? gestesMoq(url, init) : fetchMoq(url, init),
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
    .filter((m) => m.type !== "chantier-ok" && m.type !== "chantier-couts" && m.type !== "chantier-geste");
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
