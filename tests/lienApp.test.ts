// tests/lienApp.test.ts — un lien du hub vers une app du parc s'ouvre en place ([PWA-ANDROID], issue #483).
// Complète tests/pwaLiens.test.ts : celui-ci garde le titre de la carte et le bouton de la page d'app,
// ce fichier garde les liens venus du contrat (alertes, actions, recommandations, attention, palette).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attributsLien, viseUneApp } from "../lib/lienApp";

const lire = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

describe("viseUneApp", () => {
  it.each([
    "https://carai.hubperso.com/",
    "https://batchchef.hubperso.com/semaine?x=1",
    "https://emploi.hubperso.com/offres/12",
    "https://finance.hubperso.com",
  ])("vrai pour une app du parc : %s", (url) => {
    expect(viseUneApp(url)).toBe(true);
  });

  it.each([
    "https://www.hubperso.com/app/carai",
    "https://hubperso.com/",
    "https://github.com/MoKarade/Hubperso/issues/1",
    "https://evilhubperso.com/",
    "https://carai.hubperso.com.evil.example/",
    "https://hubperso.com.evil.example/",
    "http://carai.hubperso.com/",
    "javascript:alert(1)",
    "pas une url",
    "",
    null,
    undefined,
  ])("faux pour tout le reste : %s", (url) => {
    expect(viseUneApp(url as string | null | undefined)).toBe(false);
  });
});

describe("attributsLien", () => {
  it("une app du parc : pas de target, donc une navigation de premier niveau", () => {
    const a = attributsLien("https://carai.hubperso.com/recharges");
    expect(a.target).toBeUndefined();
    expect(a.rel).toBe("noopener");
  });

  it("un site tiers garde l'onglet et noreferrer", () => {
    expect(attributsLien("https://github.com/MoKarade")).toEqual({ target: "_blank", rel: "noreferrer noopener" });
  });

  it("un href absent ou non http(s) ne devient jamais un lien en place", () => {
    expect(attributsLien(undefined).target).toBe("_blank");
    expect(attributsLien("javascript:alert(1)").target).toBe("_blank");
  });
});

describe("les liens du contrat passent tous par attributsLien", () => {
  const FICHIERS = [
    ["components", "AlertList.tsx"],
    ["components", "AlertBanner.tsx"],
    ["components", "DetailAlertes.tsx"],
    ["components", "ActionList.tsx"],
    ["components", "Recommandation.tsx"],
    ["app", "attention", "page.tsx"],
  ];
  for (const f of FICHIERS) {
    it(`${f.join("/")} : attributsLien, aucun target="_blank" écrit à la main`, () => {
      const source = lire(...f);
      expect(source).toContain("attributsLien(");
      expect(source).not.toMatch(/target=["']_blank["']/);
    });
  }

  it("la palette ouvre une app du parc en place (location.assign), pas avec window.open", () => {
    const source = lire("components", "PaletteCommandes.tsx");
    const i = source.indexOf("viseUneApp(commande.cible)");
    const j = source.indexOf('window.open(commande.cible, "_blank"');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(source.slice(i, j)).toContain("window.location.assign(commande.cible)");
  });
});
