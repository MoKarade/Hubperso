// tests/chantierGestes.test.ts — le contrat d'un geste de l'onglet « À toi » (lib/chantierGestes.ts).
//
// Un geste peut fusionner une PR sur GitHub : un champ hors contrat refuse le geste ENTIER, et on compare
// ce que `validerGeste` REND, pas seulement qu'il ne lève pas.

import { describe, expect, it } from "vitest";
import { ACCUSE_MAX, TEXTE_MAX, erreurGeste, memeOrigine, validerAccuse, validerGeste } from "@/lib/chantierGestes";

const BON = { v: 1, id: "mh3k2x9a-4fzq1w", ref: "Org/depot#12", geste: "fusionner", texte: null, quand: "2026-10-27T10:00:00.000Z" };

describe("validerGeste", () => {
  it("accepte un geste complet et le rend tel quel", () => {
    expect(validerGeste(BON)).toEqual({ ok: true, geste: BON });
  });

  it("« fait » et « fusionner » n'ont pas de texte (absent ou null donne null)", () => {
    const sansTexte: Record<string, unknown> = { ...BON };
    delete sansTexte.texte;
    expect(validerGeste({ ...sansTexte, geste: "fait" })).toEqual({ ok: true, geste: { ...BON, geste: "fait", texte: null } });
  });

  it("une réponse porte sa phrase", () => {
    const v = validerGeste({ ...BON, geste: "reponse", texte: "Oui, vas-y" });
    expect(v).toEqual({ ok: true, geste: { ...BON, geste: "reponse", texte: "Oui, vas-y" } });
  });

  it.each([
    ["pas un objet", null],
    ["un tableau", [BON]],
    ["version inconnue", { ...BON, v: 2 }],
    ["id trop court", { ...BON, id: "abc" }],
    ["id en majuscules", { ...BON, id: "ABCDEF-123456" }],
    ["ref vide", { ...BON, ref: "" }],
    ["ref avec espace", { ...BON, ref: "Org/depot #12" }],
    ["geste inconnu", { ...BON, geste: "supprimer" }],
    ["réponse sans texte", { ...BON, geste: "reponse", texte: null }],
    ["réponse blanche", { ...BON, geste: "reponse", texte: "   " }],
    ["réponse trop longue", { ...BON, geste: "reponse", texte: "x".repeat(TEXTE_MAX + 1) }],
    ["texte sur « fusionner »", { ...BON, texte: "merge ça" }],
    ["date illisible", { ...BON, quand: "hier" }],
    ["champ inconnu", { ...BON, admin: true }],
  ])("refuse : %s", (_cas, corps) => {
    const v = validerGeste(corps);
    expect(v.ok).toBe(false);
  });

  it("dit pourquoi", () => {
    expect(validerGeste({ ...BON, geste: "supprimer" })).toEqual({ ok: false, raison: "geste : fusionner, fait, reponse" });
    expect(validerGeste({ ...BON, admin: true })).toEqual({ ok: false, raison: "admin : champ inconnu" });
  });
});

describe("memeOrigine", () => {
  const entetes = (o: Record<string, string>) => new Headers(o);

  it("l'origine nomme l'hôte du hub : oui", () => {
    expect(memeOrigine(entetes({ origin: "https://www.hubperso.com", host: "www.hubperso.com" }))).toBe(true);
  });

  it("derrière un proxy, l'hôte transmis fait foi", () => {
    expect(memeOrigine(entetes({ origin: "https://www.hubperso.com", host: "interne", "x-forwarded-host": "www.hubperso.com" }))).toBe(true);
  });

  it("une autre origine, une origine absente ou illisible : non", () => {
    expect(memeOrigine(entetes({ origin: "https://autre.exemple", host: "www.hubperso.com" }))).toBe(false);
    expect(memeOrigine(entetes({ host: "www.hubperso.com" }))).toBe(false);
    expect(memeOrigine(entetes({ origin: "null", host: "www.hubperso.com" }))).toBe(false);
    expect(memeOrigine(entetes({ origin: "https://www.hubperso.com" }))).toBe(false);
  });
});

describe("erreurGeste", () => {
  it("dit en clair pourquoi le geste n'est pas déposé", () => {
    expect(erreurGeste(401)).toContain("session");
    expect(erreurGeste(404)).toContain("propriétaire");
    expect(erreurGeste(429)).toContain("Trop de gestes");
    expect(erreurGeste(503)).toContain("base");
    expect(erreurGeste(500)).toContain("500");
  });
});

describe("validerAccuse", () => {
  it("accepte une liste d'identifiants et la rend sans doublon, dans l'ordre", () => {
    expect(validerAccuse({ ids: ["mh3k2x9a-4fzq1w", "zz9y8x7w-abcdef", "mh3k2x9a-4fzq1w"] })).toEqual({
      ok: true,
      ids: ["mh3k2x9a-4fzq1w", "zz9y8x7w-abcdef"],
    });
  });

  it("refuse tout ce qui n'est pas { ids: [1 à 50 identifiants valides] }", () => {
    const ok = Array.from({ length: ACCUSE_MAX }, (_, i) => `geste-${String(i).padStart(4, "0")}`);
    expect(validerAccuse({ ids: ok }).ok).toBe(true);
    for (const mauvais of [
      null,
      [],
      "x",
      {},
      { ids: [] },
      { ids: "mh3k2x9a-4fzq1w" },
      { ids: [...ok, "geste-9999"] },
      { ids: [42] },
      { ids: ["MAJUSCULES-1"] },
      { ids: ["court"] },
      { ids: ["mh3k2x9a-4fzq1w"], en_plus: true },
    ]) {
      expect(validerAccuse(mauvais).ok, JSON.stringify(mauvais)).toBe(false);
    }
  });
});
