// tests/graphes.test.ts — lire les graphes de code dans les artefacts GitHub (lib/graphes.ts).
//
// Aucun réseau : `fetch` est injecté. On prouve les états HONNÊTES (non branché, aucun graphe,
// expiré, erreur), le choix du bon artefact (main seulement), et qu'une archive qui ne correspond
// pas au dépôt est refusée.

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEPOTS,
  chargerGraphe,
  choisirArtefact,
  depotDepuisId,
  etatDepot,
  idDepot,
  lireArchiveGraphe,
  lireMeta,
  viderCacheGraphes,
} from "../lib/graphes";
import { fabriquerZip } from "./zipFabrique";

const SHA = "a".repeat(40);
const ENV = { GITHUB_GRAPHES_TOKEN: "jeton-de-test" };

const meta = (over: Record<string, unknown> = {}) => ({
  depot: "Hubperso",
  sha: SHA,
  genereLe: "2026-10-21T15:00:00Z",
  noeuds: 120,
  aretes: 300,
  filtre: "fichiers-v1;max400",
  ...over,
});

const archive = (m: unknown = meta(), html = "<html>graphe</html>") =>
  fabriquerZip([
    { nom: "graph.html", contenu: html },
    { nom: "meta.json", contenu: JSON.stringify(m) },
  ]);

const artefact = (over: Record<string, unknown> = {}) => ({
  id: 7,
  expired: false,
  created_at: "2026-10-21T15:00:00Z",
  size_in_bytes: 2048,
  workflow_run: { head_sha: SHA, head_branch: "main" },
  ...over,
});

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });

describe("noms de dépôts", () => {
  it("l'identifiant d'URL est sans point de tête ni tiret final, et se retrouve", () => {
    expect(idDepot("batchchef-")).toBe("batchchef");
    expect(idDepot(".github")).toBe("github");
    expect(idDepot("Hubperso")).toBe("hubperso");
    for (const d of DEPOTS) expect(depotDepuisId(idDepot(d))).toBe(d);
    // Les identifiants sont uniques : sinon deux dépôts se masqueraient.
    expect(new Set(DEPOTS.map(idDepot)).size).toBe(DEPOTS.length);
  });

  it("ne rend JAMAIS un nom venu de l'URL tel quel", () => {
    expect(depotDepuisId("../../etc")).toBeNull();
    expect(depotDepuisId("hubperso/../x")).toBeNull();
    expect(depotDepuisId("")).toBeNull();
    expect(depotDepuisId("HUBPERSO")).toBeNull();
  });
});

describe("choisirArtefact", () => {
  it("prend le plus récent venu de main, pas celui d'une PR", () => {
    const r = choisirArtefact({
      artifacts: [
        artefact({ id: 3, workflow_run: { head_sha: SHA, head_branch: "claude/x" } }),
        artefact({ id: 2 }),
        artefact({ id: 1 }),
      ],
    });
    expect(r?.id).toBe(2);
  });
  it("rend null s'il n'y en a pas, ou si la réponse est bizarre", () => {
    expect(choisirArtefact({ artifacts: [] })).toBeNull();
    expect(choisirArtefact({})).toBeNull();
    expect(choisirArtefact(null)).toBeNull();
    expect(choisirArtefact({ artifacts: [{ id: 1, workflow_run: { head_branch: "x" } }] })).toBeNull();
  });
});

describe("lireMeta", () => {
  it("accepte un meta.json conforme", () => {
    expect(lireMeta(meta())?.noeuds).toBe(120);
  });
  it("refuse la moindre dérive", () => {
    for (const mauvais of [
      meta({ sha: "pas-un-sha" }),
      meta({ noeuds: -1 }),
      meta({ noeuds: 1.5 }),
      meta({ aretes: "3" }),
      meta({ genereLe: "hier" }),
      meta({ depot: "" }),
      null,
      "texte",
    ]) {
      expect(lireMeta(mauvais)).toBeNull();
    }
  });
});

describe("lireArchiveGraphe", () => {
  it("lit graph.html et meta.json d'une archive conforme", () => {
    const r = lireArchiveGraphe(archive(), "Hubperso", SHA);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.graphe.html).toBe("<html>graphe</html>");
      expect(r.graphe.meta.filtre).toBe("fichiers-v1;max400");
    }
  });

  it("accepte « Proprietaire/Depot » dans meta.depot, et un sha abrégé", () => {
    const r = lireArchiveGraphe(archive(meta({ depot: "MoKarade/Hubperso", sha: SHA.slice(0, 7) })), "Hubperso", SHA);
    expect(r.ok).toBe(true);
  });

  it("refuse un graphe copié d'un AUTRE dépôt", () => {
    const r = lireArchiveGraphe(archive(meta({ depot: "FinanceAI" })), "Hubperso", SHA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/FinanceAI/);
  });

  it("refuse un meta.json d'un autre commit que celui de l'artefact", () => {
    const r = lireArchiveGraphe(archive(meta({ sha: "b".repeat(40) })), "Hubperso", SHA);
    expect(r.ok).toBe(false);
  });

  it("refuse une archive sans graph.html, un meta non JSON, une archive illisible", () => {
    expect(lireArchiveGraphe(fabriquerZip([{ nom: "meta.json", contenu: "{}" }]), "Hubperso", SHA).ok).toBe(false);
    expect(
      lireArchiveGraphe(
        fabriquerZip([
          { nom: "graph.html", contenu: "x" },
          { nom: "meta.json", contenu: "pas du json" },
        ]),
        "Hubperso",
        SHA,
      ).ok,
    ).toBe(false);
    expect(lireArchiveGraphe(Buffer.from("n'importe quoi, assez long pour un zip"), "Hubperso", SHA).ok).toBe(false);
  });
});

describe("etatDepot", () => {
  it("sans jeton : « non branché », et AUCUN appel réseau", async () => {
    let appels = 0;
    const f = (async () => {
      appels++;
      return json({});
    }) as typeof fetch;
    expect(await etatDepot("Hubperso", {}, f)).toEqual({ etat: "non-branche" });
    expect(await etatDepot("Hubperso", { GITHUB_GRAPHES_TOKEN: "  " }, f)).toEqual({ etat: "non-branche" });
    expect(appels).toBe(0);
  });

  it("interroge le bon dépôt avec le jeton, filtré sur le nom d'artefact", async () => {
    let vu: { url: string; auth: string | null } | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      vu = { url, auth: new Headers(init?.headers).get("authorization") };
      return json({ artifacts: [artefact()] });
    }) as unknown as typeof fetch;
    const e = await etatDepot("batchchef-", ENV, f);
    expect(vu!.url).toBe(
      "https://api.github.com/repos/MoKarade/batchchef-/actions/artifacts?name=graphe&per_page=20",
    );
    expect(vu!.auth).toBe("Bearer jeton-de-test");
    expect(e).toEqual({ etat: "ok", artefactId: 7, sha: SHA, creeLe: "2026-10-21T15:00:00Z", octets: 2048 });
  });

  it("« aucun » quand le dépôt n'a rien publié, « expire » quand l'artefact a expiré", async () => {
    expect(await etatDepot("Hubperso", ENV, (async () => json({ artifacts: [] })) as typeof fetch)).toEqual({
      etat: "aucun",
    });
    expect(
      await etatDepot("Hubperso", ENV, (async () => json({ artifacts: [artefact({ expired: true })] })) as typeof fetch),
    ).toEqual({ etat: "expire", creeLe: "2026-10-21T15:00:00Z" });
  });

  it("dit la cause d'un échec : jeton refusé, dépôt introuvable, 500, réseau", async () => {
    const cas: [number, RegExp][] = [
      [401, /refuse le jeton/],
      [403, /refuse le jeton/],
      [404, /introuvable/],
      [500, /HTTP 500/],
    ];
    for (const [status, motif] of cas) {
      const e = await etatDepot("Hubperso", ENV, (async () => json({}, status)) as typeof fetch);
      expect(e.etat).toBe("erreur");
      if (e.etat === "erreur") expect(e.detail).toMatch(motif);
    }
    const reseau = await etatDepot("Hubperso", ENV, (async () => {
      throw new Error("réseau coupé");
    }) as typeof fetch);
    expect(reseau).toEqual({ etat: "erreur", detail: "réseau coupé" });
  });

  it("un artefact sans commit lisible est une erreur, pas un graphe sans date", async () => {
    const e = await etatDepot(
      "Hubperso",
      ENV,
      (async () => json({ artifacts: [artefact({ workflow_run: { head_branch: "main" } })] })) as typeof fetch,
    );
    expect(e.etat).toBe("erreur");
  });
});

describe("chargerGraphe", () => {
  beforeEach(() => viderCacheGraphes());

  function fetchGithub(zip: Buffer, compteur: { n: number }): typeof fetch {
    return (async (url: string) => {
      if (String(url).includes("/zip")) {
        compteur.n++;
        return new Response(new Uint8Array(zip), { status: 200 });
      }
      return json({ artifacts: [artefact()] });
    }) as unknown as typeof fetch;
  }

  it("télécharge, lit, et met en cache PAR ARTEFACT (un second appel ne retélécharge pas)", async () => {
    const compteur = { n: 0 };
    const f = fetchGithub(archive(), compteur);
    const a = await chargerGraphe("Hubperso", ENV, f);
    const b = await chargerGraphe("Hubperso", ENV, f);
    expect(a.ok && b.ok).toBe(true);
    expect(compteur.n).toBe(1);
  });

  it("un nouvel artefact (autre id) est retéléchargé : le cache ne périme pas", async () => {
    const compteur = { n: 0 };
    await chargerGraphe("Hubperso", ENV, fetchGithub(archive(), compteur));
    const f2 = (async (url: string) => {
      if (String(url).includes("/zip")) {
        compteur.n++;
        return new Response(new Uint8Array(archive()), { status: 200 });
      }
      return json({ artifacts: [artefact({ id: 8 })] });
    }) as unknown as typeof fetch;
    await chargerGraphe("Hubperso", ENV, f2);
    expect(compteur.n).toBe(2);
  });

  it("n'en met PAS en cache un graphe refusé", async () => {
    const compteur = { n: 0 };
    const mauvais = fetchGithub(archive(meta({ depot: "Autre" })), compteur);
    const r1 = await chargerGraphe("Hubperso", ENV, mauvais);
    await chargerGraphe("Hubperso", ENV, mauvais);
    expect(r1.ok).toBe(false);
    expect(compteur.n).toBe(2);
  });

  it("chaque état sans graphe est une phrase claire, jamais un rejet", async () => {
    const non = await chargerGraphe("Hubperso", {}, (async () => json({})) as typeof fetch);
    expect(non).toEqual({ ok: false, detail: expect.stringMatching(/jeton de lecture/) });
    const aucun = await chargerGraphe("Hubperso", ENV, (async () => json({ artifacts: [] })) as typeof fetch);
    expect(aucun).toEqual({ ok: false, detail: expect.stringMatching(/aucun graphe/) });
    const refus = await chargerGraphe(
      "Hubperso",
      ENV,
      (async (url: string) =>
        String(url).includes("/zip") ? new Response("x", { status: 410 }) : json({ artifacts: [artefact()] })) as unknown as typeof fetch,
    );
    expect(refus).toEqual({ ok: false, detail: expect.stringMatching(/HTTP 410/) });
  });
});
