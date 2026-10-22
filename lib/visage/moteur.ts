// lib/visage/moteur.ts — l'état vivant du visage et sa mise à jour, image après image.
//
// Pur calcul (aucun canvas, aucun DOM) : `avancer(visage, dt)` fait bouger les ressorts des
// réglages, la pose de la tête, le regard et les accessoires vers l'expression du moment. Le
// dessin est dans `dessin.ts`. `reduit` (mouvement réduit) fige tout : l'expression est atteinte
// d'un coup et le temps ne passe pas.

import { MARQUE, TEINTES, type RGB } from "@/lib/visage/couleur";
import { clignement, BOUCHE_MOUVEMENTS, REGARDS, TETE_MOUVEMENTS, type Pose } from "@/lib/visage/mouvement";
import { CORPS, type Corps, type EtatAssistant } from "@/lib/visage/etats";
import { DEFAUT, PAR_ACTION, PAR_ID, type Expression, type TypeBouche, type TypeOeil } from "@/lib/visage/expressions";

const REGLAGES = ["eo", "es", "ps", "lt", "la", "lb", "sh", "bl", "br", "ba", "bk", "mc", "mw", "mo", "mk", "cb"] as const;
const CANAUX = ["kr", "kg", "kb"] as const;
const NUM = [...REGLAGES, ...CANAUX] as const;
type Num = (typeof NUM)[number];
type Valeurs = Record<Num, number>;

/** Une expression dure 2,4 s avant que la suivante de l'action ne prenne le relais. */
export const DUREE_EXPRESSION = 2.4;

export interface Visage {
  /** L'action dessinée. */
  etat: EtatAssistant;
  /** Rang de l'instance (décale les clignements et l'enchaînement des expressions). */
  idx: number;
  /** Mouvement réduit demandé par l'utilisateur : rien ne bouge. */
  reduit: boolean;
  /** Une expression imposée (id), sinon celles de l'action. */
  imposee: string | null;
  /** Horloge (s) de l'instance ; `t` y ajoute le décalage de l'instance. */
  horloge: number;
  t: number;
  /** Temps écoulé depuis la création : sert aux fondus d'œil et de bouche. */
  age: number;
  corps: Corps;
  /** Angle (rad) de l'app consultée, et celui vers lequel on tourne. */
  aim: number;
  aimCible: number;
  x: Valeurs;
  v: Valeurs;
  cible: Valeurs;
  /** Opacité de chaque accessoire (monte quand l'expression le porte, redescend sinon). */
  fa: Record<string, number>;
  fxCible: Record<string, 1>;
  pose: Pose;
  regard: [number, number];
  oeilActuel: [TypeOeil, TypeOeil];
  oeilPrec: [TypeOeil, TypeOeil];
  oeilT: number;
  boucheActuelle: TypeBouche;
  bouchePrec: TypeBouche;
  boucheT: number;
  ex: Expression;
  /** Teinte courante et couleur des traits, calculées à chaque dessin. */
  teinte: RGB;
  trait: RGB;
}

const zeros = (): Valeurs => Object.fromEntries(NUM.map((n) => [n, 0])) as Valeurs;

function expressionDe(v: Visage): Expression {
  if (v.imposee) {
    const e = PAR_ID[v.imposee];
    if (e) return e;
  }
  const liste = PAR_ACTION[v.etat];
  const id = liste[Math.floor(v.horloge / DUREE_EXPRESSION + v.idx * 0.9) % liste.length]!;
  return PAR_ID[id]!;
}

/** Applique une expression : les nouvelles cibles, et le fondu d'œil / de bouche si le type change. */
function appliquer(v: Visage, ex: Expression, net: boolean): void {
  const col = TEINTES[ex.col];
  for (const n of NUM) {
    v.cible[n] = n === "kr" ? col[0] : n === "kg" ? col[1] : n === "kb" ? col[2] : (ex[n] ?? DEFAUT[n]);
  }
  const yeux: [TypeOeil, TypeOeil] = [ex.et, ex.et2 ?? ex.et];
  if (yeux[0] !== v.oeilActuel[0] || yeux[1] !== v.oeilActuel[1]) {
    v.oeilPrec = v.oeilActuel;
    v.oeilActuel = yeux;
    v.oeilT = net || v.reduit ? -9 : v.age;
  }
  if (ex.mt !== v.boucheActuelle) {
    v.bouchePrec = v.boucheActuelle;
    v.boucheActuelle = ex.mt;
    v.boucheT = net || v.reduit ? -9 : v.age;
  }
  v.fxCible = {};
  for (const n of ex.fx) v.fxCible[n] = 1;
  if (net) {
    for (const n of NUM) {
      v.x[n] = v.cible[n];
      v.v[n] = 0;
    }
    for (const n of Object.keys(v.fxCible)) v.fa[n] = 1;
  }
  v.ex = ex;
}

export function creerVisage(etat: EtatAssistant, opts: { idx?: number; reduit?: boolean; imposee?: string | null } = {}): Visage {
  const idx = opts.idx ?? 0;
  const premiere = PAR_ID[PAR_ACTION[etat][0]!]!;
  const x = zeros();
  for (const n of NUM) x[n] = n in DEFAUT ? DEFAUT[n as keyof typeof DEFAUT] : MARQUE[0];
  const v: Visage = {
    etat,
    idx,
    reduit: opts.reduit ?? false,
    imposee: opts.imposee ?? null,
    horloge: 0,
    t: 0,
    age: 0,
    corps: { ...CORPS[etat] },
    aim: -Math.PI / 3,
    aimCible: -Math.PI / 3,
    x,
    v: zeros(),
    cible: zeros(),
    fa: {},
    fxCible: {},
    pose: [0, 0, 0, 1, 1],
    regard: [0, 0],
    oeilActuel: ["n", "n"],
    oeilPrec: ["n", "n"],
    oeilT: -9,
    boucheActuelle: "b",
    bouchePrec: "b",
    boucheT: -9,
    ex: premiere,
    teinte: MARQUE,
    trait: MARQUE,
  };
  v.t = v.reduit ? 2 + idx * 3.7 : idx * 3.7;
  appliquer(v, expressionDe(v), true);
  return v;
}

/** Fait vivre le visage de `dt` secondes (0 = mouvement réduit : l'image est figée). */
export function avancer(v: Visage, dt: number): void {
  v.horloge += dt;
  v.t = v.reduit ? 2 + v.idx * 3.7 : v.horloge + v.idx * 3.7;
  // Le corps (verre, halo, faisceau) glisse vers les valeurs de l'action.
  const visee = CORPS[v.etat];
  const kc = 1 - Math.exp(-dt * 3.6);
  for (const cle of Object.keys(visee) as (keyof Corps)[]) v.corps[cle] += (visee[cle] - v.corps[cle]) * kc;
  v.aim += angle(v.aimCible - v.aim) * (1 - Math.exp(-dt * 4));

  const ex = expressionDe(v);
  if (ex !== v.ex) appliquer(v, ex, false);
  v.age += dt;

  // Ressorts : chaque réglage rebondit vers sa cible (les canaux de couleur sont plus mous).
  const pas = dt > 0 ? Math.ceil(dt / 0.016) : 0;
  const h = pas ? dt / pas : 0;
  for (let s = 0; s < pas; s++) {
    for (const n of NUM) {
      const couleur = n === "kr" || n === "kg" || n === "kb";
      const k = couleur ? 40 : 240;
      const amorti = couleur ? 13 : 19;
      v.v[n] += ((v.cible[n] - v.x[n]) * k - v.v[n] * amorti) * h;
      v.x[n] += v.v[n] * h;
    }
  }
  if (v.reduit) for (const n of NUM) v.x[n] = v.cible[n];

  const kf = 1 - Math.exp(-dt * 8);
  for (const n of Object.keys(v.fxCible)) if (v.fa[n] === undefined) v.fa[n] = 0;
  for (const n of Object.keys(v.fa)) v.fa[n]! += ((v.fxCible[n] ? 1 : 0) - v.fa[n]!) * kf;

  const cible = TETE_MOUVEMENTS[ex.mot](v.t);
  const km = 1 - Math.exp(-dt * 9);
  for (let i = 0; i < 5; i++) v.pose[i] = v.pose[i]! + (cible[i]! - v.pose[i]!) * km;

  const g = REGARDS[ex.ea](v.t, v.aim);
  const kg = v.reduit ? 1 : 1 - Math.exp(-dt * 9);
  v.regard[0] += (g[0] - v.regard[0]) * kg;
  v.regard[1] += (g[1] - v.regard[1]) * kg;

  // Une expression « grise » (veille, hors ligne) éteint aussi le verre.
  const gris = ex.col === "grey" ? 1 : 0;
  const kp = 1 - Math.exp(-dt * 4);
  v.corps.grey += (gris - v.corps.grey) * kp;
  v.corps.life += ((gris ? 0.75 : 1) - v.corps.life) * kp;
  v.corps.glow += ((gris ? 0.12 : 0.72) - v.corps.glow) * kp;
}

/** Ramène un angle dans -π..π. */
function angle(a: number): number {
  const tour = Math.PI * 2;
  while (a > Math.PI) a -= tour;
  while (a < -Math.PI) a += tour;
  return a;
}

/** Le visage regarde l'app dont l'angle (depuis le centre) est donné. */
export function viser(v: Visage, rad: number): void {
  v.aimCible = rad;
}

/** Change l'action : le corps et les expressions suivent en douceur. */
export function changerEtat(v: Visage, etat: EtatAssistant): void {
  v.etat = etat;
}

/** Clignement courant (0 ouvert, 1 fermé), ou 0 si l'expression ne cligne pas. */
export function paupiere(v: Visage): number {
  return v.ex.blk ? clignement(v.t, v.idx) : 0;
}

/** Mouvement de bouche de l'expression, ajouté à son ouverture. */
export function ouvertureAjoutee(v: Visage): number {
  return BOUCHE_MOUVEMENTS[v.ex.ma](v.t);
}
