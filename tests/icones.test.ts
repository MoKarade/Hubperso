// tests/icones.test.ts — QUELLE icône, décidé sans rendu.
//
// Marc, 23/09/2026 : « chiffres et icônes, peu de texte ». Ce module est la seule table qui
// relie un champ du CONTRAT à un pictogramme ; les tracés sont dans `components/Icone.tsx`
// et ne se testent pas ici — un `<path d="…">` juste se juge à l'œil, pas par assertion.

import { describe, expect, it } from "vitest";
import { iconeSeverite, iconeTendance } from "@/lib/icones";

describe("iconeSeverite — deux échelles, une table", () => {
  it("donne une FORME distincte aux deux gravités hautes", () => {
    // ⚠️ Pas seulement deux couleurs : deux ronds de teintes voisines sont indiscernables
    // pour un daltonien, et c'est précisément sur l'alerte qu'il ne faut pas se tromper.
    expect(iconeSeverite("alert")).toBe("alerte");
    expect(iconeSeverite("warn")).toBe("attention");
    expect(iconeSeverite("alert")).not.toBe(iconeSeverite("warn"));
  });

  it("ne donne AUCUNE icône à `ok` ni à `info`", () => {
    // Le défaut plausible est un repli silencieux sur `info` : chaque ligne porterait alors
    // un pictogramme, et on apprendrait à les balayer des yeux — le jour où un triangle
    // paraît, il serait déjà noyé. Le `null` est la décision, pas un trou.
    expect(iconeSeverite("ok")).toBeNull();
    expect(iconeSeverite("info")).toBeNull();
  });

  it("accepte les DEUX échelles du contrat sans transtypage", () => {
    // Une métrique vaut `ok | warn | alert`, une alerte vaut `info | warn | alert` : `ok` et
    // `info` n'existent chacune que d'un côté. Typer sur une seule échelle obligerait
    // l'autre appelant à transtyper, c'est-à-dire à éteindre le contrôle qu'on veut garder.
    // Ce cas est un test de COMPILATION autant que d'exécution : les quatre valeurs passent.
    const severitesMetrique: Array<"ok" | "warn" | "alert"> = ["ok", "warn", "alert"];
    const severitesAlerte: Array<"info" | "warn" | "alert"> = ["info", "warn", "alert"];
    for (const s of [...severitesMetrique, ...severitesAlerte]) {
      expect(() => iconeSeverite(s)).not.toThrow();
    }
  });
});

describe("iconeTendance — le SIGNE, rien d'autre", () => {
  it("distingue la hausse de la baisse", () => {
    expect(iconeTendance(9.2)).toBe("hausse");
    expect(iconeTendance(-3.1)).toBe("baisse");
  });

  it("range ZÉRO avec la hausse, délibérément", () => {
    // Ce n'est pas un oubli : `formatTrend` écrit « 0 % » à côté, donc la flèche ne porte pas
    // l'information seule. Une troisième icône « stable » ajouterait une forme à reconnaître
    // pour un cas que le texte dit déjà. Épinglé pour qu'un futur lot le change sciemment.
    expect(iconeTendance(0)).toBe("hausse");
  });
});
