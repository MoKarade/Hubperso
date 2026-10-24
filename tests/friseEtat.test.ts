// tests/friseEtat.test.ts — la frise des 24 dernières heures (Hubperso#357) : tirée des relevés réels, jamais inventée.
// Un trou de relevés est un trou ; une app sans historique le dit ; « en retard » n'est pas dessiné (non enregistré).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FriseEtat } from "@/components/FriseEtat";
import {
  FENETRE_FRISE_MS,
  MOT_PLAGE,
  NB_PLAGES,
  PLAGE_FRISE_MS,
  friseApp,
  libellePlage,
  resumeFrise,
} from "@/lib/friseEtat";
import type { Releve } from "@/lib/historique";

const MIN = 60_000;
const HEURE = 60 * MIN;
const NOW = Date.parse("2026-07-15T12:00:00.000Z");

const releve = (etat: string, ilYaMs: number, over: Partial<Releve> = {}): Releve => ({
  appId: "driveai",
  releveLe: NOW - ilYaMs,
  etat,
  dataAsOf: null,
  metriques: [],
  cout: null,
  ...over,
});

/** Un relevé tous les quarts d'heure, de `deMs` à `aMs` avant maintenant (bornes incluses côté `a`). */
const serie = (etat: string, deMs: number, aMs: number): Releve[] => {
  const rs: Releve[] = [];
  for (let t = deMs; t >= aMs; t -= 15 * MIN) rs.push(releve(etat, t));
  return rs;
};

const etats = (r: Releve[]) => friseApp("driveai", "DriveAI", r, NOW).plages.map((p) => p.etat);

describe("la frise est faite de 48 plages de 30 min sur 24 h", () => {
  it("toujours 48 plages, de la plus ancienne à la plus récente, la dernière finissant à maintenant", () => {
    const f = friseApp("driveai", "DriveAI", [], NOW);
    expect(NB_PLAGES).toBe(48);
    expect(f.plages).toHaveLength(48);
    expect(f.plages[0]?.debutMs).toBe(NOW - FENETRE_FRISE_MS);
    expect(f.plages[47]?.debutMs).toBe(NOW - PLAGE_FRISE_MS);
  });

  it("des relevés sur toute la journée : toutes les plages sont « à jour »", () => {
    const f = friseApp("driveai", "DriveAI", serie("ok", 24 * HEURE - 1, 0), NOW);
    expect(f.plages.every((p) => p.etat === "ok")).toBe(true);
    expect(resumeFrise(f)).toBe("Aucune panne vue.");
  });
});

describe("rien n'est inventé", () => {
  it("une app sans aucun relevé : 48 plages « sans relevé », et le résumé le dit (pas « aucune panne »)", () => {
    const f = friseApp("driveai", "DriveAI", [], NOW);
    expect(f.plages.every((p) => p.etat === "vide")).toBe(true);
    expect(f.nbReleves).toBe(0);
    expect(resumeFrise(f)).toBe("Aucun relevé sur les 24 dernières heures.");
    expect(resumeFrise(f)).not.toMatch(/aucune panne/i);
  });

  it("un trou de relevés apparaît comme trou, jamais comme « à jour »", () => {
    // Relevés d'il y a 24 h à 12 h, puis un silence de 6 h, puis de 6 h à maintenant.
    const rs = [...serie("ok", 24 * HEURE - 1, 12 * HEURE), ...serie("ok", 6 * HEURE, 0)];
    const plages = etats(rs);
    const vides = plages.filter((e) => e === "vide").length;
    expect(vides).toBeGreaterThanOrEqual(11);
    expect(vides).toBeLessThanOrEqual(12);
    expect(plages.slice(24, 35).every((e) => e === "vide")).toBe(true);
    expect(resumeFrise(friseApp("driveai", "DriveAI", rs, NOW))).toMatch(/plages? sans relevé/);
  });

  it("« en retard » n'existe pas : un relevé ok dont la donnée est vieille reste « à jour »", () => {
    const rs = serie("ok", 24 * HEURE - 1, 0).map((r) => ({ ...r, dataAsOf: r.releveLe - 72 * HEURE }));
    expect(etats(rs).every((e) => e === "ok")).toBe(true);
    expect(Object.keys(MOT_PLAGE).sort()).toEqual(["ok", "panne", "refus", "vide"]);
  });

  it("les relevés hors fenêtre ou du futur sont ignorés", () => {
    const f = friseApp("driveai", "DriveAI", [releve("ok", 25 * HEURE), releve("ok", -5 * MIN)], NOW);
    expect(f.nbReleves).toBe(0);
    expect(f.plages.every((p) => p.etat === "vide")).toBe(true);
  });
});

describe("pannes et refus", () => {
  it("une heure d'injoignabilité : la panne est vue sur les plages concernées, le reste est « à jour »", () => {
    const rs = [...serie("ok", 24 * HEURE - 1, 5 * HEURE), ...serie("unreachable", 5 * HEURE - 15 * MIN, 4 * HEURE), ...serie("ok", 4 * HEURE - 15 * MIN, 0)];
    const f = friseApp("driveai", "DriveAI", rs, NOW);
    expect(f.plagesPanne).toBeGreaterThanOrEqual(2);
    expect(f.plagesPanne).toBeLessThanOrEqual(3);
    expect(f.plages.filter((p) => p.etat === "ok").length).toBe(48 - f.plagesPanne);
    expect(resumeFrise(f)).toMatch(/^Panne vue sur [23] plages de 30 min\.$/);
  });

  it("les trois états de panne sont des pannes ; un refus est à part", () => {
    for (const etat of ["unreachable", "invalid", "contract-too-new"]) expect(etats([releve(etat, 10 * MIN)])[47]).toBe("panne");
    for (const etat of ["unauthorized", "unconfigured"]) expect(etats([releve(etat, 10 * MIN)])[47]).toBe("refus");
  });

  it("dans une plage, la panne l'emporte sur le refus, le refus sur « à jour »", () => {
    expect(etats([releve("ok", 20 * MIN), releve("unauthorized", 10 * MIN)])[47]).toBe("refus");
    expect(etats([releve("unauthorized", 20 * MIN), releve("unreachable", 10 * MIN)])[47]).toBe("panne");
  });

  it("un relevé pile sur la frontière de deux plages n'est compté qu'une fois", () => {
    const f = friseApp("driveai", "DriveAI", [releve("unreachable", 30 * MIN)], NOW);
    expect(f.plagesPanne).toBe(1);
  });

  it("le résumé dit le refus et les plages sans relevé", () => {
    const f = friseApp("driveai", "DriveAI", [releve("unauthorized", 10 * MIN)], NOW);
    expect(resumeFrise(f)).toBe("Aucune panne vue · accès refusé sur 1 plage · 47 plages sans relevé.");
  });
});

describe("libellé d'une plage", () => {
  it("à l'heure du Québec (jamais celle de la machine), avec le mot de l'état", () => {
    expect(libellePlage({ debutMs: Date.parse("2026-07-15T12:30:00.000Z"), etat: "panne" })).toBe("8 h 30 · panne vue");
    expect(libellePlage({ debutMs: Date.parse("2026-07-15T03:00:00.000Z"), etat: "vide" })).toBe("23 h 00 · sans relevé");
  });
});

describe("FriseEtat (rendu)", () => {
  const rendre = (rs: Releve[]) => renderToStaticMarkup(h(FriseEtat, { frises: [friseApp("driveai", "DriveAI", rs, NOW), friseApp("jobai", "JobAI", [], NOW)] }));

  it("une ligne par app, 48 plages chacune, la légende nomme les quatre états en mots", () => {
    const html = rendre(serie("ok", 24 * HEURE - 1, 0));
    expect(html.match(/class="frise__ligne"/g)).toHaveLength(2);
    // 2 lignes × 48 plages + 4 pastilles de légende.
    expect(html.match(/class="frise__plage"/g)).toHaveLength(2 * 48 + 4);
    for (const mot of Object.values(MOT_PLAGE)) expect(html).toContain(mot);
  });

  it("l'app sans historique le dit en mots, et la frise est décrite aux lecteurs d'écran", () => {
    const html = rendre(serie("ok", 24 * HEURE - 1, 0));
    expect(html).toContain("JobAI : Aucun relevé sur les 24 dernières heures.");
    expect(html).toContain('role="img"');
  });

  it("aucune couleur figée dans le balisage : tout passe par les variables du socle", () => {
    const html = rendre(serie("unreachable", 24 * HEURE - 1, 0));
    expect(html).not.toMatch(/style=|#[0-9a-f]{3,8}\b|rgb\(/i);
  });

  it("sans app, rien n'est rendu", () => {
    expect(renderToStaticMarkup(h(FriseEtat, { frises: [] }))).toBe("");
  });
});

describe("branchement", () => {
  it("l'accueil rend la frise sous les cartes, avant les coûts, sans attendre les réponses des apps", () => {
    const src = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
    expect(src.indexOf("<StreamedFrise")).toBeGreaterThan(src.indexOf("</section>", src.indexOf('aria-label="Widgets des apps"')));
    expect(src.indexOf("<StreamedFrise")).toBeLessThan(src.indexOf("<StreamedCosts"));
    expect(src).toMatch(/StreamedFrise\([\s\S]*?await historiques/);
  });
});
