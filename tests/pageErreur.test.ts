// tests/pageErreur.test.ts — carte 2 : quand une page plante, écran de secours en français
// avec un bouton « Réessayer », au lieu de l'écran anglais « Application error ».

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app/error.tsx", () => {
  it("existe", () => {
    expect(existsSync("app/error.tsx")).toBe(true);
  });

  const source = existsSync("app/error.tsx") ? readFileSync("app/error.tsx", "utf8") : "";

  it("est un composant client (exigence de Next pour une frontière d'erreur)", () => {
    expect(source).toMatch(/^\s*(\/\/.*\n|\s*\n)*"use client"/);
  });

  it("dit en français que la page n'a pas pu s'afficher et propose de réessayer", () => {
    expect(source).toMatch(/Oups, cette page n’a pas pu s’afficher/);
    expect(source).toMatch(/Réessayer/);
    expect(source).toMatch(/reset\(\)/);
  });

  it("n'affiche jamais le message technique de l'erreur à l'écran", () => {
    expect(source).not.toMatch(/error\.message/);
    expect(source).not.toMatch(/Application error/);
  });

  it("utilise le bouton du hub (cible tactile garantie par .btn)", () => {
    expect(source).toMatch(/className="btn"/);
  });
});
