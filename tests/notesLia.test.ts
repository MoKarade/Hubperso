// tests/notesLia.test.ts — le nombre de notes de LIA non lues, lu dans le résumé de MemoryAI.
//
// Ce qu'on éprouve : le bon nombre sort du bon libellé ; tout ce qui n'est pas un entier ≥ 0 lu en direct sur une
// réponse valide devient `null` (jamais 0 pour cacher une panne) ; un résumé servi du cache n'est pas lu.

import { describe, expect, it } from "vitest";
import type { SummaryResult } from "@/lib/fetchSummary";
import { LIBELLE_NOTES_LIA, notesLiaNonLues } from "@/lib/notesLia";
import type { HubSource } from "@/lib/sources";

const source = { id: "memoryai", name: "MemoryAI" } as HubSource;
const ok = (metrics: Array<{ label: string; value: number | string }>, stale?: boolean) =>
  ({ state: "ok", source, summary: { metrics }, stale }) as unknown as SummaryResult;
const notes = (value: number | string) => ok([{ label: "Faits validés", value: 12 }, { label: LIBELLE_NOTES_LIA, value }]);

describe("notesLiaNonLues", () => {
  it("rend le nombre publié sous « Notes de LIA non lues », zéro compris", () => {
    expect(notesLiaNonLues(notes(3))).toBe(3);
    expect(notesLiaNonLues(notes(0))).toBe(0);
  });

  it("le libellé est celui que MemoryAI publie (MemoryAI#399)", () => {
    expect(LIBELLE_NOTES_LIA).toBe("Notes de LIA non lues");
  });

  it("métrique absente (MemoryAI n'a pas pu compter) ou autre libellé : null, pas 0", () => {
    expect(notesLiaNonLues(ok([]))).toBeNull();
    expect(notesLiaNonLues(ok([{ label: "Notes non lues", value: 2 }]))).toBeNull();
  });

  it("valeur qui n'est pas un entier ≥ 0 : null", () => {
    for (const v of [-1, 1.5, Number.NaN, "3"]) expect(notesLiaNonLues(notes(v))).toBeNull();
  });

  it("résumé du cache de résilience, app injoignable, non autorisée, invalide : null", () => {
    expect(notesLiaNonLues(ok([{ label: LIBELLE_NOTES_LIA, value: 4 }], true))).toBeNull();
    for (const r of [
      { state: "unreachable", source, detail: "délai" },
      { state: "unauthorized", source },
      { state: "invalid", source, detail: "x" },
      { state: "unconfigured", source, manque: ["jeton"] },
    ] as unknown as SummaryResult[]) expect(notesLiaNonLues(r)).toBeNull();
  });
});
