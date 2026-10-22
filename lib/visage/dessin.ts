// lib/visage/dessin.ts — dessine le visage de l'assistant sur un <canvas> 2D.
//
// Une sphère de verre (lueurs qui tournent, reflet), deux yeux, deux sourcils, une bouche, des
// joues, et des accessoires de bande dessinée (cœurs, étoiles, gouttes, ampoule…). Tout se règle
// avec l'état de `moteur.ts` ; rien ici ne décide de l'expression. Les couleurs viennent de
// `couleur.ts`. Le repère est centré sur le visage, `R` = rayon de l'élément (la sphère en prend 78 %).

import {
  AMPOULE, BLANC, BLANC_BLEU, CONTOUR_OEIL, COLERE, COEUR_FLOTTANT, COEUR_ROSE, CULOT, CYAN, FROID, GRIS,
  INTERIEUR_BOUCHE, JOUE, LANGUE, LARME, MORNE, NUIT, OR, PLATINE, POINT_EXCLAMATION, PUPILLE, REFLET_BLEU,
  SOMBRE, SUEUR, TETE, VALIDE, VAPEUR, VERRES_FONCES, melange, rg, type RGB,
} from "@/lib/visage/couleur";
import { ouvertureAjoutee, paupiere, type Visage } from "@/lib/visage/moteur";
import type { Accessoire, TypeBouche, TypeOeil } from "@/lib/visage/expressions";

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const { sin, cos, max, min, PI } = Math;

/** Un point de tracé : le premier déplace le crayon, les suivants tirent un trait. */
function point(c: Ctx, i: number, x: number, y: number): void {
  if (i) c.lineTo(x, y);
  else c.moveTo(x, y);
}

function coeur(c: Ctx, x: number, y: number, z: number): void {
  c.beginPath();
  c.moveTo(x, y + z * 0.85);
  c.bezierCurveTo(x - z * 1.3, y + z * 0.1, x - z * 0.85, y - z * 0.95, x, y - z * 0.35);
  c.bezierCurveTo(x + z * 0.85, y - z * 0.95, x + z * 1.3, y + z * 0.1, x, y + z * 0.85);
  c.closePath();
}

function etoile(c: Ctx, x: number, y: number, z: number, rot: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - PI / 2 + (i * PI) / 5;
    const r = i % 2 ? z * 0.45 : z;
    point(c, i, x + cos(a) * r, y + sin(a) * r);
  }
  c.closePath();
}

function etincelle(c: Ctx, x: number, y: number, z: number): void {
  const k = z * 0.16;
  c.beginPath();
  c.moveTo(x, y - z);
  c.quadraticCurveTo(x + k, y - k, x + z, y);
  c.quadraticCurveTo(x + k, y + k, x, y + z);
  c.quadraticCurveTo(x - k, y + k, x - z, y);
  c.quadraticCurveTo(x - k, y - k, x, y - z);
  c.closePath();
}

function capsule(c: Ctx, x: number, y: number, w: number, h: number): void {
  c.beginPath();
  if (c.roundRect) c.roundRect(x - w, y - h / 2, w * 2, h, w);
  else c.rect(x - w, y - h / 2, w * 2, h);
}

/** Les lueurs d'un verre : trois taches de lumière qui tournent à des vitesses différentes. */
function verre(c: Ctx, v: Visage, r: number): void {
  const { corps: p, t, teinte, trait } = v;
  const vitesse = 0.22 + p.spin * 1.6;
  const fond = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  fond.addColorStop(0, rg(melange(SOMBRE, teinte, 0.3 * (1 - p.grey)), 0.95 * p.life));
  fond.addColorStop(0.6, rg(melange(SOMBRE, GRIS, p.grey * 0.5), 0.92 * p.life));
  fond.addColorStop(1, rg(NUIT, 0.96 * p.life));
  c.fillStyle = fond;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fill();

  c.save();
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.clip();
  c.globalCompositeOperation = "lighter";
  const taches: [RGB, number, number, number, number][] = [
    [teinte, 0.7, 0.9, 0.0, 0.5],
    [trait, 0.55, 1.2, 2.1, 0.32],
    [melange(CYAN, teinte, 0.4), 0.8, 0.7, 4.2, 0.38],
  ];
  taches.forEach(([base, vx, vy, dephasage, poids], k) => {
    const x = cos(t * vitesse * vx + dephasage) * r * 0.42;
    const y = sin(t * vitesse * vy + dephasage * 1.3) * r * 0.38;
    const rr = r * (0.6 + 0.08 * sin(t * 0.7 + k));
    const col = melange(base, GRIS, p.grey);
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, rg(col, 0.5 * poids * (0.25 + 0.9 * p.glow) * p.life));
    g.addColorStop(1, rg(col, 0));
    c.fillStyle = g;
    c.fillRect(-r, -r, r * 2, r * 2);
  });
  c.restore();

  const ombre = c.createRadialGradient(0, 0, r * 0.78, 0, 0, r);
  ombre.addColorStop(0, rg(NUIT, 0));
  ombre.addColorStop(1, rg(NUIT, 0.4));
  c.fillStyle = ombre;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fill();

  const bord = c.createLinearGradient(-r, -r, r, r);
  bord.addColorStop(0, rg(trait, 0.9 * p.life));
  bord.addColorStop(0.45, rg(trait, 0.18 * p.life));
  bord.addColorStop(1, rg(teinte, 0.35 * p.life));
  c.strokeStyle = bord;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.stroke();

  c.save();
  c.translate(-r * 0.3, -r * 0.42);
  c.rotate(-0.6);
  const reflet = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.4);
  reflet.addColorStop(0, rg(PLATINE, 0.42 * p.life));
  reflet.addColorStop(1, rg(PLATINE, 0));
  c.scale(1, 0.5);
  c.fillStyle = reflet;
  c.beginPath();
  c.arc(0, 0, r * 0.4, 0, TAU);
  c.fill();
  c.restore();
}

function oeil(c: Ctx, v: Visage, r: number, s: number, type: TypeOeil, alpha: number, ouverture: number): void {
  if (alpha < 0.01) return;
  const f = v.x;
  const { t, teinte, trait } = v;
  const [gx, gy] = v.regard;
  const ex = s * r * 0.31;
  const ey = -r * 0.04;
  const rx = r * 0.125 * f.es!;
  const ry = r * 0.17 * f.es! * max(0.02, ouverture);
  c.save();
  c.globalAlpha = alpha;
  c.translate(ex, ey);
  c.lineCap = "round";
  c.lineJoin = "round";
  if (type === "n") {
    if (ry < r * 0.02) {
      // Paupière close : un simple trait.
      c.strokeStyle = rg(trait, 0.9);
      c.lineWidth = r * 0.05;
      c.beginPath();
      c.moveTo(-rx, 0);
      c.lineTo(rx, 0);
      c.stroke();
      c.restore();
      return;
    }
    const blanc = c.createRadialGradient(0, -ry * 0.3, 0, 0, 0, ry * 1.3);
    blanc.addColorStop(0, rg(BLANC, 0.99));
    blanc.addColorStop(1, rg(BLANC_BLEU, 0.98));
    c.beginPath();
    c.ellipse(0, 0, rx, ry, 0, 0, TAU);
    c.fillStyle = blanc;
    c.fill();
    c.save();
    c.clip();
    const ir = rx * 0.74;
    const ix = gx * rx * 0.3;
    const iy = gy * ry * 0.42;
    const iris = c.createRadialGradient(ix, iy, 0, ix, iy, ir);
    iris.addColorStop(0, rg(melange(teinte, PLATINE, 0.25), 1));
    iris.addColorStop(1, rg(melange(teinte, SOMBRE, 0.6), 1));
    c.fillStyle = iris;
    c.beginPath();
    c.arc(ix, iy, ir, 0, TAU);
    c.fill();
    c.fillStyle = rg(PUPILLE, 0.97);
    c.beginPath();
    c.arc(ix, iy, ir * 0.52 * f.ps!, 0, TAU);
    c.fill();
    c.fillStyle = rg(BLANC, 0.96);
    c.beginPath();
    c.arc(ix - ir * 0.34, iy - ir * 0.38, ir * 0.27, 0, TAU);
    c.fill();
    c.fillStyle = rg(BLANC, 0.7);
    c.beginPath();
    c.arc(ix + ir * 0.3, iy + ir * 0.34, ir * 0.12, 0, TAU);
    c.fill();
    if (f.sh! > 0.02) {
      // Les yeux qui brillent : une étincelle dans l'iris, une larme au bord.
      c.fillStyle = rg(BLANC, 0.95 * f.sh!);
      etincelle(c, ix + ir * 0.15, iy - ir * 0.05, ir * 0.55 * f.sh! * (0.85 + 0.15 * sin(t * 4)));
      c.fill();
      c.fillStyle = rg(REFLET_BLEU, 0.28 * f.sh!);
      c.beginPath();
      c.ellipse(0, ry * 0.66, rx * 0.85, ry * 0.2, 0, 0, TAU);
      c.fill();
    }
    // Paupières : celle du haut (inclinée) et celle du bas, de la couleur de la tête.
    c.save();
    c.rotate(-s * f.la! * 0.55);
    c.fillStyle = rg(TETE, 0.99);
    c.fillRect(-rx * 2, -ry * 3, rx * 4, ry * 2 + 2 * ry * f.lt!);
    c.restore();
    if (f.lb! > 0.02) {
      c.fillStyle = rg(TETE, 0.99);
      c.beginPath();
      c.ellipse(0, ry * (1.95 - 1.15 * f.lb!), rx * 1.5, ry * 1.1, 0, 0, TAU);
      c.fill();
    }
    c.restore();
    c.lineWidth = r * 0.02;
    c.strokeStyle = rg(CONTOUR_OEIL, 0.55);
    c.beginPath();
    c.ellipse(0, 0, rx, ry, 0, 0, TAU);
    c.stroke();
  } else if (type === "arc") {
    c.strokeStyle = rg(trait, 0.97);
    c.lineWidth = r * 0.065;
    c.beginPath();
    c.arc(0, ry * 0.4, rx, PI * 1.12, PI * 1.88);
    c.stroke();
  } else if (type === "cup") {
    c.strokeStyle = rg(trait, 0.9);
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.arc(0, -rx * 0.35, rx, PI * 0.12, PI * 0.88);
    c.stroke();
  } else if (type === "x") {
    c.strokeStyle = rg(trait, 0.95);
    c.lineWidth = r * 0.055;
    c.beginPath();
    c.moveTo(-rx * 0.8, -rx * 0.8);
    c.lineTo(rx * 0.8, rx * 0.8);
    c.moveTo(rx * 0.8, -rx * 0.8);
    c.lineTo(-rx * 0.8, rx * 0.8);
    c.stroke();
  } else if (type === "gt") {
    c.strokeStyle = rg(trait, 0.97);
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.moveTo(-s * rx * 0.9, -ry * 0.8);
    c.lineTo(s * rx * 0.7, 0);
    c.lineTo(-s * rx * 0.9, ry * 0.8);
    c.stroke();
  } else if (type === "heart") {
    const z = rx * 0.95 * (1 + 0.1 * sin(t * 6));
    coeur(c, 0, 0, z);
    c.fillStyle = rg(COEUR_ROSE, 0.98);
    c.fill();
    c.fillStyle = rg(BLANC, 0.7);
    c.beginPath();
    c.arc(-z * 0.45, -z * 0.3, z * 0.16, 0, TAU);
    c.fill();
  } else if (type === "star") {
    etoile(c, 0, 0, rx * 1.15 * (1 + 0.08 * sin(t * 5)), t * 0.4);
    c.fillStyle = rg(OR, 0.98);
    c.fill();
    c.strokeStyle = rg(BLANC, 0.6);
    c.lineWidth = 1;
    c.stroke();
  } else if (type === "spiral") {
    c.strokeStyle = rg(trait, 0.95);
    c.lineWidth = r * 0.04;
    c.beginPath();
    for (let k = 0; k <= 60; k++) {
      const u = k / 60;
      const a = u * TAU * 2.6 + t * 5 * (s < 0 ? 1 : -1);
      point(c, k, cos(a) * rx * 1.05 * u, sin(a) * rx * 1.05 * u);
    }
    c.stroke();
  } else if (type === "dot") {
    c.fillStyle = rg(trait, 0.97);
    c.beginPath();
    c.arc(0, 0, r * 0.05, 0, TAU);
    c.fill();
  } else {
    c.strokeStyle = rg(trait, 0.8);
    c.lineWidth = r * 0.05;
    c.beginPath();
    c.moveTo(-rx, 0);
    c.lineTo(rx, 0);
    c.stroke();
  }
  c.restore();
}

function sourcil(c: Ctx, v: Visage, r: number, s: number): void {
  const f = v.x;
  const haut = -r * 0.04 - r * 0.255 * f.es! - (s < 0 ? f.bl! : f.br!) * r * 0.09;
  const moitie = r * 0.115 * f.es!;
  const inclinaison = -s * (f.ba! * 0.45 + (s > 0 ? f.bk! * 0.4 : 0));
  c.save();
  c.translate(s * r * 0.31, haut);
  c.rotate(inclinaison);
  c.lineWidth = r * 0.045;
  c.lineCap = "round";
  c.strokeStyle = rg(v.trait, 0.93);
  c.beginPath();
  c.moveTo(-moitie, 0);
  c.quadraticCurveTo(0, -r * 0.04, moitie, 0);
  c.stroke();
  c.restore();
}

function bouche(c: Ctx, v: Visage, r: number, type: TypeBouche, alpha: number, ouverture: number): void {
  if (alpha < 0.01) return;
  const f = v.x;
  const y = r * 0.3;
  const w = r * 0.125 * f.mw!;
  const mc = f.mc!;
  const mk = f.mk! * r * 0.05;
  const t = v.t;
  c.save();
  c.globalAlpha = alpha;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = r * 0.04;
  c.strokeStyle = rg(v.trait, 0.93);
  if (type === "b") {
    const h = max(0, ouverture) * r * 0.2;
    if (h < r * 0.012) {
      c.beginPath();
      c.moveTo(-w, y - mk);
      c.quadraticCurveTo(0, y + mc * r * 0.2, w, y + mk);
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(-w, y - mk);
      c.quadraticCurveTo(0, y + mc * r * 0.04, w, y + mk);
      c.quadraticCurveTo(0, y + 2 * h + mc * r * 0.08, -w, y - mk);
      c.closePath();
      c.fillStyle = rg(INTERIEUR_BOUCHE, 0.97);
      c.fill();
      c.save();
      c.clip();
      if (v.ex.td) {
        c.fillStyle = rg(BLANC, 0.96);
        c.fillRect(-w, y - r * 0.08, w * 2, r * 0.07 + 0.04 * r * mc);
      }
      if (v.ex.tn) {
        c.fillStyle = rg(LANGUE, 0.97);
        c.beginPath();
        c.ellipse(0, y + h * 1.5, w * 0.55, h * 0.6 + r * 0.01, 0, 0, TAU);
        c.fill();
      }
      c.restore();
      c.stroke();
    }
  } else if (type === "w") {
    c.beginPath();
    c.moveTo(-w, y - mk * 0.5);
    c.quadraticCurveTo(-w * 0.5, y + r * 0.1, 0, y);
    c.quadraticCurveTo(w * 0.5, y + r * 0.1, w, y + mk * 0.5);
    c.stroke();
  } else if (type === "zig") {
    c.beginPath();
    for (let i = 0; i <= 7; i++) point(c, i, -w + (i * 2 * w) / 7, y + (i % 2 ? -1 : 1) * r * 0.025);
    c.stroke();
  } else if (type === "wavy") {
    c.beginPath();
    for (let i = 0; i <= 24; i++) point(c, i, -w + (i * 2 * w) / 24, y + sin((i / 24) * TAU * 1.5 + t * 3) * r * 0.022);
    c.stroke();
  } else {
    // « o » : la bouche ronde s'allonge avec l'ouverture.
    c.beginPath();
    c.ellipse(0, y + r * 0.02, r * (0.04 + 0.03 * f.mw!), r * (0.035 + 0.12 * max(0, ouverture)), 0, 0, TAU);
    c.fillStyle = rg(INTERIEUR_BOUCHE, 0.97);
    c.fill();
    c.stroke();
  }
  c.restore();
}

/** Ondes autour de la tête : celles qui entrent (écoute) et celles qui sortent (parole). */
function ondes(c: Ctx, v: Visage, R: number, entrant: number, sortant: number): void {
  const t = v.t;
  c.lineWidth = 1.2;
  c.lineCap = "round";
  if (entrant > 0.02) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.6 + i / 3) % 1;
      c.strokeStyle = rg(v.teinte, sin(PI * ph) * 0.5 * entrant);
      for (let cote = 0; cote < 2; cote++) {
        const a0 = cote ? PI : 0;
        c.beginPath();
        c.arc(0, 0, R * (1.04 - 0.3 * ph), a0 - 0.55, a0 + 0.55);
        c.stroke();
      }
    }
  }
  if (sortant > 0.02) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.55 + i / 3) % 1;
      c.strokeStyle = rg(v.teinte, (1 - ph) * min(1, ph * 7) * 0.55 * sortant);
      for (let cote = 0; cote < 2; cote++) {
        const a0 = cote ? PI : 0;
        c.beginPath();
        c.arc(0, 0, R * (0.82 + 0.34 * ph), a0 - 0.5, a0 + 0.5);
        c.stroke();
      }
    }
  }
}

/** Bulle de pensée : deux petites bulles puis trois points qui montent chacun à leur tour. */
function pensee(c: Ctx, v: Visage, R: number): void {
  const t = v.t;
  const bx = R * 0.84;
  const by = -R * 0.8;
  const a = v.corps.life;
  c.fillStyle = rg(v.trait, 0.5 * a);
  c.beginPath();
  c.arc(R * 0.6, -R * 0.56, R * 0.022, 0, TAU);
  c.fill();
  c.beginPath();
  c.arc(R * 0.69, -R * 0.66, R * 0.034, 0, TAU);
  c.fill();
  capsule(c, bx, by, R * 0.25, R * 0.22);
  c.fillStyle = rg(SOMBRE, 0.85 * a);
  c.fill();
  c.strokeStyle = rg(v.trait, 0.55 * a);
  c.lineWidth = 1;
  c.stroke();
  for (let i = 0; i < 3; i++) {
    const haut = max(0, sin(t * 4.6 - i * 0.95));
    c.fillStyle = rg(v.trait, (0.45 + 0.5 * haut) * a);
    c.beginPath();
    c.arc(bx + (i - 1) * R * 0.125, by - haut * R * 0.04, R * 0.036 * (0.85 + 0.35 * haut), 0, TAU);
    c.fill();
  }
}

function accessoire(c: Ctx, v: Visage, r: number, nom: Accessoire, a: number): void {
  const t = v.t;
  const R = r / 0.78;
  const police = (graisse: number, taille: number) => `${graisse} ${taille.toFixed(1)}px Outfit, sans-serif`;
  c.save();
  c.globalAlpha = a;
  c.lineCap = "round";
  c.textAlign = "center";
  c.textBaseline = "middle";
  switch (nom) {
    case "zzz":
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i * 0.33) % 1;
        c.fillStyle = rg(v.trait, sin(PI * ph) * 0.9);
        c.font = police(600, r * (0.14 + 0.05 * i));
        c.fillText("z", r * (0.58 + 0.12 * i + ph * 0.1), -r * (0.5 + 0.2 * ph + 0.18 * i));
      }
      break;
    case "sweat": {
      const y = -r * 0.32 + ((t * 0.3) % 1) * r * 0.14;
      const x = r * 0.66;
      const z = r * 0.055;
      c.fillStyle = rg(SUEUR, 0.92);
      c.beginPath();
      c.moveTo(x, y - z);
      c.quadraticCurveTo(x + z * 0.9, y + z * 0.2, x, y + z * 0.9);
      c.quadraticCurveTo(x - z * 0.9, y + z * 0.2, x, y - z);
      c.fill();
      break;
    }
    case "tear":
      for (let cote = -1; cote <= 1; cote += 2) {
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.9 + i / 3) % 1;
          c.fillStyle = rg(LARME, (1 - ph) * 0.9);
          c.beginPath();
          c.arc(cote * r * (0.31 + 0.04 * ph), r * (0.1 + 0.5 * ph), r * 0.028 * (1 - ph * 0.3), 0, TAU);
          c.fill();
        }
      }
      break;
    case "anger": {
      const x = -r * 0.62;
      const y = -r * 0.66;
      const taille = r * 0.11 * (1 + 0.15 * sin(t * 8));
      c.strokeStyle = rg(COLERE, 0.97);
      c.lineWidth = r * 0.035;
      for (let i = 0; i < 4; i++) {
        const th = (i * PI) / 2 + PI / 4;
        c.beginPath();
        c.arc(x + cos(th) * taille * 0.6, y + sin(th) * taille * 0.6, taille * 0.5, th + PI - 0.8, th + PI + 0.8);
        c.stroke();
      }
      break;
    }
    case "steam":
      for (let cote = -1; cote <= 1; cote += 2) {
        for (let i = 0; i < 2; i++) {
          const ph = (t * 0.7 + i * 0.5) % 1;
          c.fillStyle = rg(VAPEUR, (1 - ph) * 0.45);
          c.beginPath();
          c.arc(cote * r * 0.62 + sin(t * 3 + i) * r * 0.03, -r * (0.6 + 0.4 * ph), r * (0.05 + 0.07 * ph), 0, TAU);
          c.fill();
        }
      }
      break;
    case "hearts":
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.35 + i / 3) % 1;
        coeur(c, r * (-0.7 + i * 0.7) + sin(t * 1.3 + i * 2) * r * 0.08, -r * (0.5 + 0.55 * ph), r * 0.07 * (0.6 + 0.4 * ph));
        c.fillStyle = rg(COEUR_FLOTTANT, sin(PI * ph) * 0.95);
        c.fill();
      }
      break;
    case "stars":
      for (let i = 0; i < 4; i++) {
        const an = [-2.4, -0.75, 0.55, 2.6][i]!;
        etoile(c, cos(an) * r, sin(an) * r, r * 0.07 * (0.8 + 0.3 * sin(t * 3 + i * 1.7)), t * 0.5 + i);
        c.fillStyle = rg(OR, 0.7 + 0.3 * sin(t * 3 + i));
        c.fill();
      }
      break;
    case "sparkles":
      for (let i = 0; i < 4; i++) {
        const an = [-2.2, -0.9, 0.7, 2.4][i]!;
        const k = 0.5 + 0.5 * sin(t * 2.2 + i * 1.9);
        etincelle(c, cos(an) * r, sin(an) * r, r * (0.05 + 0.08 * k));
        c.fillStyle = rg(v.trait, 0.4 + 0.55 * k);
        c.fill();
      }
      break;
    case "note":
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.4 + i * 0.5) % 1;
        c.fillStyle = rg(v.trait, sin(PI * ph) * 0.95);
        c.font = police(600, r * 0.24);
        c.fillText(i ? "♫" : "♪", r * (0.78 + i * 0.12) + sin(t * 2 + i) * r * 0.04, -r * (0.3 + 0.5 * ph));
      }
      break;
    case "question":
      c.translate(r * 0.66, -r * 0.82);
      c.rotate(sin(t * 2) * 0.18);
      c.fillStyle = rg(v.trait, 0.95);
      c.font = police(700, r * 0.34);
      c.fillText("?", 0, 0);
      break;
    case "exclaim": {
      const gonfle = 1 + 0.18 * max(0, sin(t * 6));
      c.translate(r * 0.7, -r * 0.8);
      c.scale(gonfle, gonfle);
      c.fillStyle = rg(POINT_EXCLAMATION, 0.98);
      c.font = police(800, r * 0.4);
      c.fillText("!", 0, 0);
      break;
    }
    case "bulb": {
      const pulse = 0.8 + 0.2 * sin(t * 5);
      const y = -r * 1.02;
      const lueur = c.createRadialGradient(0, y, 0, 0, y, r * 0.36);
      lueur.addColorStop(0, rg(AMPOULE, 0.5 * pulse));
      lueur.addColorStop(1, rg(AMPOULE, 0));
      c.fillStyle = lueur;
      c.beginPath();
      c.arc(0, y, r * 0.36, 0, TAU);
      c.fill();
      c.strokeStyle = rg(AMPOULE, 0.8 * pulse);
      c.lineWidth = r * 0.02;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const ra = (i * TAU) / 8;
        c.moveTo(cos(ra) * r * 0.2, y + sin(ra) * r * 0.2);
        c.lineTo(cos(ra) * r * 0.3, y + sin(ra) * r * 0.3);
      }
      c.stroke();
      c.fillStyle = rg(OR, 0.98);
      c.beginPath();
      c.arc(0, y, r * 0.13, 0, TAU);
      c.fill();
      c.fillStyle = rg(CULOT, 0.95);
      c.fillRect(-r * 0.05, y + r * 0.11, r * 0.1, r * 0.07);
      break;
    }
    case "gears":
      for (let i = 0; i < 2; i++) {
        const gr = r * (0.11 - i * 0.02);
        c.save();
        c.translate(r * (0.62 + i * 0.26), -r * (0.78 - i * 0.22));
        c.rotate(t * (i ? -1.4 : 1));
        c.fillStyle = rg(v.trait, 0.9);
        c.beginPath();
        for (let q = 0; q < 16; q++) {
          const qa = (q * TAU) / 16;
          const qr = q % 2 ? gr * 0.8 : gr * 1.15;
          point(c, q, cos(qa) * qr, sin(qa) * qr);
        }
        c.closePath();
        c.fill();
        c.fillStyle = rg(TETE, 1);
        c.beginPath();
        c.arc(0, 0, gr * 0.35, 0, TAU);
        c.fill();
        c.restore();
      }
      break;
    case "dots":
      pensee(c, v, R);
      break;
    case "cloud":
      c.fillStyle = rg(SOMBRE, 0.9);
      c.strokeStyle = rg(v.trait, 0.6);
      c.lineWidth = 1;
      for (const [bx, by, br] of [[0.74, -0.84, 0.13], [0.9, -0.88, 0.1], [0.82, -0.96, 0.1]] as const) {
        c.beginPath();
        c.arc(bx * r, by * r, br * r, 0, TAU);
        c.fill();
        c.stroke();
      }
      c.fillStyle = rg(v.trait, 0.6);
      c.beginPath();
      c.arc(r * 0.58, -r * 0.6, r * 0.025, 0, TAU);
      c.fill();
      break;
    case "sunglasses":
      c.fillStyle = rg(VERRES_FONCES, 0.97);
      for (let cote = -1; cote <= 1; cote += 2) {
        c.beginPath();
        if (c.roundRect) c.roundRect(cote * r * 0.31 - r * 0.15, -r * 0.04 - r * 0.1, r * 0.3, r * 0.2, r * 0.07);
        else c.rect(cote * r * 0.31 - r * 0.15, -r * 0.14, r * 0.3, r * 0.2);
        c.fill();
        c.fillStyle = rg(BLANC, 0.25);
        c.fillRect(cote * r * 0.31 - r * 0.1, -r * 0.1, r * 0.06, r * 0.025);
        c.fillStyle = rg(VERRES_FONCES, 0.97);
      }
      c.fillRect(-r * 0.16, -r * 0.1, r * 0.32, r * 0.03);
      break;
    case "glasses":
      c.strokeStyle = rg(v.trait, 0.85);
      c.lineWidth = r * 0.03;
      for (let cote = -1; cote <= 1; cote += 2) {
        c.beginPath();
        c.arc(cote * r * 0.31, -r * 0.04, r * 0.18, 0, TAU);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(-r * 0.13, -r * 0.05);
      c.lineTo(r * 0.13, -r * 0.05);
      c.stroke();
      break;
    case "cold":
      for (let i = 0; i < 3; i++) {
        for (let cote = -1; cote <= 1; cote += 2) {
          c.strokeStyle = rg(FROID, 0.5 + 0.5 * sin(t * 20 + i * 2 + cote));
          c.lineWidth = r * 0.025;
          c.beginPath();
          c.moveTo(cote * r * (0.78 + i * 0.05), -r * 0.1 + i * r * 0.12);
          c.lineTo(cote * r * (0.78 + i * 0.05), r * 0.02 + i * r * 0.12);
          c.stroke();
        }
      }
      break;
    case "gloom":
      for (let i = -1; i <= 1; i++) {
        c.strokeStyle = rg(MORNE, 0.7);
        c.lineWidth = r * 0.03;
        c.beginPath();
        c.moveTo(i * r * 0.16, -r * 0.62);
        c.lineTo(i * r * 0.16, -r * 0.4 - (i === 0 ? 0.04 : 0) * r);
        c.stroke();
      }
      break;
    case "ear":
      ondes(c, v, R, 1, 0);
      break;
    case "sound":
      ondes(c, v, R, 0, 1);
      break;
    case "check": {
      const gonfle = 1 + 0.2 * max(0, sin(t * 4));
      c.translate(r * 0.72, -r * 0.7);
      c.scale(gonfle, gonfle);
      c.strokeStyle = rg(VALIDE, 0.98);
      c.lineWidth = r * 0.06;
      c.beginPath();
      c.moveTo(-r * 0.1, 0);
      c.lineTo(-r * 0.02, r * 0.08);
      c.lineTo(r * 0.12, -r * 0.1);
      c.stroke();
      break;
    }
  }
  c.restore();
}

/** La tête : verre, joues, yeux, sourcils, bouche, accessoires. `R` = rayon de l'élément. */
function tete(c: Ctx, v: Visage, R: number): void {
  const f = v.x;
  const r = R * 0.78;
  const clin = paupiere(v);
  const ouverture = f.eo! * (1 - 0.93 * clin);
  const fonduOeil = v.reduit ? 1 : min(1, (v.age - v.oeilT) / 0.22);
  const fonduBouche = v.reduit ? 1 : min(1, (v.age - v.boucheT) / 0.2);
  const [dx, dy, rot, ex, ey] = v.pose;
  c.save();
  c.translate(dx * r, dy * r);
  c.rotate(rot);
  c.scale(ex, ey);
  verre(c, v, r);
  if (f.cb! > 0.02) {
    for (let s = -1; s <= 1; s += 2) {
      const g = c.createRadialGradient(s * r * 0.45, r * 0.16, 0, s * r * 0.45, r * 0.16, r * 0.17);
      g.addColorStop(0, rg(JOUE, min(0.7, 0.7 * f.cb!)));
      g.addColorStop(1, rg(JOUE, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(s * r * 0.45, r * 0.16, r * 0.17, 0, TAU);
      c.fill();
    }
  }
  for (let s = -1; s <= 1; s += 2) {
    const cote = s < 0 ? 0 : 1;
    if (fonduOeil < 1) oeil(c, v, r, s, v.oeilPrec[cote]!, 1 - fonduOeil, ouverture);
    oeil(c, v, r, s, v.oeilActuel[cote]!, fonduOeil < 1 ? fonduOeil : 1, ouverture);
    sourcil(c, v, r, s);
  }
  const ouvBouche = max(0, min(1.2, f.mo! + ouvertureAjoutee(v)));
  if (fonduBouche < 1) bouche(c, v, r, v.bouchePrec, 1 - fonduBouche, ouvBouche);
  bouche(c, v, r, v.boucheActuelle, fonduBouche < 1 ? fonduBouche : 1, ouvBouche);
  for (const [nom, a] of Object.entries(v.fa)) if (a > 0.02) accessoire(c, v, r, nom as Accessoire, a);
  c.restore();
}

function halo(c: Ctx, v: Visage, R: number): void {
  const { corps: p, teinte } = v;
  const g = c.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.25);
  g.addColorStop(0, rg(teinte, 0.24 * p.glow * p.life));
  g.addColorStop(0.55, rg(teinte, 0.07 * p.glow * p.life));
  g.addColorStop(1, rg(teinte, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, R * 1.25, 0, TAU);
  c.fill();
}

/** Le faisceau vers l'app consultée, avec deux comètes qui le parcourent. */
function faisceau(c: Ctx, v: Visage, R: number): void {
  const b = v.corps.beam;
  if (b <= 0.01) return;
  const { t, teinte, trait } = v;
  c.save();
  c.rotate(v.aim);
  const ligne = c.createLinearGradient(R * 0.28, 0, R * 1.15, 0);
  ligne.addColorStop(0, rg(trait, 0));
  ligne.addColorStop(0.4, rg(trait, 0.5 * b));
  ligne.addColorStop(1, rg(trait, 0));
  c.strokeStyle = ligne;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(R * 0.28, 0);
  c.lineTo(R * 1.15, 0);
  c.stroke();
  const lueur = c.createLinearGradient(R * 0.28, 0, R * 1.15, 0);
  lueur.addColorStop(0, rg(teinte, 0));
  lueur.addColorStop(0.5, rg(teinte, 0.13 * b));
  lueur.addColorStop(1, rg(teinte, 0));
  c.fillStyle = lueur;
  c.beginPath();
  c.moveTo(R * 0.28, -2);
  c.lineTo(R * 1.15, -R * 0.08);
  c.lineTo(R * 1.15, R * 0.08);
  c.lineTo(R * 0.28, 2);
  c.closePath();
  c.fill();
  for (let i = 0; i < 2; i++) {
    const ph = (t * 0.8 + i * 0.5) % 1;
    const x = R * (0.3 + 0.85 * ph);
    const a = sin(PI * ph) * b;
    const queue = c.createLinearGradient(x - R * 0.2, 0, x, 0);
    queue.addColorStop(0, rg(trait, 0));
    queue.addColorStop(1, rg(trait, 0.8 * a));
    c.strokeStyle = queue;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - R * 0.2, 0);
    c.lineTo(x, 0);
    c.stroke();
    const tete = c.createRadialGradient(x, 0, 0, x, 0, R * 0.07);
    tete.addColorStop(0, rg(trait, 0.95 * a));
    tete.addColorStop(1, rg(trait, 0));
    c.fillStyle = tete;
    c.beginPath();
    c.arc(x, 0, R * 0.07, 0, TAU);
    c.fill();
  }
  c.restore();
}

/**
 * Dessine une image. `largeur` = largeur CSS de l'élément ; le canvas fait 230 % de cette largeur
 * (le halo et les accessoires débordent de la sphère), multipliée par `dpr` en pixels.
 */
export function dessiner(c: Ctx, largeur: number, dpr: number, v: Visage): void {
  const R = largeur / 2;
  const cote = largeur * 2.3;
  v.teinte = [v.x.kr!, v.x.kg!, v.x.kb!];
  v.trait = melange(PLATINE, v.teinte, 0.16);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, cote, cote);
  c.translate(cote / 2, cote / 2);
  halo(c, v, R);
  tete(c, v, R);
  faisceau(c, v, R);
}
