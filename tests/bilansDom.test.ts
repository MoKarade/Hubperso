// @vitest-environment jsdom
//
// tests/bilansDom.test.ts — l'onglet « Bilans » dans un DOM : chargement, liste, bascule jour/semaine, précédents,
// états honnêtes (vide, droit Drive manquant), et le cadre isolé. Réseau simulé, données FICTIVES.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BilansVue } from "@/components/BilansVue";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let conteneur: HTMLDivElement;
let racine: Root;
const fetchMoq = vi.spyOn(globalThis, "fetch");

const BILANS = [
  { id: "jour000000001", genre: "jour", date: "2026-10-28", nom: "bilan-jour-2026-10-28.html" },
  { id: "jour000000002", genre: "jour", date: "2026-10-27", nom: "bilan-jour-2026-10-27.html" },
  { id: "sem0000000001", genre: "semaine", date: "2026-10-25", nom: "bilan-semaine-2026-10-25.html" },
];

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
});
afterEach(() => {
  act(() => racine.unmount());
  conteneur.remove();
  fetchMoq.mockReset();
});

async function monter(reponse: Response) {
  fetchMoq.mockResolvedValueOnce(reponse);
  await act(async () => {
    racine.render(h(BilansVue));
  });
}
const cadre = () => conteneur.querySelector<HTMLIFrameElement>("iframe");

describe("BilansVue", () => {
  it("affiche le bilan du jour le plus récent dans un cadre isolé, sans réseau automatique répété", async () => {
    await monter(Response.json({ bilans: BILANS }));
    expect(fetchMoq).toHaveBeenCalledTimes(1);
    expect(conteneur.querySelector("h2")?.textContent).toBe("mercredi 28 octobre 2026");
    expect(cadre()?.getAttribute("src")).toBe("/api/bilans/jour000000001");
    const sandbox = cadre()?.getAttribute("sandbox") ?? "";
    expect(sandbox).not.toContain("allow-same-origin");
  });

  it("bascule sur la semaine, puis relit un bilan précédent", async () => {
    await monter(Response.json({ bilans: BILANS }));
    const onglet = (nom: string) => [...conteneur.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === nom)!;
    await act(async () => onglet("De la semaine").click());
    expect(cadre()?.getAttribute("src")).toBe("/api/bilans/sem0000000001");
    await act(async () => onglet("Du jour").click());
    const precedent = [...conteneur.querySelectorAll<HTMLButtonElement>(".bilans__precedent")].find((b) => b.textContent === "mardi 27 octobre 2026")!;
    await act(async () => precedent.click());
    expect(cadre()?.getAttribute("src")).toBe("/api/bilans/jour000000002");
  });

  it("aucun bilan : le dit, sans cadre ni bilan inventé", async () => {
    await monter(Response.json({ bilans: [] }));
    expect(conteneur.textContent).toContain("Aucun bilan du jour pour l'instant : le dossier Drive n'en contient aucun");
    expect(cadre()).toBeNull();
  });

  it("droit Drive manquant : message qui dit de se reconnecter, en alerte", async () => {
    await monter(Response.json({ error: "droit-drive-absent" }, { status: 409 }));
    expect(conteneur.querySelector('[role="alert"]')?.textContent).toMatch(/reconnecte-toi/i);
    expect(cadre()).toBeNull();
  });

  it("réponse hors contrat ou réseau coupé : indisponible, jamais une liste vide", async () => {
    await monter(Response.json({ bilans: "x" }));
    expect(conteneur.querySelector('[role="alert"]')?.textContent).toMatch(/Google ne répond pas/);
    fetchMoq.mockRejectedValueOnce(new Error("coupé"));
    await act(async () => conteneur.querySelector<HTMLButtonElement>(".bilans__actualiser")!.click());
    expect(conteneur.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("« Actualiser » relit la liste", async () => {
    await monter(Response.json({ bilans: [] }));
    fetchMoq.mockResolvedValueOnce(Response.json({ bilans: BILANS }));
    await act(async () => conteneur.querySelector<HTMLButtonElement>(".bilans__actualiser")!.click());
    expect(fetchMoq).toHaveBeenCalledTimes(2);
    expect(cadre()).not.toBeNull();
  });
});
