// tests/bilansDrive.test.ts — lecture des bilans dans Drive : jamais hors du dossier, jamais de jeton dans la
// requête de liste ni dans un journal. Drive est simulé (aucun réseau).

import { afterEach, describe, expect, it, vi } from "vitest";
import { listerBilans, lireBilan } from "@/lib/bilansDrive";

const DOSSIER = "dossierBilans123456";
const ID = "fichierBilan1234567";
const JETON = "jeton-de-test";

const fetchMoq = vi.spyOn(globalThis, "fetch");
afterEach(() => fetchMoq.mockReset());

const meta = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  name: "bilan-jour-2026-10-28.html",
  mimeType: "text/html",
  parents: [DOSSIER],
  trashed: false,
  size: "1200",
  ...extra,
});

describe("listerBilans", () => {
  it("demande les enfants du dossier, avec le jeton en en-tête (jamais dans l'URL)", async () => {
    fetchMoq.mockResolvedValueOnce(Response.json({ files: [{ id: ID, name: "bilan-jour-2026-10-28.html", mimeType: "text/html" }, { id: "zzzzzzzzzzzz", name: "autre.html", mimeType: "text/html" }] }));
    const r = await listerBilans(JETON, DOSSIER);
    expect(r).toEqual({ ok: true, valeur: [{ id: ID, genre: "jour", date: "2026-10-28", nom: "bilan-jour-2026-10-28.html" }] });
    const [url, init] = fetchMoq.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("q")).toContain(`'${DOSSIER}' in parents and trashed = false`);
    expect(String(url)).not.toContain(JETON);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${JETON}`);
  });

  it("un dossier vide : liste vide (l'onglet dit « Aucun bilan »), pas une erreur", async () => {
    fetchMoq.mockResolvedValueOnce(Response.json({ files: [] }));
    expect(await listerBilans(JETON, DOSSIER)).toEqual({ ok: true, valeur: [] });
  });

  it("un identifiant de dossier qui n'est pas un identifiant ne part jamais dans une requête", async () => {
    expect(await listerBilans(JETON, "x' or 'a'='a")).toEqual({ ok: false, raison: "hors-contrat" });
    expect(fetchMoq).not.toHaveBeenCalled();
  });

  it("dit pourquoi : droit refusé, dossier absent, réponse hors forme, réseau", async () => {
    fetchMoq.mockResolvedValueOnce(new Response("", { status: 403 }));
    expect(await listerBilans(JETON, DOSSIER)).toEqual({ ok: false, raison: "refuse" });
    fetchMoq.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await listerBilans(JETON, DOSSIER)).toEqual({ ok: false, raison: "introuvable" });
    fetchMoq.mockResolvedValueOnce(Response.json({ pas: "files" }));
    expect(await listerBilans(JETON, DOSSIER)).toEqual({ ok: false, raison: "hors-contrat" });
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMoq.mockRejectedValueOnce(new Error("coupé"));
    expect(await listerBilans(JETON, DOSSIER)).toEqual({ ok: false, raison: "injoignable" });
    expect(JSON.stringify(journal.mock.calls)).not.toContain(JETON);
    journal.mockRestore();
  });
});

describe("lireBilan", () => {
  it("rend le HTML d'un bilan du dossier", async () => {
    fetchMoq.mockResolvedValueOnce(Response.json(meta())).mockResolvedValueOnce(new Response("<p>fictif</p>"));
    const r = await lireBilan(JETON, DOSSIER, ID);
    expect(r).toMatchObject({ ok: true, valeur: { html: "<p>fictif</p>", bilan: { genre: "jour", date: "2026-10-28" } } });
    expect(String(fetchMoq.mock.calls[1]![0])).toContain("alt=media");
  });

  it("un fichier hors du dossier, en corbeille ou hors convention n'existe pas : le contenu n'est jamais demandé", async () => {
    for (const extra of [{ parents: ["autreDossier1234"] }, { trashed: true }, { name: "secret.html" }, { parents: undefined }]) {
      fetchMoq.mockReset();
      fetchMoq.mockResolvedValueOnce(Response.json(meta(extra)));
      expect(await lireBilan(JETON, DOSSIER, ID), JSON.stringify(extra)).toEqual({ ok: false, raison: "introuvable" });
      expect(fetchMoq).toHaveBeenCalledTimes(1);
    }
  });

  it("trop gros : refusé avant de lire le contenu", async () => {
    fetchMoq.mockResolvedValueOnce(Response.json(meta({ size: String(3 * 1024 * 1024) })));
    expect(await lireBilan(JETON, DOSSIER, ID)).toEqual({ ok: false, raison: "hors-contrat" });
    expect(fetchMoq).toHaveBeenCalledTimes(1);
  });

  it("identifiants invalides : aucun appel", async () => {
    expect(await lireBilan(JETON, DOSSIER, "../etc")).toEqual({ ok: false, raison: "hors-contrat" });
    expect(await lireBilan(JETON, "mauvais!", ID)).toEqual({ ok: false, raison: "hors-contrat" });
    expect(fetchMoq).not.toHaveBeenCalled();
  });
});
