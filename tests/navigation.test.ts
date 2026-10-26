// tests/navigation.test.ts — la navigation du hub (#288) : le contenu, la garde, les pages actives.
//
// Même méthode que tests/composantsInteractifs.test.ts : HTML statique (`renderToStaticMarkup`),
// sans navigateur. Ce qui n'est PAS prouvé ici : l'ouverture de la feuille « Plus », le piège de
// focus et Échap (interactions qui exigent un DOM), et l'apparence — elles se jugent sur les
// captures de la PR.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  aAcces: vi.fn(),
  chemin: "/",
}));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/personnes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/personnes")>()),
  aAcces: moq.aAcces,
}));
vi.mock("next/navigation", () => ({ usePathname: () => moq.chemin }));

import { Cadre } from "@/components/Navigation";
import { NavigationMontee } from "@/components/NavigationMontee";
import {
  estActive,
  modeleNavigation,
  rangBarre,
  sansNavigation,
  type AppNav,
} from "@/lib/navigation";

const APPS: AppNav[] = [
  { id: "financeai", nom: "FinanceAI", couleur: "#2DD4BF" },
  { id: "carai", nom: "CarAI", couleur: "#A3E635" },
];

afterEach(() => {
  moq.auth.mockReset();
  moq.aAcces.mockReset();
  moq.chemin = "/";
  vi.unstubAllEnvs();
});

describe("modeleNavigation", () => {
  it("Vue = accueil, attention, coûts ; Apps = une entrée par app vers sa page", () => {
    const m = modeleNavigation(APPS, false);
    expect(m.vue.map((e) => e.href)).toEqual(["/", "/attention", "/couts"]);
    expect(m.apps.map((e) => [e.libelle, e.href])).toEqual([
      ["FinanceAI", "/app/financeai"],
      ["CarAI", "/app/carai"],
    ]);
  });

  it("Gérer (graphes, chantier, administration) n'existe que pour le propriétaire", () => {
    expect(modeleNavigation(APPS, false).gerer).toEqual([]);
    expect(modeleNavigation(APPS, true).gerer.map((e) => e.href)).toEqual([
      "/graphes",
      "/chantier",
      "/administration",
    ]);
  });

  it("ne porte aucun état : ni point de couleur, ni compteur (rien d'inventé)", () => {
    const m = modeleNavigation(APPS, true);
    const permis = ["id", "libelle", "href", "icone", "appId", "couleur"];
    for (const e of [...m.vue, ...m.apps, ...m.gerer]) {
      for (const cle of Object.keys(e)) expect(permis, cle).toContain(cle);
    }
  });
});

describe("page active", () => {
  it("« / » ne vaut que pour l'accueil", () => {
    expect(estActive("/", "/")).toBe(true);
    expect(estActive("/attention", "/")).toBe(false);
  });

  it("une page d'app active son entrée, pas celle d'une autre app au préfixe voisin", () => {
    expect(estActive("/app/financeai", "/app/financeai")).toBe(true);
    expect(estActive("/app/financeai/x", "/app/financeai")).toBe(true);
    expect(estActive("/app/financeai-bis", "/app/financeai")).toBe(false);
  });

  it("barre du bas : une page d'app reste sous Accueil, graphes, chantier et admin sous Plus", () => {
    expect(rangBarre("/")).toBe("accueil");
    expect(rangBarre("/app/carai")).toBe("accueil");
    expect(rangBarre("/attention")).toBe("attention");
    expect(rangBarre("/couts")).toBe("couts");
    expect(rangBarre("/graphes")).toBe("plus");
    expect(rangBarre("/chantier")).toBe("plus");
    expect(rangBarre("/administration")).toBe("plus");
  });

  it("pas de navigation sur la connexion, le refus d'accès et les pages légales", () => {
    for (const p of ["/login", "/sans-acces", "/conditions", "/confidentialite"]) {
      expect(sansNavigation(p), p).toBe(true);
    }
    for (const p of ["/", "/attention", "/app/carai", "/graphes"]) {
      expect(sansNavigation(p), p).toBe(false);
    }
  });
});

describe("Cadre (rendu serveur)", () => {
  const rendre = (chemin: string, proprietaire: boolean) => {
    moq.chemin = chemin;
    return renderToStaticMarkup(
      h(Cadre, { modele: modeleNavigation(APPS, proprietaire), children: h("main", null, "contenu") }),
    );
  };

  it("pose la page active en aria-current dans la barre latérale", () => {
    const html = rendre("/app/carai", false);
    const balise = (href: string) => html.match(new RegExp(`<a [^>]*href="${href}"[^>]*>`))?.[0] ?? "";
    expect(balise("/app/carai")).toContain('aria-current="page"');
    expect(balise("/app/financeai")).not.toContain("aria-current");
  });

  it("deux repères de navigation aux libellés distincts, un lien d'évitement, le contenu dedans", () => {
    const html = rendre("/", false);
    expect(html).toContain('aria-label="Navigation principale"');
    expect(html).toContain('aria-label="Navigation rapide"');
    expect(html).toContain('href="#contenu"');
    expect(html).toMatch(/id="contenu"[^>]*>\s*<main>contenu<\/main>/);
  });

  it("le logo de chaque app est celui de la série A, dans sa couleur déclarée", () => {
    const html = rendre("/", false);
    expect(html).toContain('data-logo="financeai"');
    expect(html).toContain("--accent:#2DD4BF");
  });

  it("n'offre graphes, chantier et administration qu'au propriétaire", () => {
    expect(rendre("/", false)).not.toContain('href="/graphes"');
    expect(rendre("/", false)).not.toContain('href="/administration"');
    expect(rendre("/", true)).toContain('href="/graphes"');
    expect(rendre("/", true)).toContain('href="/administration"');
  });

  it("n'ouvre jamais un nouvel onglet (verrou tests/pwaLiens.test.ts : la bascule vers l'app installée)", () => {
    expect(rendre("/", true)).not.toContain("_blank");
  });

  it("rend la page telle quelle sur /login et les pages légales", () => {
    for (const p of ["/login", "/sans-acces", "/conditions", "/confidentialite"]) {
      const html = rendre(p, true);
      expect(html, p).toBe("<main>contenu</main>");
    }
  });

  it("la feuille « Plus » est fermée au premier rendu", () => {
    const html = rendre("/", true);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
  });
});

describe("NavigationMontee (garde serveur)", () => {
  const enfants = h("main", null, "page");

  it("sans session : les pages telles quelles, pas de cadre", async () => {
    moq.auth.mockResolvedValue(null);
    const el = await NavigationMontee({ children: enfants });
    expect(isValidElement(el) && el.type).not.toBe(Cadre);
    expect(moq.aAcces).not.toHaveBeenCalled();
  });

  it("session sans accès au hub (invité sur une seule app) : pas de cadre, donc pas la liste des apps", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@example.test" } });
    moq.aAcces.mockResolvedValue(false);
    const el = await NavigationMontee({ children: enfants });
    expect(isValidElement(el) && el.type).not.toBe(Cadre);
    expect(moq.aAcces).toHaveBeenCalledWith("invite@example.test", "hubperso");
  });

  it("accès au hub : le cadre reçoit le modèle des six apps déclarées", async () => {
    vi.stubEnv("AUTHORIZED_EMAIL", "proprio@example.test");
    moq.auth.mockResolvedValue({ user: { email: "autre@example.test" } });
    moq.aAcces.mockResolvedValue(true);
    const el = (await NavigationMontee({ children: enfants })) as ReactElement<{
      modele: ReturnType<typeof modeleNavigation>;
    }>;
    expect(el.type).toBe(Cadre);
    expect(el.props.modele.apps).toHaveLength(6);
    expect(el.props.modele.gerer).toEqual([]);
  });

  it("le propriétaire (sans réseau) obtient Gérer", async () => {
    vi.stubEnv("AUTHORIZED_EMAIL", "proprio@example.test");
    moq.auth.mockResolvedValue({ user: { email: "Proprio@Example.test" } });
    moq.aAcces.mockResolvedValue(true);
    const el = (await NavigationMontee({ children: enfants })) as ReactElement<{
      modele: ReturnType<typeof modeleNavigation>;
    }>;
    expect(el.props.modele.gerer.map((e) => e.id)).toEqual(["graphes", "chantier", "administration"]);
  });

  it("session illisible : pages sans navigation, et l'erreur est journalisée (jamais avalée)", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    moq.auth.mockRejectedValue(new Error("boom"));
    const el = await NavigationMontee({ children: enfants });
    expect(isValidElement(el) && el.type).not.toBe(Cadre);
    expect(journal).toHaveBeenCalled();
    journal.mockRestore();
  });
});

describe("feuille de style", () => {
  const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
  const debut = CSS.indexOf("/* ── NAVIGATION (Marc, 22/10/2026");
  const NAV = CSS.slice(debut);

  it("le bloc existe (anti-vacuité)", () => {
    expect(debut).toBeGreaterThan(0);
    expect(NAV.length).toBeGreaterThan(1500);
  });

  it("barre latérale à partir de 1024 px, barre du bas en dessous", () => {
    expect(NAV).toMatch(/\.nav\s*\{\s*display:\s*none/);
    expect(NAV).toMatch(/@media\s*\(min-width:\s*1024px\)[\s\S]*\.nav\s*\{[^}]*position:\s*sticky/);
    expect(NAV).toMatch(/@media\s*\(min-width:\s*1024px\)[\s\S]*\.barre,\s*\.feuille__fond\s*\{\s*display:\s*none/);
  });

  it("aucune couleur écrite en dur dans la navigation (hors voile noir de la feuille)", () => {
    const sansVoile = NAV.replace(/rgb\(0 0 0 \/ 0\.55\)/, "");
    expect(sansVoile).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("la page active prend l'indigo de marque, pas la teinte d'une app", () => {
    expect(NAV).toMatch(/\.nav__lien\[aria-current="page"\]::before[^}]*var\(--marque\)/);
    expect(NAV).toMatch(/\.barre__item\[aria-current="page"\]\s*\{[^}]*var\(--marque\)/);
  });

  it("les animations de la feuille sont coupées si l'utilisateur demande moins de mouvement", () => {
    expect(NAV).toMatch(/prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*nav-monte/);
  });

  it("la barre du bas et la feuille respectent les zones sûres de l'écran", () => {
    expect(NAV).toMatch(/\.barre\s*\{[^}]*safe-area-inset-bottom/);
    expect(NAV).toMatch(/\.feuille\s*\{[^}]*safe-area-inset-bottom/);
  });
});
