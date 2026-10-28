// tests/tauxChange.test.ts — LE taux USD→CAD du hub (Hubperso#642) : lu dans le relevé du PC, sinon le repli, DIT.

import { describe, expect, it } from "vitest";
import { AGE_MAX_MS, TAUX_PAR_DEFAUT, TAUX_REPLI, direTaux, lireTaux } from "@/lib/tauxChange";

const MAINTENANT = Date.parse("2026-10-28T15:00:00Z");
const quota = (taux: unknown, releve: string | null = "2026-10-28T12:00:00Z") => ({
  taux_usd_cad: { taux, date: "2026-10-27", source: "Banque du Canada", ...(releve === null ? {} : { releve }) },
});

describe("lireTaux", () => {
  it("rend le taux du relevé avec sa date et sa source, sans repli", () => {
    expect(lireTaux(quota(1.4038), MAINTENANT)).toEqual({
      taux: 1.4038,
      date: "2026-10-27",
      source: "Banque du Canada",
      repli: false,
      motif: null,
    });
  });

  it("relevé absent ou illisible : le repli, avec sa cause", () => {
    for (const q of [null, undefined, "x", [], 3]) {
      const t = lireTaux(q, MAINTENANT);
      expect(t).toMatchObject({ taux: TAUX_REPLI, repli: true, date: null, source: null, motif: "relevé du PC absent" });
    }
  });

  it("relevé sans champ taux : le repli, avec sa cause", () => {
    expect(lireTaux({ autre: 1 }, MAINTENANT)).toMatchObject({ taux: TAUX_REPLI, repli: true, motif: "le relevé du PC ne porte pas de taux" });
  });

  it("taux non numérique, non fini ou hors de 0,5 à 3 : le repli", () => {
    for (const valeur of ["1.4", NaN, Infinity, 0.49, 3.01, 0, -1, null]) {
      expect(lireTaux(quota(valeur), MAINTENANT)).toMatchObject({ taux: TAUX_REPLI, repli: true });
    }
    expect(lireTaux(quota(0.5), MAINTENANT).repli).toBe(false);
    expect(lireTaux(quota(3), MAINTENANT).repli).toBe(false);
  });

  it("taux relevé il y a plus de 72 h : le repli ; pile 72 h : encore bon", () => {
    const pile = new Date(MAINTENANT - AGE_MAX_MS).toISOString();
    const trop = new Date(MAINTENANT - AGE_MAX_MS - 1000).toISOString();
    expect(lireTaux(quota(1.4, pile), MAINTENANT).repli).toBe(false);
    expect(lireTaux(quota(1.4, trop), MAINTENANT)).toMatchObject({ repli: true, motif: "taux relevé il y a plus de 72 h" });
  });

  it("taux sans heure de relevé : le repli (on ne devine pas son âge)", () => {
    expect(lireTaux(quota(1.4, null), MAINTENANT)).toMatchObject({ repli: true });
    expect(lireTaux(quota(1.4, "pas une date"), MAINTENANT)).toMatchObject({ repli: true });
  });

  it("le taux par défaut est le repli, dit", () => {
    expect(TAUX_PAR_DEFAUT).toMatchObject({ taux: TAUX_REPLI, repli: true });
  });
});

describe("direTaux", () => {
  it("un taux du relevé : la valeur, la source et le jour", () => {
    expect(direTaux(lireTaux(quota(1.4038), MAINTENANT))).toBe("1 $ US = 1,4038 $ CA : Banque du Canada du 2026-10-27");
  });

  it("le repli : dit que ce n'est pas un cours du jour, et pourquoi", () => {
    expect(direTaux(TAUX_PAR_DEFAUT)).toBe("1 $ US = 1,38 $ CA : taux de repli, pas un cours du jour (aucun relevé du PC consulté)");
  });
});
