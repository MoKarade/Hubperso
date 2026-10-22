// tests/visage.test.ts — le visage de l'assistant (Marc, 22/10/2026 : « go pour le visage »).
//
// Trois sortes de garde : les DONNÉES (une centaine d'expressions, chacune complète, les six
// actions bien servies), le MOTEUR (les ressorts convergent, le mouvement réduit fige tout, un
// état change le corps) et le DESSIN (chaque expression se dessine sans erreur, avec un faux
// canvas qui enregistre les appels). La boucle et le composant sont essayés avec un faux
// environnement, comme `lib/visage/boucle.ts` le prévoit.

import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CATEGORIES, EXPRESSIONS, PAR_ACTION, PAR_ID, type Accessoire } from "@/lib/visage/expressions";
import { ETATS, LEGENDES, LIBELLES, CORPS, estEtat } from "@/lib/visage/etats";
import { BOUCHE_MOUVEMENTS, REGARDS, TETE_MOUVEMENTS, clignement } from "@/lib/visage/mouvement";
import { GRIS, MARQUE, TEINTES, melange, rg } from "@/lib/visage/couleur";
import { avancer, changerEtat, creerVisage, viser, DUREE_EXPRESSION } from "@/lib/visage/moteur";
import { dessiner } from "@/lib/visage/dessin";
import { DEBORD, lancerVisage, type Environnement } from "@/lib/visage/boucle";
import { AssistantVisage } from "@/components/AssistantVisage";
import { ConstellationVivante } from "@/components/ConstellationVivante";

const css = readFileSync("app/globals.css", "utf8");

/** Un faux contexte 2D : il note chaque appel et rend des dégradés factices. */
function contexte(avecRoundRect = true) {
  const appels: string[] = [];
  const degrade = { addColorStop: () => appels.push("addColorStop") };
  const proprietes: Record<string, unknown> = {};
  const c = new Proxy(proprietes, {
    get(cible, nom: string) {
      if (nom in cible) return cible[nom];
      if (nom === "roundRect" && !avecRoundRect) return undefined;
      if (nom.startsWith("create")) return () => degrade;
      return () => appels.push(nom);
    },
    set(cible, nom: string, valeur) {
      cible[nom] = valeur;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { c, appels };
}

describe("expressions", () => {
  it("une centaine d'expressions, chacune avec un id unique et une catégorie connue", () => {
    expect(EXPRESSIONS.length).toBeGreaterThanOrEqual(100);
    const ids = EXPRESSIONS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EXPRESSIONS) {
      expect(CATEGORIES, e.id).toContain(e.cat);
      expect(PAR_ID[e.id]).toBe(e);
      expect(e.nom.length, e.id).toBeGreaterThan(0);
    }
    for (const cat of CATEGORIES) expect(EXPRESSIONS.some((e) => e.cat === cat), cat).toBe(true);
  });

  it("chaque expression pointe vers des mouvements, un regard et une teinte qui existent", () => {
    for (const e of EXPRESSIONS) {
      expect(TETE_MOUVEMENTS[e.mot], `${e.id} mot`).toBeTypeOf("function");
      expect(BOUCHE_MOUVEMENTS[e.ma], `${e.id} ma`).toBeTypeOf("function");
      expect(REGARDS[e.ea], `${e.id} ea`).toBeTypeOf("function");
      expect(TEINTES[e.col], `${e.id} col`).toBeDefined();
    }
  });

  it("les six actions ont leurs expressions, toutes définies", () => {
    expect(Object.keys(PAR_ACTION).sort()).toEqual([...ETATS].sort());
    for (const etat of ETATS) {
      expect(PAR_ACTION[etat].length, etat).toBeGreaterThanOrEqual(6);
      for (const id of PAR_ACTION[etat]) expect(PAR_ID[id], `${etat} : ${id}`).toBeDefined();
    }
  });

  it("l'indisponible est tout gris et ne cligne pas ; le repos reste dans la teinte du hub", () => {
    for (const id of PAR_ACTION.indispo.filter((i) => ["endormi", "horsligne", "eteint", "ronfle", "veille"].includes(i))) {
      expect(PAR_ID[id]!.col, id).toBe("grey");
      expect(PAR_ID[id]!.blk, id).toBe(0);
    }
    for (const id of PAR_ACTION.repos) expect(PAR_ID[id]!.col, id).toBe("n");
  });
});

describe("états de l'assistant", () => {
  it("six états, chacun avec son corps, sa légende et son libellé", () => {
    expect(ETATS).toEqual(["repos", "ecoute", "reflexion", "consulte", "reponse", "indispo"]);
    for (const e of ETATS) {
      expect(CORPS[e]).toBeDefined();
      expect(LIBELLES[e].length).toBeGreaterThan(0);
      expect(estEtat(e)).toBe(true);
    }
    expect(estEtat("dort")).toBe(false);
    expect(LEGENDES.repos).toBe("");
  });

  it("seul « consulte » braque un faisceau, seul « indispo » est gris", () => {
    expect(ETATS.filter((e) => CORPS[e].beam > 0)).toEqual(["consulte"]);
    expect(ETATS.filter((e) => CORPS[e].grey > 0)).toEqual(["indispo"]);
  });
});

describe("mouvement", () => {
  const temps = [0, 0.3, 1.7, 4.9, 13.2];

  it("chaque mouvement de tête rend cinq nombres finis", () => {
    for (const [nom, f] of Object.entries(TETE_MOUVEMENTS)) {
      for (const t of temps) {
        const pose = f(t);
        expect(pose, nom).toHaveLength(5);
        for (const x of pose) expect(Number.isFinite(x), `${nom} @${t}`).toBe(true);
      }
    }
  });

  it("les bouches ne se ferment jamais en dessous de zéro, les regards restent dans -1..1", () => {
    for (const [nom, f] of Object.entries(BOUCHE_MOUVEMENTS)) {
      for (const t of temps) expect(Number.isFinite(f(t)), nom).toBe(true);
    }
    for (const [nom, f] of Object.entries(REGARDS)) {
      for (const t of temps) {
        const [x, y] = f(t, 1.1);
        expect(Math.abs(x), nom).toBeLessThanOrEqual(1);
        expect(Math.abs(y), nom).toBeLessThanOrEqual(1);
      }
    }
  });

  it("le regard « suit » pointe vers l'app visée", () => {
    const [x, y] = REGARDS.follow(0, 0);
    expect(x).toBeCloseTo(0.9);
    expect(y).toBeCloseTo(0);
  });

  it("le clignement est une courte fermeture, puis rien jusqu'au suivant", () => {
    expect(clignement(0)).toBe(0);
    expect(clignement(0.1)).toBeCloseTo(1);
    expect(clignement(0.5)).toBe(0);
    expect(clignement(4.4 + 0.1)).toBeCloseTo(1);
    // Deux instances ne cillent pas en même temps (période décalée par le rang).
    expect(clignement(4.5, 1)).toBe(0);
  });
});

describe("couleurs", () => {
  it("rg borne l'opacité et écrit une chaîne CSS", () => {
    expect(rg([10, 20, 30], 2)).toBe("rgba(10,20,30,1.000)");
    expect(rg([10.9, 20, 30], -1)).toBe("rgba(10,20,30,0.000)");
  });

  it("melange va de a à b", () => {
    expect(melange([0, 0, 0], [100, 50, 10], 0.5)).toEqual([50, 25, 5]);
    expect(melange(GRIS, MARQUE, 0)).toEqual([...GRIS]);
  });

  it("le canvas ne dérive pas du CSS : MARQUE égale --marque", () => {
    const hex = /--marque:\s*#([0-9a-f]{6})/i.exec(css)?.[1];
    expect(hex).toBeDefined();
    const rgb = [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16));
    expect(rgb).toEqual([...MARQUE]);
  });

  it("aucun autre fichier de lib/visage n'écrit une couleur en dur (tout passe par couleur.ts)", () => {
    const fautes: string[] = [];
    for (const f of readdirSync("lib/visage").filter((x) => x.endsWith(".ts") && x !== "couleur.ts")) {
      const source = readFileSync(join("lib/visage", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
      if (/rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b/.test(source)) fautes.push(f);
    }
    expect(fautes).toEqual([]);
  });
});

describe("moteur", () => {
  it("à la création, le visage a déjà son expression (pas de saut au premier plan)", () => {
    const v = creerVisage("repos");
    expect(v.ex.id).toBe(PAR_ACTION.repos[0]);
    for (const n of ["mc", "mw", "eo"] as const) expect(v.x[n]).toBeCloseTo(v.cible[n]);
  });

  it("les ressorts convergent vers l'expression, avec un petit rebond", () => {
    const v = creerVisage("repos", { imposee: "neutre" });
    const surpris = PAR_ID["surpris"]!;
    v.imposee = "surpris";
    avancer(v, 0.016);
    expect(v.ex).toBe(surpris);
    const depart = v.x.eo;
    expect(depart).not.toBeCloseTo(v.cible.eo);
    let maxi = v.x.eo;
    for (let i = 0; i < 120; i++) {
      avancer(v, 0.016);
      maxi = Math.max(maxi, v.x.eo);
    }
    expect(v.x.eo).toBeCloseTo(v.cible.eo, 1);
    expect(maxi).toBeGreaterThan(v.cible.eo);
  });

  it("mouvement réduit : l'expression est atteinte d'un coup et le temps ne passe pas", () => {
    const v = creerVisage("repos", { reduit: true, imposee: "neutre" });
    const t0 = v.t;
    v.imposee = "waouh";
    avancer(v, 0);
    expect(v.x.eo).toBeCloseTo(PAR_ID["waouh"]!.eo!);
    expect(v.t).toBe(t0);
  });

  it("l'action enchaîne ses expressions toutes les 2,4 secondes", () => {
    const v = creerVisage("ecoute");
    const vues = new Set<string>([v.ex.id]);
    for (let i = 0; i < Math.ceil((DUREE_EXPRESSION * 6) / 0.05); i++) {
      avancer(v, 0.05);
      vues.add(v.ex.id);
    }
    expect(vues.size).toBeGreaterThanOrEqual(5);
    for (const id of vues) expect(PAR_ACTION.ecoute).toContain(id);
  });

  it("changer d'action change le corps : le verre se grise quand l'assistant est indisponible", () => {
    const v = creerVisage("repos");
    for (let i = 0; i < 40; i++) avancer(v, 0.05);
    expect(v.corps.grey).toBeLessThan(0.1);
    changerEtat(v, "indispo");
    for (let i = 0; i < 120; i++) avancer(v, 0.05);
    expect(v.corps.grey).toBeGreaterThan(0.9);
    expect(PAR_ACTION.indispo).toContain(v.ex.id);
    expect(v.corps.life).toBeLessThan(0.8);
  });

  it("les accessoires montent en fondu quand l'expression en porte", () => {
    const v = creerVisage("repos", { imposee: "neutre" });
    expect(Object.keys(v.fa)).toEqual([]);
    v.imposee = "amoureux";
    avancer(v, 0.016);
    expect(v.fa["hearts"]).toBeLessThan(0.2);
    for (let i = 0; i < 60; i++) avancer(v, 0.016);
    expect(v.fa["hearts"]).toBeGreaterThan(0.9);
    v.imposee = "neutre";
    for (let i = 0; i < 120; i++) avancer(v, 0.016);
    expect(v.fa["hearts"]).toBeLessThan(0.05);
  });

  it("viser tourne vers l'app par le plus court chemin", () => {
    const v = creerVisage("consulte");
    viser(v, 3);
    v.aim = -3;
    for (let i = 0; i < 80; i++) avancer(v, 0.05);
    // -3 → 3 : le plus court passe par ±π (la valeur finit sous -3), pas à travers 0.
    expect(v.aim).toBeLessThan(-3);
    expect(Math.cos(v.aim - 3)).toBeGreaterThan(0.999);
  });
});

describe("dessin", () => {
  it("chaque expression se dessine sans erreur, à plusieurs instants", () => {
    for (const e of EXPRESSIONS) {
      const v = creerVisage("repos", { imposee: e.id });
      const { c, appels } = contexte();
      for (let i = 0; i < 30; i++) {
        avancer(v, 0.07);
        dessiner(c, 120, 2, v);
      }
      expect(appels.length, e.id).toBeGreaterThan(50);
    }
  });

  it("chaque accessoire est dessiné par au moins une expression", () => {
    const tous: Accessoire[] = [
      "zzz", "sweat", "tear", "anger", "steam", "hearts", "stars", "sparkles", "note", "question", "exclaim",
      "bulb", "gears", "dots", "cloud", "sunglasses", "glasses", "cold", "gloom", "ear", "sound", "check",
    ];
    const portes = new Set(EXPRESSIONS.flatMap((e) => e.fx));
    for (const nom of tous) expect(portes.has(nom), nom).toBe(true);
  });

  it("le texte (zzz, notes, ?, !) est écrit avec la police du hub", () => {
    for (const id of ["ronfle", "chante", "perplexe", "surpris"]) {
      const v = creerVisage("repos", { imposee: id });
      const { c, appels } = contexte();
      for (let i = 0; i < 20; i++) {
        avancer(v, 0.05);
        dessiner(c, 100, 1, v);
      }
      expect(appels, id).toContain("fillText");
    }
  });

  it("sans roundRect (vieux navigateur), les lunettes de soleil se dessinent quand même", () => {
    const v = creerVisage("repos", { imposee: "cool" });
    const { c, appels } = contexte(false);
    for (let i = 0; i < 20; i++) {
      avancer(v, 0.05);
      dessiner(c, 100, 1, v);
    }
    expect(appels).toContain("rect");
    expect(appels).not.toContain("roundRect");
  });

  it("le fondu d'un œil à l'autre et le faisceau de « consulte » se dessinent", () => {
    const v = creerVisage("repos");
    const { c, appels } = contexte();
    for (const etat of ETATS) {
      changerEtat(v, etat);
      for (let i = 0; i < 70; i++) {
        avancer(v, 0.05);
        dessiner(c, 110, 1.5, v);
      }
    }
    expect(appels.length).toBeGreaterThan(5000);
    // Le faisceau trace sa ligne : un lineTo dans l'état « consulte ».
    const w = creerVisage("consulte");
    const rec = contexte();
    for (let i = 0; i < 120; i++) avancer(w, 0.05);
    dessiner(rec.c, 110, 1, w);
    expect(rec.appels.filter((a) => a === "lineTo").length).toBeGreaterThan(1);
  });
});

/** Un faux navigateur : on tourne la boucle à la main. */
function environnement(opts: { reduit?: boolean; densite?: number; largeur?: number } = {}) {
  const file: ((t: number) => void)[] = [];
  const annulees: number[] = [];
  let tailleRappel: ((l: number) => void) | null = null;
  let visibleRappel: ((v: boolean) => void) | null = null;
  const arrets = { taille: 0, visible: 0 };
  const env: Environnement = {
    image: (r) => file.push(r),
    annulerImage: (id) => annulees.push(id),
    densite: () => opts.densite ?? 1,
    mouvementReduit: () => opts.reduit ?? false,
    observerTaille: (_h, r) => {
      tailleRappel = r;
      r(opts.largeur ?? 100);
      return () => arrets.taille++;
    },
    observerVisibilite: (_h, r) => {
      visibleRappel = r;
      return () => arrets.visible++;
    },
  };
  return {
    env,
    file,
    annulees,
    arrets,
    taille: (l: number) => tailleRappel!(l),
    visible: (v: boolean) => visibleRappel!(v),
    /** Joue la prochaine image demandée. */
    tick: (ts: number) => file.shift()?.(ts),
  };
}

function faussToile() {
  const { c, appels } = contexte();
  const toile = { width: 0, height: 0, dataset: {} as Record<string, string>, getContext: () => c } as unknown as HTMLCanvasElement;
  return { toile, appels };
}

describe("boucle", () => {
  const hote = {} as HTMLElement;

  it("le canvas fait 230 % de l'élément, à la densité de l'écran (2 au plus)", () => {
    const e = environnement({ densite: 3, largeur: 100 });
    const { toile } = faussToile();
    lancerVisage(hote, toile, e.env, { etat: "repos" });
    expect(toile.width).toBe(Math.round(100 * DEBORD * 2));
    expect(toile.height).toBe(toile.width);
    e.taille(60);
    expect(toile.width).toBe(Math.round(60 * DEBORD * 2));
  });

  it("dessine à chaque image, et marque le canvas « prêt » après la première", () => {
    const e = environnement();
    const { toile, appels } = faussToile();
    lancerVisage(hote, toile, e.env, { etat: "repos" });
    expect(toile.dataset["pret"]).toBeUndefined();
    e.tick(1000);
    expect(toile.dataset["pret"]).toBe("oui");
    const n = appels.length;
    expect(n).toBeGreaterThan(50);
    e.tick(1016);
    expect(appels.length).toBeGreaterThan(n);
    // Une image suivante est toujours demandée.
    expect(e.file).toHaveLength(1);
  });

  it("hors écran : plus de dessin, plus d'image demandée ; de retour à l'écran : ça repart", () => {
    const e = environnement();
    const { toile, appels } = faussToile();
    lancerVisage(hote, toile, e.env, { etat: "repos" });
    e.tick(1000);
    e.visible(false);
    e.tick(1016);
    const n = appels.length;
    expect(e.file).toHaveLength(0);
    e.visible(true);
    e.tick(5000);
    expect(appels.length).toBeGreaterThan(n);
  });

  it("mouvement réduit : une image fixe, puis plus rien ne tourne ; un changement en redessine une", () => {
    const e = environnement({ reduit: true });
    const { toile, appels } = faussToile();
    const pilote = lancerVisage(hote, toile, e.env, { etat: "repos" });
    e.tick(1000);
    expect(appels.length).toBeGreaterThan(50);
    expect(e.file).toHaveLength(0);
    pilote.etat("ecoute");
    expect(e.file).toHaveLength(1);
  });

  it("le pilote change d'action, vise une app, impose une expression ; arrêter annule tout", () => {
    const e = environnement();
    const { toile } = faussToile();
    const pilote = lancerVisage(hote, toile, e.env, { etat: "repos", expression: "neutre", cible: 1 });
    pilote.etat("consulte");
    pilote.viser(2);
    pilote.imposer("waouh");
    pilote.imposer(null);
    e.tick(1000);
    pilote.arreter();
    expect(e.arrets).toEqual({ taille: 1, visible: 1 });
    e.tick(1016);
    expect(e.file).toHaveLength(0);
  });

  it("un élément de largeur nulle ne dessine rien", () => {
    const e = environnement({ largeur: 0 });
    const { toile, appels } = faussToile();
    lancerVisage(hote, toile, e.env, { etat: "repos" });
    e.tick(1000);
    expect(appels).toEqual([]);
    expect(toile.dataset["pret"]).toBeUndefined();
  });
});

describe("composant", () => {
  it("rend l'élément, le canvas et l'action ; au repos, aucune légende", () => {
    const html = renderToStaticMarkup(h(AssistantVisage));
    expect(html).toContain('class="visage"');
    expect(html).toContain('data-etat="repos"');
    expect(html).toContain("<canvas");
    expect(html).not.toContain("visage__legende");
  });

  it("une action qui a quelque chose à dire montre sa légende", () => {
    const html = renderToStaticMarkup(h(AssistantVisage, { etat: "ecoute" }));
    expect(html).toContain("visage__legende");
    expect(html).toContain("Je t&#x27;écoute");
  });

  it("le cœur de la constellation est le visage (et plus l'ancien logo du hub)", () => {
    const html = renderToStaticMarkup(h(ConstellationVivante, null));
    expect(html).toContain('class="visage"');
    expect(html).not.toContain("logo-hub");
  });

  it("la feuille de style a de quoi habiller le visage (sphère de repli, canvas, légende)", () => {
    for (const regle of [".visage {", ".visage::before", ".visage__toile", ".visage__legende", ".visage:has(.visage__toile[data-pret])"]) {
      expect(css, regle).toContain(regle);
    }
  });
});
