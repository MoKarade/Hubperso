// tests/vague2Structure.test.ts — lot "structure commune" (vague 2, 28/09/2026) :
// docs/ARCHITECTURE.md et la correction du commentaire périmé sur le client OAuth partagé.
// Le test du jeton HUB_TOKEN_MEMORYAI vit dans tests/constellationWorkflow.test.ts.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), "utf8");
/** Aplati les retours à la ligne et les marqueurs `//` : un fait peut être enjambé par le
 * retour à la ligne d'un commentaire sans que ce soit une divergence de contenu. */
const aplati = (texte: string) => texte.replace(/^\s*\/\/ ?/gm, "").replace(/\s+/g, " ");

describe("docs/ARCHITECTURE.md — carte structurelle", () => {
  const doc = lire("docs/ARCHITECTURE.md");

  it("existe et n'est pas vide", () => {
    expect(doc.length).toBeGreaterThan(0);
  });

  it("couvre app/, lib/, components/, le contrat et le flux d'auth", () => {
    expect(doc).toContain("app/");
    expect(doc).toContain("lib/");
    expect(doc).toContain("components/");
    expect(doc).toContain("@mokarade/hub-contract");
    expect(doc).toMatch(/flux d.authentification/i);
  });

  it("est référencée dans la carte des docs de reference-claude.md", () => {
    expect(lire("docs/reference-claude.md")).toContain("docs/ARCHITECTURE.md");
  });
});

describe("le commentaire sur le client OAuth partagé n'est plus périmé", () => {
  // Depuis l'ADR-0001 de JobAI/CarAI (14/08/2026), ces deux apps ne portent plus la
  // poignée de main OAuth elles-mêmes — seuls Hubperso et BatchChef gardent
  // GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Un futur agent qui ne lirait que le commentaire
  // d'origine croirait encore que les quatre apps font le handshake OAuth chacune de son
  // côté. Vérifié dans les DEUX fichiers, pour qu'ils ne divergent pas de nouveau.
  const FAIT_CLE = "seuls Hubperso et BatchChef gardent";

  it("lib/jetonsGoogle.ts porte la correction", () => {
    expect(aplati(lire("lib/jetonsGoogle.ts"))).toContain(FAIT_CLE);
    expect(lire("lib/jetonsGoogle.ts")).toContain("ADR-0001");
  });

  it("docs/CONNEXION-UNIQUE.md porte la même correction", () => {
    expect(aplati(lire("docs/CONNEXION-UNIQUE.md"))).toContain(FAIT_CLE);
    expect(lire("docs/CONNEXION-UNIQUE.md")).toContain("ADR-0001");
  });
});
