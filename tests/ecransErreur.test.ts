// tests/ecransErreur.test.ts — les deux écrans d'erreur envoient l'erreur à Sentry et ne montrent
// JAMAIS son message (#162).
//
// Les composants sont appelés comme des fonctions, `useEffect` exécuté tout de suite : pas de
// navigateur ni de DOM, on regarde ce que l'écran déclare et ce qu'il envoie.

import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effet: () => void) => effet(),
}));

import ErreurPage from "../app/error";
import GlobalError from "../app/global-error";

const MESSAGE = "détail technique interne http://10.0.0.7:9000/secret";

/** Texte de tous les nœuds d'un arbre JSX déjà construit. */
function texte(noeud: unknown): string {
  if (typeof noeud === "string") return noeud;
  if (Array.isArray(noeud)) return noeud.map(texte).join(" ");
  if (noeud && typeof noeud === "object" && "props" in noeud) {
    return texte((noeud as { props: { children?: unknown } }).props.children);
  }
  return "";
}

/** Premier élément d'un type donné (`button`…) dans l'arbre. */
function trouver(noeud: unknown, type: string): { props: Record<string, unknown> } | undefined {
  if (Array.isArray(noeud)) return noeud.map((n) => trouver(n, type)).find(Boolean);
  if (noeud && typeof noeud === "object" && "props" in noeud) {
    const el = noeud as { type: unknown; props: { children?: unknown } & Record<string, unknown> };
    return el.type === type ? el : trouver(el.props.children, type);
  }
  return undefined;
}

describe("écrans d'erreur", () => {
  beforeEach(() => captureException.mockClear());

  it("app/error.tsx envoie l'erreur à Sentry, sans montrer son message", () => {
    const erreur = new Error(MESSAGE);
    const reset = vi.fn();
    const ecran = ErreurPage({ error: erreur, reset });
    expect(captureException).toHaveBeenCalledExactlyOnceWith(erreur);
    expect(texte(ecran)).not.toContain("secret");
    expect(texte(ecran)).toContain("Réessayer");
    (trouver(ecran, "button")?.props.onClick as () => void)();
    expect(reset).toHaveBeenCalledOnce();
  });

  it("app/global-error.tsx envoie l'erreur à Sentry, sans montrer son message", () => {
    const erreur = new Error(MESSAGE);
    const ecran = GlobalError({ error: erreur });
    expect(captureException).toHaveBeenCalledExactlyOnceWith(erreur);
    expect(texte(ecran)).not.toContain("secret");
    expect(texte(ecran)).toContain("Un problème est survenu");
    // Remplace le layout racine : la balise <html> est à lui de la porter, en français et sombre.
    const html = trouver(ecran, "html");
    expect(html?.props.lang).toBe("fr-CA");
    expect(html?.props.style).toEqual({ colorScheme: "dark" });
  });
});
