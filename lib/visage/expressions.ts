// lib/visage/expressions.ts — les expressions du visage de l'assistant (Marc, 22/10/2026 :
// « beaucoup, genre une centaine, un visage un peu plus cartoon »).
//
// Une expression = des RÉGLAGES (yeux, sourcils, bouche, joues), un type d'œil et de bouche, des
// accessoires (`fx`), un mouvement de tête (`mot`), un mouvement de bouche (`ma`), un regard
// (`ea`) et une teinte (`col`). Les réglages passent par des ressorts (`moteur.ts`) : l'expression
// rebondit au lieu de claquer. Les six actions de l'assistant (`etats.ts`) choisissent chacune
// dans leur liste (`PAR_ACTION`) : l'action se lit sur le visage, pas sur un libellé.

import type { Teinte } from "@/lib/visage/couleur";
import type { EtatAssistant } from "@/lib/visage/etats";

export type TypeOeil = "n" | "arc" | "cup" | "x" | "gt" | "heart" | "star" | "spiral" | "dot" | "line";
export type TypeBouche = "b" | "w" | "zig" | "wavy" | "o";
export type Accessoire =
  | "zzz" | "sweat" | "tear" | "anger" | "steam" | "hearts" | "stars" | "sparkles" | "note"
  | "question" | "exclaim" | "bulb" | "gears" | "dots" | "cloud" | "sunglasses" | "glasses"
  | "cold" | "gloom" | "ear" | "sound" | "check";
export type Mouvement =
  | "none" | "breathe" | "bob" | "nod" | "shake" | "tilt" | "bounce" | "jump" | "tremble" | "shiver"
  | "sway" | "wobble" | "spin" | "float" | "lean" | "back" | "laugh" | "dance" | "sink" | "sob";
export type MouvementBouche = "none" | "talk" | "laugh" | "chew" | "yawn" | "sing" | "snore" | "pant" | "grit";
export type Regard =
  | "none" | "wander" | "scan" | "read" | "up" | "upright" | "down" | "away" | "roll" | "dart"
  | "compare" | "user" | "follow";

/** Les réglages numériques d'une expression (tous facultatifs : `DEFAUT` complète). */
interface Reglages {
  /** Ouverture et taille des yeux, taille de la pupille. */
  eo?: number; es?: number; ps?: number;
  /** Paupière du haut (`lt`), inclinaison (`la`), paupière du bas (`lb`), éclat dans l'œil (`sh`). */
  lt?: number; la?: number; lb?: number; sh?: number;
  /** Sourcil gauche, droit, angle, froncement du droit. */
  bl?: number; br?: number; ba?: number; bk?: number;
  /** Courbure, largeur, ouverture, asymétrie de la bouche ; joues rouges. */
  mc?: number; mw?: number; mo?: number; mk?: number; cb?: number;
}

export interface Expression extends Reglages {
  id: string;
  nom: string;
  cat: Categorie;
  /** Type d'œil (`et`) et, s'il diffère, de l'œil droit (`et2`). */
  et: TypeOeil;
  et2?: TypeOeil;
  mt: TypeBouche;
  fx: readonly Accessoire[];
  mot: Mouvement;
  ma: MouvementBouche;
  ea: Regard;
  col: Teinte;
  /** 1 = cligne des yeux. */
  blk: 0 | 1;
  /** Dents (`td`) et langue (`tn`) visibles quand la bouche s'ouvre. */
  td?: 1;
  tn?: 1;
}

const REPOS = "Repos", JOIE = "Joie", AMOUR = "Amour", MALICE = "Malice", SURPRISE = "Surprise";
const PEUR = "Peur", TRISTESSE = "Tristesse", COLERE = "Colère", DOUTE = "Doute";
const REFLEXION = "Réflexion", ECOUTE = "Écoute", PAROLE = "Parole", VEILLE = "Veille", TECHNIQUE = "Technique";
export const CATEGORIES = [REPOS, JOIE, AMOUR, MALICE, SURPRISE, PEUR, TRISTESSE, COLERE, DOUTE, REFLEXION, ECOUTE, PAROLE, VEILLE, TECHNIQUE] as const;
type Categorie = (typeof CATEGORIES)[number];

type Options = Reglages & Partial<Pick<Expression, "et" | "et2" | "mt" | "fx" | "mot" | "ma" | "ea" | "col" | "blk" | "td" | "tn">>;

/** Les réglages d'un visage « sans expression » : ce que `Reglages` laisse vide. */
export const DEFAUT = { eo: 1, es: 1, ps: 1, lt: 0, la: 0, lb: 0, sh: 0, bl: 0, br: 0, ba: 0, bk: 0, mc: 0.45, mw: 1, mo: 0, mk: 0, cb: 0 } as const;

export const EXPRESSIONS: Expression[] = [];
export const PAR_ID: Record<string, Expression> = {};

function x(id: string, nom: string, cat: Categorie, o: Options = {}): void {
  const e: Expression = { et: "n", mt: "b", fx: [], mot: "breathe", ma: "none", ea: "wander", col: "n", blk: 1, ...o, id, nom, cat };
  EXPRESSIONS.push(e);
  PAR_ID[id] = e;
}

  x("neutre", "Neutre", REPOS, { mc: 0.35, mw: 0.8 });
  x("content", "Content", REPOS, { mc: 0.7, lb: 0.15, cb: 0.15, mot: "bob" });
  x("discret", "Sourire discret", REPOS, { mc: 0.5, mw: 0.7 });
  x("detendu", "Détendu", REPOS, { lt: 0.28, mc: 0.55, lb: 0.12, mot: "float" });
  x("reveur", "Rêveur", REPOS, { ea: "up", mc: 0.6, fx: ["sparkles"], mot: "float", sh: 0.6, cb: 0.1 });
  x("curieux", "Curieux", REPOS, { eo: 1.15, es: 1.08, bl: 0.6, br: 0.9, mc: 0.35, mw: 0.7, mot: "tilt", sh: 0.4 });
  x("interesse", "Intéressé", REPOS, { eo: 1.1, bl: 0.4, br: 0.4, mc: 0.6, ea: "scan" });
  x("attentif", "Attentif", REPOS, { eo: 1.15, ps: 1.1, bl: 0.3, br: 0.3, mc: 0.4, mot: "lean", ea: "user" });
  x("bienveillant", "Bienveillant", REPOS, { lb: 0.25, mc: 0.8, cb: 0.3, sh: 0.5, mot: "sway" });
  x("serein", "Serein", REPOS, { et: "cup", mc: 0.75, mw: 0.9, mot: "float" });
  x("joyeux", "Joyeux", JOIE, { et: "arc", mc: 0.9, mo: 0.5, td: 1, mw: 1.2, cb: 0.3, mot: "bounce" });
  x("eclat", "Éclat de rire", JOIE, { et: "arc", mc: 0.9, mo: 0.8, td: 1, tn: 1, mw: 1.3, ma: "laugh", mot: "laugh", cb: 0.35 });
  x("mortrire", "Mort de rire", JOIE, { et: "gt", mc: 0.9, mo: 1, td: 1, tn: 1, mw: 1.4, ma: "laugh", mot: "laugh", fx: ["tear"], cb: 0.4 });
  x("enthou", "Enthousiaste", JOIE, { eo: 1.2, es: 1.1, sh: 1, bl: 0.8, br: 0.8, mc: 0.9, mo: 0.5, td: 1, mw: 1.2, fx: ["stars"], mot: "jump" });
  x("ravi", "Ravi", JOIE, { sh: 1, lb: 0.3, mc: 0.9, mo: 0.35, cb: 0.35, fx: ["sparkles"], mot: "bounce" });
  x("excite", "Excité", JOIE, { eo: 1.25, es: 1.12, ps: 1.15, bl: 0.9, br: 0.9, mc: 0.9, mo: 0.7, td: 1, mw: 1.2, mot: "jump", ma: "pant", ea: "dart" });
  x("heureux", "Heureux", JOIE, { et: "arc", mc: 0.75, mo: 0.2, cb: 0.35, mot: "bob" });
  x("fier", "Fier", JOIE, { lt: 0.2, lb: 0.2, mc: 0.7, mw: 0.9, sh: 0.5, fx: ["sparkles"], mot: "back" });
  x("triomphant", "Triomphant", JOIE, { et: "arc", mc: 1, mo: 0.7, td: 1, mw: 1.3, fx: ["stars"], mot: "jump" });
  x("soulage", "Soulagé", JOIE, { et: "cup", mc: 0.6, mw: 0.9, fx: ["sweat"], mot: "sink" });
  x("reconn", "Reconnaissant", JOIE, { sh: 0.8, lb: 0.2, mc: 0.8, cb: 0.3, fx: ["hearts"], mot: "nod" });
  x("rayonnant", "Rayonnant", JOIE, { sh: 1, lb: 0.25, mc: 0.95, mo: 0.3, cb: 0.4, fx: ["sparkles"], mot: "float" });
  x("gloussant", "Gloussant", JOIE, { et: "arc", mo: 0.25, mw: 0.7, mc: 0.8, mot: "tremble", ma: "laugh", cb: 0.3 });
  x("amoureux", "Amoureux", AMOUR, { et: "heart", mc: 0.9, mo: 0.2, cb: 0.5, fx: ["hearts"], mot: "sway", col: "pink" });
  x("tendre", "Tendre", AMOUR, { lb: 0.3, sh: 0.8, mc: 0.7, mw: 0.8, cb: 0.45, mot: "sway", col: "pink" });
  x("calin", "Câlin", AMOUR, { et: "cup", mc: 0.85, cb: 0.5, mot: "sway", fx: ["hearts"], col: "pink" });
  x("bisou", "Bisou", AMOUR, { et: "arc", mt: "o", mw: 0.5, mo: 0.1, cb: 0.4, fx: ["hearts"], mot: "bob", col: "pink" });
  x("charme", "Charmé", AMOUR, { sh: 1, lb: 0.2, mc: 0.7, cb: 0.5, fx: ["sparkles"], bl: 0.3, br: 0.3, col: "pink" });
  x("timide", "Timide", AMOUR, { ea: "away", lb: 0.15, mc: 0.5, mw: 0.6, cb: 0.7, mot: "tilt", col: "pink" });
  x("gene", "Gêné", AMOUR, { ea: "away", mt: "wavy", mw: 0.8, cb: 0.8, fx: ["sweat"], mot: "tremble", col: "pink" });
  x("malicieux", "Malicieux", MALICE, { lt: 0.28, la: 0.35, br: 0.5, mc: 0.8, mk: 0.6, mw: 1.05, col: "violet" });
  x("clin", "Clin d'œil", MALICE, { et2: "arc", mc: 0.9, mo: 0.4, td: 1, mk: 0.3, mw: 1.1, fx: ["sparkles"] });
  x("complice", "Complice", MALICE, { lt: 0.3, la: 0.2, mk: 0.7, mc: 0.8, br: 0.6, sh: 0.4 });
  x("taquin", "Taquin", MALICE, { et2: "arc", tn: 1, mo: 0.45, mc: 0.6, mk: 0.2 });
  x("langue", "Langue tirée", MALICE, { et: "arc", mo: 0.5, tn: 1, mc: 0.9, mot: "bob" });
  x("farceur", "Farceur", MALICE, { mt: "w", sh: 0.8, bl: 0.5, br: 0.5, mw: 1.1, fx: ["sparkles"], mot: "bounce" });
  x("sournois", "Sournois", MALICE, { lt: 0.4, la: 0.45, mk: 0.8, mc: 0.6, col: "violet" });
  x("fierlui", "Fier de lui", MALICE, { lt: 0.25, bl: 0.3, br: 0.3, mk: 0.5, mc: 0.9, mot: "back" });
  x("sarcastique", "Sarcastique", MALICE, { lt: 0.38, br: 0.9, bl: -0.1, mk: -0.5, mc: 0.1, ea: "roll" });
  x("cool", "Cool", MALICE, { fx: ["sunglasses"], mk: 0.5, mc: 0.7, mot: "back" });
  x("detache", "Détaché", MALICE, { lt: 0.5, mc: 0, mw: 0.7, ea: "none" });
  x("surpris", "Surpris", SURPRISE, { eo: 1.3, es: 1.1, ps: 0.6, bl: 1, br: 1, mt: "o", mo: 0.5, mw: 0.6, fx: ["exclaim"], mot: "jump", ea: "none" });
  x("stupefait", "Stupéfait", SURPRISE, { eo: 1.4, es: 1.15, ps: 0.45, bl: 1, br: 1, mo: 0.9, mw: 0.8, mc: -0.1, mot: "tremble", ea: "none" });
  x("choque", "Choqué", SURPRISE, { eo: 1.4, es: 1.15, ps: 0.45, bl: 0.9, br: 0.9, mt: "o", mo: 0.8, mw: 0.7, mot: "shake", ea: "none" });
  x("emerveille", "Émerveillé", SURPRISE, { et: "star", mo: 0.5, mc: 0.9, td: 1, fx: ["sparkles"], mot: "float", col: "gold" });
  x("waouh", "Waouh", SURPRISE, { sh: 1, eo: 1.3, es: 1.15, mt: "o", mo: 0.6, mw: 0.7, bl: 1, br: 1, fx: ["stars"], mot: "bounce", ea: "none" });
  x("eberlue", "Éberlué", SURPRISE, { et: "dot", mt: "o", mo: 0.2, mw: 0.4, mot: "tremble" });
  x("sursaut", "Sursaut", SURPRISE, { eo: 1.35, es: 1.1, ps: 0.5, bl: 1, br: 1, mt: "zig", mo: 0.35, mw: 0.8, fx: ["exclaim"], mot: "jump", ea: "dart" });
  x("inquiet", "Inquiet", PEUR, { ba: -0.7, bl: 0.3, br: 0.3, lt: 0.1, mt: "wavy", mw: 0.8, fx: ["sweat"], mot: "tremble" });
  x("anxieux", "Anxieux", PEUR, { ba: -0.8, bl: 0.5, br: 0.5, mt: "wavy", fx: ["sweat"], mot: "tremble", ea: "dart", es: 1.05, ps: 0.8 });
  x("effraye", "Effrayé", PEUR, { eo: 1.35, es: 1.12, ps: 0.5, ba: -0.6, bl: 0.9, br: 0.9, mt: "zig", mo: 0.4, fx: ["sweat"], mot: "tremble", col: "blue", ea: "dart" });
  x("terrifie", "Terrifié", PEUR, { eo: 1.4, ps: 0.4, ba: -0.7, bl: 1, br: 1, mo: 0.9, mc: -0.3, td: 1, mot: "shake", col: "blue", fx: ["sweat", "cold"], ea: "none" });
  x("nerveux", "Nerveux", PEUR, { mt: "zig", ea: "dart", ba: -0.4, fx: ["sweat"], mot: "tremble", ps: 0.8 });
  x("frissonne", "Frissonnant", PEUR, { mt: "wavy", mot: "shiver", fx: ["cold"], ba: -0.3, lb: 0.1, col: "blue" });
  x("hesitant", "Hésitant", PEUR, { ba: -0.3, bl: 0.2, br: 0.6, mt: "wavy", mw: 0.7, ea: "dart", mot: "tilt" });
  x("triste", "Triste", TRISTESSE, { ba: -0.8, la: -0.5, lt: 0.2, mc: -0.6, mw: 0.8, mot: "sink", ea: "down", col: "blue" });
  x("pleure", "Pleure", TRISTESSE, { ba: -0.9, la: -0.4, mc: -0.7, mo: 0.5, mw: 1, fx: ["tear"], mot: "sink", col: "blue", sh: 0.6, ea: "down" });
  x("sanglote", "Sanglote", TRISTESSE, { ba: -0.9, la: -0.5, mc: -0.8, mo: 0.7, fx: ["tear"], mot: "sob", ma: "pant", col: "blue", ea: "down" });
  x("decu", "Déçu", TRISTESSE, { lt: 0.3, la: -0.35, ba: -0.5, mc: -0.4, mw: 0.7, ea: "down", mot: "sink", col: "blue" });
  x("abattu", "Abattu", TRISTESSE, { lt: 0.5, la: -0.4, mc: -0.5, mw: 0.7, ea: "down", mot: "sink", fx: ["gloom"], col: "blue" });
  x("melancolique", "Mélancolique", TRISTESSE, { lt: 0.2, la: -0.3, ba: -0.4, mc: -0.2, ea: "away", mot: "float", col: "blue", sh: 0.3 });
  x("boudeur", "Boudeur", TRISTESSE, { lt: 0.25, la: 0.15, mc: -0.5, mw: 0.6, ea: "away", cb: 0.3, mot: "tilt" });
  x("vexe", "Vexé", TRISTESSE, { lt: 0.3, la: 0.2, mc: -0.3, mw: 0.7, ea: "away", mot: "back", col: "warm" });
  x("emu", "Ému", TRISTESSE, { sh: 1, lb: 0.3, ba: -0.4, mc: 0.6, cb: 0.3, mot: "bob" });
  x("larme", "Larme à l'œil", TRISTESSE, { sh: 1, ba: -0.3, mc: 0.4, mw: 0.8, fx: ["tear"], mot: "float" });
  x("agace", "Agacé", COLERE, { lt: 0.28, la: 0.35, mc: -0.05, mw: 0.8, ea: "none", col: "warm" });
  x("fache", "Fâché", COLERE, { lt: 0.3, la: 0.6, ba: 0.8, mc: -0.5, fx: ["anger"], mot: "tremble", col: "red", ea: "none" });
  x("furieux", "Furieux", COLERE, { lt: 0.35, la: 0.8, ba: 1, mc: -0.2, mo: 0.7, td: 1, mw: 1.2, fx: ["anger", "steam"], mot: "shake", col: "red", ea: "none" });
  x("grognon", "Grognon", COLERE, { lt: 0.25, la: 0.4, ba: 0.5, mc: -0.7, mw: 1, mot: "sway", col: "warm", ea: "none" });
  x("irrite", "Irrité", COLERE, { lt: 0.3, la: 0.5, ba: 0.7, mo: 0.15, td: 1, mc: -0.1, ma: "grit", fx: ["anger"], col: "red", ea: "none" });
  x("exaspere", "Exaspéré", COLERE, { lt: 0.4, la: 0.2, ba: 0.3, mc: -0.2, ea: "roll", mw: 0.8, col: "warm" });
  x("degoute", "Dégoûté", DOUTE, { lt: 0.35, la: 0.2, mt: "wavy", mw: 0.9, ba: 0.2, col: "green", mot: "back", ea: "away" });
  x("nauseeux", "Nauséeux", DOUTE, { lt: 0.3, mt: "wavy", fx: ["sweat"], col: "green", mot: "sway", ea: "none" });
  x("sceptique", "Sceptique", DOUTE, { lt: 0.2, bl: -0.2, br: 0.9, ba: 0.2, mc: -0.1, mk: -0.5, mw: 0.8, ea: "none", mot: "tilt" });
  x("perplexe", "Perplexe", DOUTE, { bl: 0.3, br: 0.8, bk: 0.4, mk: 0.5, mc: -0.1, mw: 0.7, fx: ["question"], mot: "tilt" });
  x("confus", "Confus", DOUTE, { bl: 0.6, br: 0.1, ba: -0.3, mt: "wavy", fx: ["question"], mot: "wobble", ea: "dart" });
  x("dubitatif", "Dubitatif", DOUTE, { lt: 0.3, bl: 0.3, br: 0.7, mc: 0, mw: 0.6, ea: "away", mot: "tilt" });
  x("etourdi", "Étourdi", DOUTE, { et: "spiral", mt: "wavy", mot: "spin", col: "violet" });
  x("ko", "K.-O.", DOUTE, { et: "x", mo: 0.5, tn: 1, mc: -0.2, mot: "wobble", col: "grey" });
  x("reflechit", "Réfléchit", REFLEXION, { eo: 0.9, ea: "up", bl: -0.1, br: 0.7, mc: 0, mw: 0.5, fx: ["dots"], mot: "tilt", col: "violet" });
  x("cogite", "Cogite", REFLEXION, { ea: "upright", lt: 0.1, ba: 0.2, mc: 0, mw: 0.5, fx: ["gears"], mot: "tilt", col: "violet" });
  x("calcule", "Calcule", REFLEXION, { ea: "scan", lt: 0.1, mc: 0, mw: 0.6, fx: ["gears", "dots"], mot: "lean", col: "violet" });
  x("idee", "Idée !", REFLEXION, { eo: 1.2, bl: 0.8, br: 0.8, mc: 0.9, mo: 0.5, td: 1, mw: 1.1, fx: ["bulb"], mot: "jump", sh: 0.5, ea: "up" });
  x("eureka", "Eurêka", REFLEXION, { et: "star", mc: 1, mo: 0.7, td: 1, mw: 1.2, fx: ["bulb"], mot: "jump", col: "gold" });
  x("concentre", "Concentré", REFLEXION, { lt: 0.25, la: 0.3, ba: 0.4, mc: 0, mw: 0.6, ea: "none", mot: "lean", col: "violet" });
  x("analyse", "Analyse", REFLEXION, { lt: 0.18, ba: 0.2, ea: "scan", mc: 0, mw: 0.6, fx: ["glasses"], mot: "lean", col: "violet" });
  x("lit", "Lit", REFLEXION, { lt: 0.2, ea: "read", mc: 0.1, mw: 0.6, fx: ["glasses"], mot: "lean" });
  x("cherche", "Cherche", REFLEXION, { ea: "wander", bl: 0.3, br: 0.5, mc: 0, mw: 0.6, fx: ["question"], mot: "tilt", es: 1.05 });
  x("verifie", "Vérifie", REFLEXION, { ea: "scan", lt: 0.15, mc: 0.4, mw: 0.7, fx: ["check"], mot: "nod", col: "green" });
  x("redige", "Rédige", REFLEXION, { ea: "down", lt: 0.15, mc: 0.2, mw: 0.6, fx: ["dots"], mot: "lean" });
  x("compare", "Compare", REFLEXION, { ea: "compare", bl: 0.2, br: 0.2, mc: 0, mw: 0.6, mot: "sway" });
  x("souvient", "Se souvient", REFLEXION, { ea: "upright", mc: 0.3, mw: 0.6, fx: ["cloud"], mot: "float", col: "violet" });
  x("decide", "Décide", REFLEXION, { lt: 0.15, mc: 0.7, mot: "nod", fx: ["check"], ea: "none", col: "green" });
  x("approuve", "Approuve", REFLEXION, { et: "arc", mc: 0.8, mo: 0.3, mot: "nod", fx: ["check"], col: "green" });
  x("desapprouve", "Désapprouve", REFLEXION, { lt: 0.25, la: 0.3, mc: -0.4, mot: "shake", ea: "none", col: "warm" });
  x("suit", "Suit du regard", REFLEXION, { ea: "follow", eo: 1.05, mc: 0.4, mw: 0.7, mot: "lean" });
  x("scrute", "Scrute", REFLEXION, { ea: "follow", lt: 0.2, ba: 0.2, mc: 0.1, mw: 0.6, fx: ["glasses"], mot: "lean", col: "violet" });
  x("ecoute", "À l'écoute", ECOUTE, { eo: 1.15, ps: 1.1, bl: 0.35, br: 0.35, mc: 0.4, mw: 0.7, mot: "lean", ea: "user", fx: ["ear"], col: "cyan" });
  x("hoche", "Hoche la tête", ECOUTE, { mc: 0.6, mot: "nod", ea: "user", fx: ["ear"], col: "cyan", lb: 0.15 });
  x("ecouteint", "Écoute, intéressé", ECOUTE, { eo: 1.2, sh: 0.6, bl: 0.5, br: 0.5, mc: 0.7, mot: "tilt", ea: "user", fx: ["ear"], col: "cyan", cb: 0.15 });
  x("entendmal", "Entend mal", ECOUTE, { bl: 0.5, br: 0.2, mt: "wavy", mw: 0.5, mot: "tilt", fx: ["ear", "question"], ea: "none", col: "cyan" });
  x("percoit", "Perçoit", ECOUTE, { et: "cup", mc: 0.3, mw: 0.7, fx: ["ear"], mot: "float", col: "cyan" });
  x("parle", "Parle", PAROLE, { mo: 0.4, mc: 0.6, ma: "talk", mot: "bob", fx: ["sound"], ea: "user" });
  x("explique", "Explique", PAROLE, { mo: 0.35, mc: 0.5, ma: "talk", bl: 0.4, br: 0.2, mot: "sway", ea: "wander", fx: ["sound"] });
  x("raconte", "Raconte", PAROLE, { mo: 0.4, mc: 0.7, ma: "talk", lb: 0.2, sh: 0.5, mot: "sway", fx: ["sound"] });
  x("annonce", "Annonce", PAROLE, { eo: 1.15, bl: 0.6, br: 0.6, mo: 0.6, mc: 0.7, td: 1, ma: "talk", mot: "jump", fx: ["sound", "exclaim"] });
  x("chante", "Chante", PAROLE, { et: "arc", mo: 0.5, mc: 0.7, ma: "sing", mot: "dance", fx: ["note"] });
  x("siffle", "Siffle", PAROLE, { mt: "o", mw: 0.4, mo: 0.1, fx: ["note"], mot: "bob", lt: 0.1 });
  x("danse", "Danse", PAROLE, { et: "arc", mc: 1, mo: 0.6, td: 1, mw: 1.2, mot: "dance", fx: ["note"], cb: 0.3 });
  x("mache", "Mâche", PAROLE, { lt: 0.1, mc: 0.2, ma: "chew", mot: "bob", ea: "none" });
  x("chuchote", "Chuchote", PAROLE, { mo: 0.2, mw: 0.5, ma: "talk", lb: 0.1, mc: 0.5, mot: "lean", ea: "away" });
  x("somnolent", "Somnolent", VEILLE, { lt: 0.55, la: -0.1, mc: 0.1, mw: 0.6, mot: "sink", ea: "down" });
  x("baille", "Bâille", VEILLE, { et: "cup", mo: 0.1, mc: -0.1, mw: 0.9, ma: "yawn", mot: "back" });
  x("endormi", "Endormi", VEILLE, { et: "cup", mc: 0.3, mw: 0.6, fx: ["zzz"], mot: "float", col: "grey", blk: 0 });
  x("epuise", "Épuisé", VEILLE, { lt: 0.55, la: -0.3, mt: "wavy", fx: ["sweat"], mot: "sink", col: "grey", ea: "down" });
  x("reveille", "Réveillé en sursaut", VEILLE, { eo: 1.3, es: 1.1, ps: 0.7, mo: 0.4, mt: "o", mot: "jump", ea: "dart" });
  x("horsligne", "Hors ligne", VEILLE, { et: "x", mc: -0.1, mw: 0.6, col: "grey", mot: "none", blk: 0 });
  x("eteint", "Éteint", VEILLE, { et: "line", mc: 0, mw: 0.6, col: "grey", mot: "none", blk: 0 });
  x("veille", "En veille", VEILLE, { et: "cup", mc: 0.2, mw: 0.5, col: "grey", mot: "breathe", blk: 0 });
  x("ronfle", "Ronfle", VEILLE, { et: "cup", mo: 0.4, ma: "snore", fx: ["zzz"], mot: "breathe", col: "grey", blk: 0 });
  x("connecte", "Se connecte", TECHNIQUE, { et: "spiral", mc: 0.3, mw: 0.7, col: "cyan", mot: "none" });
  x("charge", "Charge", TECHNIQUE, { et: "spiral", mt: "o", mo: 0.1, mw: 0.4, col: "violet", mot: "none" });
  x("telecharge", "Télécharge", TECHNIQUE, { ea: "down", mc: 0.2, fx: ["dots"], col: "cyan", lt: 0.1 });
  x("envoie", "Envoie", TECHNIQUE, { ea: "upright", mc: 0.7, mw: 0.8, fx: ["stars"], mot: "jump", col: "cyan" });

/** Pour chaque action de l'assistant, les expressions qu'il enchaîne (une toutes les 2,4 s). */
export const PAR_ACTION: Record<EtatAssistant, readonly string[]> = {
  repos: ["neutre", "content", "discret", "detendu", "reveur", "curieux", "bienveillant", "serein", "siffle", "heureux", "clin", "cool"],
  ecoute: ["ecoute", "hoche", "ecouteint", "percoit", "attentif", "interesse", "entendmal", "hoche"],
  reflexion: ["reflechit", "cogite", "calcule", "concentre", "analyse", "souvient", "hesitant", "perplexe", "idee"],
  consulte: ["suit", "scrute", "lit", "verifie", "cherche", "compare"],
  reponse: ["parle", "explique", "raconte", "joyeux", "decide", "approuve", "annonce", "charme"],
  indispo: ["veille", "endormi", "ronfle", "horsligne", "eteint", "somnolent"],
};
