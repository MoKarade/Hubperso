// tests/codesRaison.test.ts — le module de l'étape 2 et l'épinglage par SHA de tous les workflows.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CODES_RAISON, usesNonEpingles } from "../scripts/codesRaison.mjs";

describe("usesNonEpingles", () => {
  it("accepte un SHA de 40 caractères et signale un tag ou une branche", () => {
    const sha = "a".repeat(40);
    expect(usesNonEpingles(`      - uses: actions/checkout@${sha} # v7`)).toEqual([]);
    expect(usesNonEpingles("      - uses: actions/checkout@v7")).toEqual(["actions/checkout@v7"]);
    expect(usesNonEpingles("        uses: x/y@main")).toEqual(["x/y@main"]);
  });

  it("ignore les actions locales", () => {
    expect(usesNonEpingles("      - uses: ./.github/actions/x")).toEqual([]);
  });
});

describe("workflows du dépôt", () => {
  const fichiers = readdirSync(".github/workflows").filter((f) => f.endsWith(".yml"));

  it("il y a des workflows à contrôler (anti-vacuité)", () => {
    expect(fichiers.length).toBeGreaterThan(0);
  });

  it.each(fichiers)("%s : toutes les actions sont épinglées par SHA", (f) => {
    expect(usesNonEpingles(readFileSync(`.github/workflows/${f}`, "utf8"))).toEqual([]);
  });
});

describe("CODES_RAISON", () => {
  it("sans doublon, en minuscules et underscores", () => {
    expect(new Set(CODES_RAISON).size).toBe(CODES_RAISON.length);
    for (const c of CODES_RAISON) expect(c).toMatch(/^[a-z_]+$/);
  });
});
