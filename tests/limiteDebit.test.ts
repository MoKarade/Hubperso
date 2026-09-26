// tests/limiteDebit.test.ts — la limite de débit des deux routes à jeton, et la durée constante.

import { describe, expect, it } from "vitest";
import { cleClient, creerLimiteur, pauseJusquA } from "../lib/limiteDebit";

describe("creerLimiteur — fenêtre fixe, horloge injectée", () => {
  it("laisse passer jusqu'au plafond, refuse au-delà, puis repart à la fenêtre suivante", () => {
    const l = creerLimiteur({ max: 3, fenetreMs: 1000 });
    expect([1, 2, 3].map(() => l.verifier("a", 0).ok)).toEqual([true, true, true]);
    const refus = l.verifier("a", 500);
    expect(refus.ok).toBe(false);
    expect(refus.retryApresS).toBe(1); // ceil((1000 - 500) / 1000)
    expect(l.verifier("a", 1000).ok).toBe(true);
  });

  it("compte chaque clé séparément", () => {
    const l = creerLimiteur({ max: 1, fenetreMs: 1000 });
    expect(l.verifier("a", 0).ok).toBe(true);
    expect(l.verifier("b", 0).ok).toBe(true);
    expect(l.verifier("a", 1).ok).toBe(false);
  });

  it("borne sa mémoire : les clés périmées sont élaguées", () => {
    const l = creerLimiteur({ max: 1, fenetreMs: 10, cleMax: 3 });
    for (const k of ["a", "b", "c"]) l.verifier(k, 0);
    l.verifier("d", 100);
    expect(l.taille()).toBeLessThanOrEqual(3);
  });
});

describe("cleClient", () => {
  it("prend le premier saut de x-forwarded-for, sinon « inconnu »", () => {
    const h = (v?: string) => new Headers(v ? { "x-forwarded-for": v } : {});
    expect(cleClient(h("1.2.3.4, 10.0.0.1"))).toBe("1.2.3.4");
    expect(cleClient(h())).toBe("inconnu");
  });
});

describe("pauseJusquA — durée minimale identique", () => {
  it("attend le complément, et n'attend pas quand la durée est déjà atteinte", async () => {
    const attentes: number[] = [];
    const dormir = async (ms: number) => void attentes.push(ms);
    await pauseJusquA(1000, 1100, 250, dormir); // 100 ms écoulées → 150 restants
    await pauseJusquA(1000, 1300, 250, dormir); // déjà dépassé
    expect(attentes).toEqual([150]);
  });
});
