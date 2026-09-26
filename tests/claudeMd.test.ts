// tests/claudeMd.test.ts — CLAUDE.md se charge à chaque session : il reste court.
// Le détail vit dans docs/reference-claude.md (déplacé, jamais supprimé).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MAX_LIGNES = 60;
const lire = (chemin: string) => readFileSync(join(process.cwd(), chemin), "utf8");

describe("CLAUDE.md", () => {
  it(`ne dépasse pas ${MAX_LIGNES} lignes`, () => {
    const lignes = lire("CLAUDE.md").split(/\r?\n/);
    // Un fichier qui finit par un saut de ligne compte une ligne vide de trop.
    const n = lignes[lignes.length - 1] === "" ? lignes.length - 1 : lignes.length;
    expect(n).toBeLessThanOrEqual(MAX_LIGNES);
  });

  it("renvoie vers la référence, qui garde les onze sections", () => {
    expect(lire("CLAUDE.md")).toContain("docs/reference-claude.md");
    const ref = lire("docs/reference-claude.md");
    for (let i = 1; i <= 11; i++) expect(ref).toMatch(new RegExp(`^## ${i}\\. `, "m"));
  });
});
