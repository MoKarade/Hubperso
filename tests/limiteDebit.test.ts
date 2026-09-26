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
  const h = (o: Record<string, string>) => new Headers(o);
  it("préfère x-vercel-forwarded-for, puis x-real-ip, puis le premier saut de x-forwarded-for", () => {
    const tout = { "x-vercel-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8", "x-forwarded-for": "1.2.3.4, 10.0.0.1" };
    expect(cleClient(h(tout))).toBe("9.9.9.9");
    expect(cleClient(h({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "1.2.3.4" }))).toBe("8.8.8.8");
    expect(cleClient(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });
  it("sans aucun en-tête : « inconnu »", () => {
    expect(cleClient(h({}))).toBe("inconnu");
  });
});

describe("plafond dur de clés", () => {
  it("ne dépasse jamais cleMax, même si toutes les clés sont dans la même fenêtre", () => {
    const l = creerLimiteur({ max: 1, fenetreMs: 60_000, cleMax: 5 });
    for (let i = 0; i < 50; i++) l.verifier(`k${i}`, i);
    expect(l.taille()).toBeLessThanOrEqual(5);
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
