// tests/liaBootServeur.test.ts — `components/LiaBoot.tsx` est évalué AUSSI sur le serveur (rendu de chaque page, layout racine).
// Production, 24/10/2026 : `etatHttp()` lit `window.location` dès sa création ; appelé au chargement du module, il a fait
// tomber le rendu de toutes les pages en 500 (« ReferenceError: window is not defined »). Ce test charge le module SANS
// `window`, comme le serveur.

// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("LiaBoot évalué sur le serveur", () => {
  it("se charge sans window, sans rien lever", async () => {
    expect(typeof window).toBe("undefined");
    await expect(import("../components/LiaBoot")).resolves.toHaveProperty("LiaBoot");
  });
});
