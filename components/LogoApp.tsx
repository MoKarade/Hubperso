// components/LogoApp.tsx — le logo de chaque app, dessiné pour être l'animation.
//
// Marc, 21/10/2026 : « je veux que ce soit le logo lui-même qui porte l'animation, la couleur ».
// Chaque logo est repris du `icon.svg` de son app, SANS le carré de fond, en `currentColor` :
// la couleur vient de l'état (feuille de style `.astre[data-etat]`), et chaque partie du dessin
// porte sa classe pour bouger à sa façon (l'éclair de CarAI se charge, le curseur de JobAI
// clignote, la vapeur de BatchChef monte…). Aucune couleur écrite ici (verrou `tests/theme.test.ts`).
//
// Deux sortes de parties : `logo__plein` (un aplat : plein quand l'app est à jour, contour en
// pointillé quand elle est en panne, en construction ou non branchée) et `logo__trait` (un
// tracé). Les contours utilisent `vector-effect: non-scaling-stroke` : un trait de 1,25 px reste
// de 1,25 px quelle que soit la taille du dessin.
//
// Les originaux : voir `lib/logos.ts`. Le monogramme de FinanceAI est un texte (« Fi », police
// Arial) dans son `icon.svg` : refait ici en tracé, car une police ne s'anime pas.

import type { CSSProperties, ReactNode } from "react";
import type { IdAvecLogo } from "@/lib/logos";

interface Dessin {
  viewBox: string;
  corps: ReactNode;
}

const k = (n: number): CSSProperties => ({ "--k": n }) as CSSProperties;

const DESSINS: Record<IdAvecLogo, Dessin> = {
  // Une prise de recharge : un cercle et un éclair.
  carai: {
    viewBox: "5 5 22 22",
    corps: (
      <>
        <circle className="logo__trait logo__cercle" cx="16" cy="16" r="9.5" strokeWidth="2.4" />
        <circle className="logo__trait logo__arc" cx="16" cy="16" r="9.5" strokeWidth="2.4" pathLength="100" />
        <path
          className="logo__plein logo__eclair"
          d="M17.4 9.6 L11.6 17.2 H15.4 L14.6 22.4 L20.4 14.8 H16.6 Z"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  // Une invite de terminal : `>_`. Le souligné est le curseur.
  jobai: {
    viewBox: "6 6 20 20",
    corps: (
      <>
        <path className="logo__trait logo__chevron" d="M9 10.5 L14.5 16 L9 21.5" strokeWidth="3" />
        <path className="logo__trait logo__curseur" d="M18.5 22.5 L24 22.5" strokeWidth="3" />
      </>
    ),
  },
  // Une marmite et trois volutes de vapeur.
  batchchef: {
    viewBox: "64 40 384 384",
    corps: (
      <>
        <path className="logo__trait logo__vapeur" style={k(0)} d="M198 152c-20-18-20-38 0-56" strokeWidth="16" />
        <path className="logo__trait logo__vapeur" style={k(1)} d="M256 152c-20-18-20-38 0-56" strokeWidth="16" />
        <path className="logo__trait logo__vapeur" style={k(2)} d="M314 152c-20-18-20-38 0-56" strokeWidth="16" />
        <g className="logo__marmite">
          <circle className="logo__plein" cx="256" cy="196" r="20" />
          <rect className="logo__plein" x="122" y="212" width="268" height="40" rx="20" />
          <rect className="logo__plein" x="84" y="286" width="62" height="40" rx="20" />
          <rect className="logo__plein" x="366" y="286" width="62" height="40" rx="20" />
          <path className="logo__plein" d="M138 262h236v60a46 46 0 0 1-46 46H184a46 46 0 0 1-46-46z" />
        </g>
      </>
    ),
  },
  // Les lettres A et D.
  driveai: {
    viewBox: "70 64 384 384",
    corps: (
      <>
        <path
          className="logo__plein logo__lettre"
          style={k(0)}
          d="M128 336l64-160h32l64 160h-34l-14-38h-64l-14 38h-34zm74-66h44l-22-60-22 60z"
        />
        <path
          className="logo__plein logo__lettre"
          style={k(1)}
          d="M296 176h56c53 0 88 32 88 80s-35 80-88 80h-56V176zm32 30v100h24c33 0 56-19 56-50s-23-50-56-50h-24z"
          transform="translate(-24 0)"
        />
      </>
    ),
  },
  // Le monogramme « Fi » : une barre haute, une barre moyenne, un i.
  financeai: {
    viewBox: "5 5 22 22",
    corps: (
      <>
        <path className="logo__trait logo__barre" style={k(0)} d="M10 24V8.5h9" strokeWidth="3" />
        <path className="logo__trait logo__barre" style={k(1)} d="M10 16h6.5" strokeWidth="3" />
        <path className="logo__trait logo__barre" style={k(2)} d="M23 24V13.5" strokeWidth="3" />
        <path className="logo__trait logo__point" d="M23 8.5h.01" strokeWidth="3.4" />
      </>
    ),
  },
};

/** Le logo d'une app qui en a un. `currentColor` : la couleur est celle de l'état (CSS). */
export function LogoApp({ id }: { id: IdAvecLogo }) {
  const { viewBox, corps } = DESSINS[id];
  return (
    <svg className="logo" data-logo={id} viewBox={viewBox} aria-hidden focusable="false">
      {corps}
    </svg>
  );
}

/** Le logo du hub lui-même : quatre tuiles (le tableau de bord), reprises de `app/icon.svg`. */
export function LogoHub() {
  return (
    <svg className="logo-hub" viewBox="88 88 336 336" aria-hidden focusable="false">
      <rect className="logo-hub__tuile logo-hub__tuile--1" x="104" y="104" width="176" height="176" rx="30" />
      <rect className="logo-hub__tuile logo-hub__tuile--2" x="300" y="104" width="108" height="80" rx="24" />
      <rect className="logo-hub__tuile logo-hub__tuile--3" x="300" y="200" width="108" height="80" rx="24" />
      <rect className="logo-hub__tuile logo-hub__tuile--4" x="104" y="300" width="304" height="104" rx="30" />
    </svg>
  );
}
