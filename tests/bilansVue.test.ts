// tests/bilansVue.test.ts — ce que l'onglet « Bilans » dit (lib/bilansVue.ts) : chaque échec a sa phrase, une
// réponse hors contrat n'est pas réparée, une date de calendrier ne bouge pas avec le fuseau.

import { describe, expect, it } from "vitest";
import type { Bilan } from "@/lib/bilans";
import { bilansDeReponse, duGenre, libelleDateBilan, messageErreurBilans, VIDE_GENRE } from "@/lib/bilansVue";

const b = (id: string, genre: "jour" | "semaine", date: string): Bilan => ({ id, genre, date, nom: `bilan-${genre}-${date}.html` });

describe("messageErreurBilans", () => {
  it("dit la raison, et de quoi agir pour le droit Drive", () => {
    expect(messageErreurBilans(409)).toMatch(/reconnecte-toi/i);
    expect(messageErreurBilans(503)).toMatch(/introuvable/);
    expect(messageErreurBilans(401)).toMatch(/session/);
    expect(messageErreurBilans(502)).toMatch(/Google/);
    expect(messageErreurBilans(429)).toMatch(/minute/);
    expect(messageErreurBilans(500)).toMatch(/indisponibles/);
  });
});

describe("bilansDeReponse", () => {
  it("accepte la liste du contrat, y compris vide", () => {
    expect(bilansDeReponse({ bilans: [] })).toEqual([]);
    expect(bilansDeReponse({ bilans: [b("aaaaaaaaaa", "jour", "2026-10-28")] })).toHaveLength(1);
  });

  it("refuse tout ce qui n'a pas la forme (rien n'est réparé, rien n'est filtré en silence)", () => {
    expect(bilansDeReponse(null)).toBeNull();
    expect(bilansDeReponse({})).toBeNull();
    expect(bilansDeReponse({ bilans: "x" })).toBeNull();
    expect(bilansDeReponse({ bilans: [b("aaaaaaaaaa", "jour", "2026-10-28"), { id: 3 }] })).toBeNull();
    expect(bilansDeReponse({ bilans: [{ id: "a", date: "d", genre: "mois" }] })).toBeNull();
  });
});

describe("duGenre et libelleDateBilan", () => {
  it("filtre par genre en gardant l'ordre", () => {
    const tous = [b("a1", "jour", "2026-10-28"), b("s1", "semaine", "2026-10-25"), b("a2", "jour", "2026-10-27")];
    expect(duGenre(tous, "jour").map((x) => x.id)).toEqual(["a1", "a2"]);
    expect(duGenre(tous, "semaine").map((x) => x.id)).toEqual(["s1"]);
    expect(duGenre([], "jour")).toEqual([]);
  });

  it("écrit la date du nom de fichier, sans décalage de fuseau", () => {
    expect(libelleDateBilan("2026-10-28")).toBe("mercredi 28 octobre 2026");
    expect(libelleDateBilan("2026-01-01")).toBe("jeudi 1 janvier 2026");
    expect(libelleDateBilan("pas-une-date")).toBe("pas-une-date");
  });

  it("l'état vide est dit pour chaque genre", () => {
    expect(VIDE_GENRE.jour).toMatch(/Aucun bilan du jour/);
    expect(VIDE_GENRE.semaine).toMatch(/Aucun bilan de la semaine/);
  });
});
