// tests/chantierEvenementsReleve.test.ts : les événements GitHub reçus APRÈS le relevé du PC sont appliqués aux tâches avant
// le calcul du modèle de la page (`avecEvenements` dans chantier/cadre.html, Hubperso#697). On exécute la définition telle
// qu'elle est publiée, sur de petits relevés, et on compare ce qu'elle REND (pas seulement qu'elle ne lève pas).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(resolve(process.cwd(), "chantier", "cadre.html"), "utf8");
const debut = SOURCE.indexOf("const NIVEAUX = ");
const fin = SOURCE.indexOf("function model(D){");

type Noeud = { n: number; t?: string; l: string | null; lb: string[]; st: string; c?: string; x: string | null; s?: string | null; pv?: { u: string | null; c: string } | null; pr?: Record<string, unknown> };
type Releve = { asof: string; repos: { k: string; repo: string; nodes: Noeud[] }[]; autre?: string };
type Evenement = { id: string; type: string; action: string; repo: string; n: number | null; at: string; etat: string | null; plus?: Record<string, string> | null };
const avecEvenements = new Function(`${SOURCE.slice(debut, fin)}; return avecEvenements;`)() as (D: Releve | null, evs: Evenement[]) => Releve | null;

const ASOF = "2026-10-28T20:00:00Z";
const tache = (n: number, lb: string[] = [], plus: Partial<Noeud> = {}): Noeud => ({ n, t: `tâche ${n}`, l: "tâche", lb, st: "open", c: "2026-10-28T10:00:00Z", x: null, s: null, ...plus });
const releve = (nodes: Noeud[]): Releve => ({ asof: ASOF, repos: [{ k: "hub", repo: "Hubperso", nodes }, { k: "eco", repo: ".github", nodes: [tache(1)] }], autre: "intact" });
let seq = 0;
const ev = (type: string, action: string, n: number, at: string, etat: string | null, plus: Record<string, string> | null = null, repo = "hub"): Evenement => ({ id: `e${++seq}`, type, action, repo, n, at, etat, plus });
const noeud = (D: Releve | null, n: number, repo = "hub") => D!.repos.find((r) => r.k === repo)!.nodes.find((x) => x.n === n);

describe("avecEvenements : le relevé est la base, les événements d'après le complètent", () => {
  it("sans événement, ou seulement des événements d'avant le relevé ou hors sujet : le relevé lui-même, intact", () => {
    const D = releve([tache(5)]);
    expect(avecEvenements(D, [])).toBe(D);
    expect(avecEvenements(D, [ev("issues", "closed", 5, "2026-10-28T19:59:59Z", "fermee")])).toBe(D);
    expect(avecEvenements(D, [ev("workflow_run", "completed", 5, "2026-10-28T21:00:00Z", "failure"), ev("deployment_status", "created", 5, "2026-10-28T21:00:00Z", "success")])).toBe(D);
    expect(avecEvenements(null, [ev("issues", "closed", 5, "2026-10-28T21:00:00Z", "fermee")])).toBeNull();
  });

  it("une étiquette posée puis retirée : les étiquettes suivent, `en-cours` date la prise, `niveau:*` donne le niveau", () => {
    const D = releve([tache(5, ["prio:2"])]);
    const R = avecEvenements(D, [
      ev("issues", "labeled", 5, "2026-10-28T21:00:00Z", "ouverte", { lb: "en-cours" }),
      ev("issues", "labeled", 5, "2026-10-28T21:05:00Z", "ouverte", { lb: "qui:marc" }),
      ev("issues", "unlabeled", 5, "2026-10-28T21:10:00Z", "ouverte", { lb: "qui:marc" }),
    ]);
    expect(noeud(R, 5)!.lb).toEqual(["prio:2", "en-cours"]);
    expect(noeud(R, 5)!.s).toBe("2026-10-28T21:00:00Z");
    // le relevé reçu n'est jamais modifié
    expect(noeud(D, 5)!.lb).toEqual(["prio:2"]);
    expect(noeud(D, 5)!.s).toBeNull();
  });

  it("les événements sont rejoués dans l'ordre de leur heure, pas de leur arrivée", () => {
    const D = releve([tache(5)]);
    const R = avecEvenements(D, [
      ev("issues", "unlabeled", 5, "2026-10-28T21:10:00Z", "ouverte", { lb: "bloqué" }),
      ev("issues", "labeled", 5, "2026-10-28T21:00:00Z", "ouverte", { lb: "bloqué" }),
    ]);
    expect(noeud(R, 5)!.lb).toEqual([]);
  });

  it("fermée : close à l'heure de l'événement, avec la preuve « Acceptée » si elle est venue ; rouverte : ouverte, sans date de fin", () => {
    const D = releve([tache(5), tache(6)]);
    const R = avecEvenements(D, [
      ev("issue_comment", "created", 5, "2026-10-28T21:00:00Z", "acceptee", { u: "https://github.com/MoKarade/Hubperso/issues/5#issuecomment-1" }),
      ev("issues", "closed", 5, "2026-10-28T21:01:00Z", "fermee"),
      ev("issues", "closed", 6, "2026-10-28T21:02:00Z", "fermee"),
      ev("issues", "reopened", 6, "2026-10-28T21:03:00Z", "ouverte"),
    ])!;
    expect(noeud(R, 5)).toMatchObject({ st: "closed", x: "2026-10-28T21:01:00Z", pv: { c: "2026-10-28T21:00:00Z", u: "https://github.com/MoKarade/Hubperso/issues/5#issuecomment-1" } });
    expect(noeud(R, 6)).toMatchObject({ st: "open", x: null });
    // fermée sans « Acceptée » : aucune preuve inventée
    expect(avecEvenements(D, [ev("issues", "closed", 6, "2026-10-28T21:02:00Z", "fermee")])!.repos[0]!.nodes.find((x) => x.n === 6)!.pv).toBeUndefined();
  });

  it("une preuve déjà au relevé n'est pas remplacée ; un titre modifié est repris", () => {
    const D = releve([tache(5, [], { pv: { u: "u0", c: "2026-10-28T18:00:00Z" } })]);
    const R = avecEvenements(D, [
      ev("issue_comment", "created", 5, "2026-10-28T21:00:00Z", "acceptee", { u: "u1" }),
      ev("issues", "edited", 5, "2026-10-28T21:01:00Z", "ouverte", { t: "nouveau titre" }),
    ]);
    expect(noeud(R, 5)!.pv).toEqual({ u: "u0", c: "2026-10-28T18:00:00Z" });
    expect(noeud(R, 5)!.t).toBe("nouveau titre");
  });

  it("une issue neuve apparaît sans niveau, puis devient une tâche quand `niveau:tâche` est posée", () => {
    const D = releve([tache(5)]);
    const R1 = avecEvenements(D, [ev("issues", "opened", 9, "2026-10-28T21:00:00Z", "ouverte", { t: "neuve" })]);
    expect(noeud(R1, 9)).toMatchObject({ n: 9, t: "neuve", l: null, st: "open", lb: [], c: "2026-10-28T21:00:00Z", k: [], d: [] });
    const R2 = avecEvenements(D, [
      ev("issues", "opened", 9, "2026-10-28T21:00:00Z", "ouverte", { t: "neuve" }),
      ev("issues", "labeled", 9, "2026-10-28T21:00:01Z", "ouverte", { lb: "niveau:tâche" }),
    ]);
    expect(noeud(R2, 9)).toMatchObject({ l: "tâche", lb: ["niveau:tâche"] });
    // un événement sur une issue que le relevé ne connaît pas (et sans `opened` vu) ne crée rien
    expect(noeud(avecEvenements(D, [ev("issues", "labeled", 77, "2026-10-28T21:00:00Z", "ouverte", { lb: "x" })]), 77)).toBeUndefined();
  });

  it("une PR fusionnée, fermée, rouverte ou remise en brouillon change la PR de sa tâche, pas une autre", () => {
    const pr = { n: 20, repo: "Hubperso", state: "open", draft: false, merged: null, closed: null, upd: "2026-10-28T19:00:00Z" };
    const D = releve([tache(5, [], { pr }), tache(6)]);
    const fus = noeud(avecEvenements(D, [ev("pull_request", "closed", 20, "2026-10-28T21:00:00Z", "fusionnee")]), 5)!;
    expect(fus.pr).toMatchObject({ state: "closed", merged: "2026-10-28T21:00:00Z", closed: "2026-10-28T21:00:00Z", upd: "2026-10-28T21:00:00Z" });
    const fer = noeud(avecEvenements(D, [ev("pull_request", "closed", 20, "2026-10-28T21:00:00Z", "fermee")]), 5)!;
    expect(fer.pr).toMatchObject({ state: "closed", merged: null });
    const rouv = noeud(avecEvenements(D, [
      ev("pull_request", "closed", 20, "2026-10-28T21:00:00Z", "fermee"),
      ev("pull_request", "reopened", 20, "2026-10-28T21:01:00Z", "ouverte"),
      ev("pull_request", "converted_to_draft", 20, "2026-10-28T21:02:00Z", "brouillon"),
    ]), 5)!;
    expect(rouv.pr).toMatchObject({ state: "open", merged: null, closed: null, draft: true });
    const pret = noeud(avecEvenements(D, [
      ev("pull_request", "converted_to_draft", 20, "2026-10-28T21:02:00Z", "brouillon"),
      ev("pull_request", "ready_for_review", 20, "2026-10-28T21:03:00Z", "ouverte"),
    ]), 5)!;
    expect(pret.pr).toMatchObject({ state: "open", draft: false });
    expect(noeud(avecEvenements(D, [ev("pull_request", "closed", 20, "2026-10-28T21:00:00Z", "fusionnee")]), 6)!.pr).toBeUndefined();
    // la PR du relevé n'est pas modifiée en place
    expect(D.repos[0]!.nodes[0]!.pr).toBe(pr);
    expect(pr.state).toBe("open");
  });

  it("un événement d'un dépôt inconnu est ignoré ; les autres clés du relevé passent telles quelles ; le même numéro dans un autre dépôt n'est pas touché", () => {
    const D = releve([tache(5)]);
    const R = avecEvenements(D, [ev("issues", "closed", 5, "2026-10-28T21:00:00Z", "fermee", null, "zzz"), ev("issues", "labeled", 1, "2026-10-28T21:00:00Z", "ouverte", { lb: "en-cours" }, "eco")])!;
    expect(noeud(R, 5)).toMatchObject({ st: "open" });
    expect(noeud(R, 1, "eco")!.lb).toEqual(["en-cours"]);
    expect(noeud(R, 5)!.lb).toEqual([]);
    expect(R.autre).toBe("intact");
    expect(R.asof).toBe(ASOF);
  });
});

describe("avecEvenements : le rattrapage GitHub (événements « snapshot », Hubperso#699)", () => {
  const snap = (n: number, at: string, etat: string, plus: Record<string, string>, repo = "hub") => ev("issues", "snapshot", n, at, etat, plus, repo);
  const labs = (...l: string[]) => JSON.stringify(l);

  it("l'état courant d'une issue remplace celui du relevé : étiquettes, niveau, titre, ouverte ; la prise d'avant est gardée", () => {
    const D = releve([tache(5, ["prio:2"], { s: "2026-10-28T12:00:00Z" })]);
    const R = avecEvenements(D, [snap(5, "2026-10-28T21:00:00Z", "ouverte", { t: "autre titre", labs: labs("niveau:tâche", "en-cours", "qui:marc") })]);
    expect(noeud(R, 5)).toMatchObject({ t: "autre titre", lb: ["niveau:tâche", "en-cours", "qui:marc"], l: "tâche", st: "open", x: null, s: "2026-10-28T12:00:00Z" });
    expect(noeud(D, 5)!.lb).toEqual(["prio:2"]);
  });

  it("fermée : fin = celle de GitHub, avec la preuve « Acceptée » lue ; une preuve déjà au relevé n'est pas remplacée ; rouverte plus tard : ouverte", () => {
    const D = releve([tache(5), tache(6, [], { pv: { u: "u0", c: "2026-10-28T18:00:00Z" } })]);
    const acc = JSON.stringify({ u: "https://github.com/MoKarade/Hubperso/issues/5#issuecomment-1", c: "2026-10-28T20:30:00.000Z" });
    const R = avecEvenements(D, [
      snap(5, "2026-10-28T21:00:00Z", "fermee", { labs: labs("niveau:tâche"), fin: "2026-10-28T20:31:00.000Z", acc }),
      snap(6, "2026-10-28T21:00:00Z", "fermee", { labs: labs("niveau:tâche"), fin: "2026-10-28T20:31:00.000Z", acc }),
    ]);
    expect(noeud(R, 5)).toMatchObject({ st: "closed", x: "2026-10-28T20:31:00.000Z", pv: { c: "2026-10-28T20:30:00.000Z" } });
    expect(noeud(R, 6)!.pv).toEqual({ u: "u0", c: "2026-10-28T18:00:00Z" });
    const R2 = avecEvenements(D, [snap(5, "2026-10-28T21:00:00Z", "fermee", { fin: "2026-10-28T20:31:00.000Z" }), ev("issues", "reopened", 5, "2026-10-28T21:10:00Z", "ouverte")]);
    expect(noeud(R2, 5)).toMatchObject({ st: "open", x: null });
    // fermée sans preuve lue : aucune preuve inventée
    expect(noeud(avecEvenements(D, [snap(5, "2026-10-28T21:00:00Z", "fermee", { fin: "2026-10-28T20:31:00.000Z" })]), 5)!.pv).toBeUndefined();
  });

  it("une issue inconnue du relevé apparaît si elle est ouverte, jamais si elle est fermée ; un instantané d'avant le relevé n'y change rien", () => {
    const D = releve([tache(5)]);
    const R = avecEvenements(D, [snap(9, "2026-10-28T21:00:00Z", "ouverte", { t: "neuve", labs: labs("niveau:tâche"), cr: "2026-10-28T20:50:00.000Z" }), snap(10, "2026-10-28T21:00:00Z", "fermee", { t: "vieille" })]);
    expect(noeud(R, 9)).toMatchObject({ n: 9, t: "neuve", l: "tâche", c: "2026-10-28T20:50:00.000Z", st: "open" });
    expect(noeud(R, 10)).toBeUndefined();
    expect(avecEvenements(D, [snap(5, "2026-10-28T19:00:00Z", "fermee", { fin: "2026-10-28T19:00:00.000Z" })])).toBe(D);
  });

  it("un instantané de PR change la PR de sa tâche ; un événement du webhook d'après le rejoue par-dessus", () => {
    const pr = { n: 20, repo: "Hubperso", state: "open", draft: true, merged: null, closed: null, upd: "2026-10-28T19:00:00Z" };
    const D = releve([tache(5, [], { pr })]);
    const fus = avecEvenements(D, [ev("pull_request", "snapshot", 20, "2026-10-28T20:50:00Z", "fusionnee")]);
    expect(noeud(fus, 5)!.pr).toMatchObject({ state: "closed", merged: "2026-10-28T20:50:00Z" });
    const rouv = avecEvenements(D, [ev("pull_request", "snapshot", 20, "2026-10-28T20:50:00Z", "fusionnee"), ev("pull_request", "reopened", 20, "2026-10-28T21:00:00Z", "ouverte")]);
    expect(noeud(rouv, 5)!.pr).toMatchObject({ state: "open", merged: null });
  });

  it("des étiquettes illisibles ne cassent rien", () => {
    const D = releve([tache(5, ["prio:2"])]);
    const R = avecEvenements(D, [snap(5, "2026-10-28T21:00:00Z", "ouverte", { labs: "{pas du json", acc: "oups" })]);
    expect(noeud(R, 5)).toMatchObject({ lb: [], st: "open" });
    expect(noeud(R, 5)!.pv).toBeUndefined();
  });
});

describe("chantier/cadre.html : le rattrapage GitHub", () => {
  it("le message du hub est routé vers la page, et mis en file tant qu'elle n'écoute pas", () => {
    expect(SOURCE).toContain("m.type === 'chantier-rattrapage'");
    expect(SOURCE).toContain("window.ratEnAttente");
    expect(SOURCE).toContain("window.surRattrapage = m =>");
  });

  it("« Tâches et PR » ne prend l'âge des événements que si le rattrapage est complet et les événements vivants ; sinon le relevé, et la cause est dite", () => {
    expect(SOURCE).toContain("at: M ? (ratComplet() && evVivantTop() ? Math.max(M.asof, EVS.lu) : M.asof) : NaN");
    expect(SOURCE).toContain("rattrapage GitHub non branché (jeton de lecture absent)");
    expect(SOURCE).toContain("rattrapage incomplet (");
    expect(SOURCE).toContain("rattrapage tronqué (");
  });

  it("le rattrapage est complet seulement si lu, sans erreur, sans dépôt illisible ni tronqué", () => {
    const f = new Function("RAT", `const ratComplet = () => isFinite(RAT.lu) && !RAT.err && !RAT.errs.length && !RAT.inc.length; return ratComplet();`) as (r: unknown) => boolean;
    expect(f({ lu: Date.now(), err: "", errs: [], inc: [] })).toBe(true);
    expect(f({ lu: NaN, err: "", errs: [], inc: [] })).toBe(false);
    expect(f({ lu: Date.now(), err: "", errs: ["job : HTTP 403"], inc: [] })).toBe(false);
    expect(f({ lu: Date.now(), err: "", errs: [], inc: ["fin"] })).toBe(false);
    expect(f({ lu: Date.now(), err: "panne", errs: [], inc: [] })).toBe(false);
    expect(SOURCE).toContain("const ratComplet = () => isFinite(RAT.lu) && !RAT.err && !RAT.errs.length && !RAT.inc.length;");
  });
});

describe("chantier/cadre.html : le modèle est recalculé sur le relevé et les événements", () => {
  it("à chaque relevé reçu et à chaque événement nouveau, quel que soit l'onglet ; le relevé reçu est gardé tel quel", () => {
    expect(SOURCE).toContain("BASE = d; M = model(avecEvenements(d, [...EV.values()]));");
    expect(SOURCE).toContain("const recalculer = () => { try { M = model(avecEvenements(BASE, [...EV.values()])); render(); }");
    expect(SOURCE).toContain("if (M && BASE && EV.size !== avant) recalculer();");
    expect(SOURCE).toContain("let CUR = EMBED, SRC = 'copie publiée', BASE = null;");
  });
});
