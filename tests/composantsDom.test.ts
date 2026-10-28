// @vitest-environment jsdom
//
// tests/composantsDom.test.ts — les INTERACTIONS que le rendu statique ne peut pas tester.
//
// tests/composantsInteractifs.test.ts vérifie le premier rendu (HTML serveur). Ce qui se
// passe APRÈS — un raccourci clavier, un clic, une minuterie, l'enregistrement du service
// worker — exige un DOM : jsdom (dépendance de développement, gratuite, approuvée par le
// gérant le 30/09). Rendu avec `react-dom/client` + `act`, sans bibliothèque de test en plus.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HubAction } from "@mokarade/hub-contract";

const moq = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  actionDeclencher: vi.fn(async () => ({ statut: "ok", message: "Déclenché." })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: moq.refresh, push: moq.push }),
}));
vi.mock("@/app/actions", () => ({ actionDeclencher: moq.actionDeclencher }));

import { PaletteCommandes } from "@/components/PaletteCommandes";
import { RefreshControls } from "@/components/RefreshControls";
import { ServiceWorker } from "@/components/ServiceWorker";
import { BoutonTrigger } from "@/components/BoutonTrigger";
import { commandes, type Commande } from "@/lib/palette";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let conteneur: HTMLDivElement;
let racine: Root;

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
});

afterEach(() => {
  act(() => racine.unmount());
  conteneur.remove();
  for (const f of Object.values(moq)) f.mockClear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function monter(el: ReturnType<typeof h>) {
  act(() => racine.render(el));
}

function touche(cible: EventTarget, key: string, extra: KeyboardEventInit = {}) {
  act(() => {
    cible.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
  });
}

/** Saisie dans un champ contrôlé par React : le setter natif, puis l'événement `input`. */
function saisir(champ: HTMLInputElement, texte: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(champ, texte);
    champ.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function cliquer(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

// ── PaletteCommandes ───────────────────────────────────────────────────────────────

describe("PaletteCommandes — clavier et clic", () => {
  const liste = commandes([
    { id: "carai", nom: "CarAI", url: "https://carai.hubperso.com" },
    { id: "jobai", nom: "JobAI", url: "https://emploi.hubperso.com" },
  ]);
  const dialogue = () => conteneur.querySelector('[role="dialog"]');
  const champ = () => conteneur.querySelector<HTMLInputElement>("input.palette__champ")!;
  const lignes = () => [...conteneur.querySelectorAll<HTMLLIElement>('[role="option"]')];

  it("Ctrl+K ouvre (champ focalisé), Ctrl+K referme, Échap referme", () => {
    monter(h(PaletteCommandes, { commandes: liste }));
    expect(dialogue()).toBeNull();
    touche(document, "k", { ctrlKey: true });
    expect(dialogue()).not.toBeNull();
    expect(document.activeElement).toBe(champ());
    touche(document, "K", { ctrlKey: true });
    expect(dialogue()).toBeNull();
    touche(document, "k", { metaKey: true });
    expect(dialogue()).not.toBeNull();
    touche(document, "Escape");
    expect(dialogue()).toBeNull();
  });

  it("filtre à la saisie, et dit honnêtement quand rien ne correspond", () => {
    monter(h(PaletteCommandes, { commandes: liste }));
    touche(document, "k", { ctrlKey: true });
    const toutes = lignes().length;
    saisir(champ(), "jobai");
    expect(lignes().length).toBeGreaterThan(0);
    expect(lignes().length).toBeLessThan(toutes);
    expect(lignes().every((l) => /jobai/i.test(l.textContent ?? ""))).toBe(true);
    saisir(champ(), "zzzz-aucune-commande");
    expect(lignes()).toHaveLength(0);
    expect(conteneur.textContent).toContain("Aucune commande ne correspond.");
  });

  it("flèches : le curseur descend, boucle, remonte ; Entrée lance une page interne via le routeur", () => {
    monter(h(PaletteCommandes, { commandes: liste }));
    touche(document, "k", { ctrlKey: true });
    const n = lignes().length;
    expect(lignes()[0]!.getAttribute("aria-selected")).toBe("true");
    touche(champ(), "ArrowDown");
    expect(lignes()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(champ().getAttribute("aria-activedescendant")).toBe(lignes()[1]!.id);
    touche(champ(), "ArrowUp");
    touche(champ(), "ArrowUp");
    expect(lignes()[n - 1]!.getAttribute("aria-selected")).toBe("true");
    touche(champ(), "ArrowDown");
    // Retour en tête : « Tableau de bord », une page interne.
    touche(champ(), "Enter");
    expect(moq.push).toHaveBeenCalledWith("/");
    expect(dialogue()).toBeNull();
  });

  it("clic sur une commande externe tierce : nouvel onglet SANS opener, jamais le routeur", () => {
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);
    const tierce: Commande[] = [{ id: "gh", libelle: "GitHub", genre: "externe", cible: "https://github.com/MoKarade" }];
    monter(h(PaletteCommandes, { commandes: tierce }));
    touche(document, "k", { ctrlKey: true });
    const externe = lignes().find((l) => l.querySelector(".palette__externe"));
    expect(externe, "au moins une commande externe").toBeDefined();
    cliquer(externe!);
    expect(ouvrir).toHaveBeenCalledTimes(1);
    expect(ouvrir.mock.calls[0]![1]).toBe("_blank");
    expect(ouvrir.mock.calls[0]![2]).toContain("noopener");
    expect(moq.push).not.toHaveBeenCalled();
    expect(dialogue()).toBeNull();
  });

  it("clic sur « Ouvrir <app> » : navigation en place (bascule vers la PWA), jamais d'onglet ni le routeur", () => {
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);
    monter(h(PaletteCommandes, { commandes: liste }));
    touche(document, "k", { ctrlKey: true });
    const externe = lignes().find((l) => l.querySelector(".palette__externe"));
    expect(externe, "au moins une commande externe").toBeDefined();
    cliquer(externe!);
    expect(ouvrir).not.toHaveBeenCalled();
    expect(moq.push).not.toHaveBeenCalled();
    expect(dialogue()).toBeNull();
  });

  it("clic sur le fond : referme ; clic DANS la palette : reste ouverte", () => {
    monter(h(PaletteCommandes, { commandes: liste }));
    touche(document, "k", { ctrlKey: true });
    cliquer(dialogue()!);
    expect(dialogue()).not.toBeNull();
    cliquer(conteneur.querySelector(".palette__fond")!);
    expect(dialogue()).toBeNull();
  });
});

// ── RefreshControls ────────────────────────────────────────────────────────────────

describe("RefreshControls — minuterie et bouton", () => {
  function visibilite(etat: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", { value: etat, configurable: true });
  }

  it("rafraîchit toutes les 60 s quand l'onglet est visible, jamais avant (coût Vercel)", () => {
    vi.useFakeTimers();
    visibilite("visible");
    monter(h(RefreshControls));
    act(() => vi.advanceTimersByTime(59_999));
    expect(moq.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(moq.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(moq.refresh).toHaveBeenCalledTimes(2);
  });

  it("onglet caché : aucune requête ; retour au premier plan : rafraîchit aussitôt", () => {
    vi.useFakeTimers();
    visibilite("hidden");
    monter(h(RefreshControls));
    act(() => vi.advanceTimersByTime(60_000));
    expect(moq.refresh).not.toHaveBeenCalled();
    visibilite("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(moq.refresh).toHaveBeenCalledTimes(1);
  });

  it("démonté : la minuterie et l'écoute s'arrêtent", () => {
    vi.useFakeTimers();
    visibilite("visible");
    monter(h(RefreshControls));
    act(() => racine.unmount());
    racine = createRoot(conteneur);
    act(() => vi.advanceTimersByTime(60_000));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(moq.refresh).not.toHaveBeenCalled();
  });

  it("le bouton rafraîchit à la demande", () => {
    visibilite("visible");
    monter(h(RefreshControls));
    cliquer(conteneur.querySelector("button.refresh")!);
    expect(moq.refresh).toHaveBeenCalledTimes(1);
  });
});

// ── ServiceWorker ──────────────────────────────────────────────────────────────────

describe("ServiceWorker — enregistrement", () => {
  function poserServiceWorker(valeur: unknown) {
    Object.defineProperty(navigator, "serviceWorker", { value: valeur, configurable: true });
  }

  afterEach(() => {
    // Retire la propriété posée par le test : jsdom n'en a pas.
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });

  it("navigateur sans service worker : ne fait rien, sans erreur", () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    expect("serviceWorker" in navigator).toBe(false);
    expect(() => monter(h(ServiceWorker))).not.toThrow();
    expect(conteneur.innerHTML).toBe("");
  });

  it("enregistre /sw.js une fois au montage", async () => {
    const register = vi.fn(async () => ({}));
    poserServiceWorker({ register });
    monter(h(ServiceWorker));
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("un échec d'enregistrement est journalisé, jamais levé (le hub reste utilisable)", async () => {
    const avert = vi.spyOn(console, "warn").mockImplementation(() => {});
    poserServiceWorker({ register: vi.fn(async () => Promise.reject(new Error("refusé"))) });
    monter(h(ServiceWorker));
    await act(async () => {
      await Promise.resolve();
    });
    expect(avert).toHaveBeenCalledTimes(1);
    expect(String(avert.mock.calls[0]![0])).toContain("Service worker non enregistré");
  });
});

// ── BoutonTrigger ──────────────────────────────────────────────────────────────────

describe("BoutonTrigger — confirmation avant déclenchement", () => {
  const action = (confirm?: string): HubAction =>
    ({ label: "Relancer", href: "https://exemple.test/relancer", kind: "trigger", confirm }) as HubAction;

  function soumettre(): Event {
    const formulaire = conteneur.querySelector("form")!;
    const evenement = new Event("submit", { bubbles: true, cancelable: true });
    act(() => {
      formulaire.dispatchEvent(evenement);
    });
    return evenement;
  }

  it("confirmation REFUSÉE : l'envoi est annulé, l'action serveur n'est pas appelée", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    monter(h(BoutonTrigger, { action: action("Vraiment relancer ?"), appId: "batchchef" }));
    const evenement = soumettre();
    await act(async () => {
      await Promise.resolve();
    });
    expect(confirmer).toHaveBeenCalledWith("Vraiment relancer ?");
    expect(evenement.defaultPrevented).toBe(true);
    expect(moq.actionDeclencher).not.toHaveBeenCalled();
  });

  it("sans texte de confirmation : aucune boîte de dialogue", () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    monter(h(BoutonTrigger, { action: action(), appId: "batchchef" }));
    soumettre();
    expect(confirmer).not.toHaveBeenCalled();
  });
});
