// components/LogoApp.tsx — le logo de chaque app (série A), dessiné pour être l'animation.
//
// Marc, 21/10/2026 : « je veux que ce soit le logo lui-même qui porte l'animation, la couleur » ;
// 22/10 : série A choisie (FinanceAI = pièce au dollar, CarAI = voiture, JobAI = loupe, BatchChef =
// marmite, DriveAI = arborescence, MemoryAI = strates). Chaque logo est un dessin sur une grille de
// 64, en `currentColor` : la couleur vient de l'état (feuille de style `.astre[data-etat]`), et
// chaque partie porte sa classe pour bouger à sa façon. L'étincelle (`logo__ia`) est la signature
// IA commune à tous. Aucune couleur écrite ici (verrou `tests/theme.test.ts`).
//
// Les parties : `corps` (un contour), `masse` (un aplat léger), `plein` (un aplat), `roue` (un
// cercle plein de la couleur du fond), `ia` (l'étincelle). En panne, en construction ou non
// branchée, les aplats deviennent des contours en tirets : l'état se lit à la forme.
// Les dessins viennent de la série A (`logos/serie-a/gen2_glyphs.py`, dossier partagé du projet).

import type { CSSProperties, ReactNode } from "react";
import type { IdAvecLogo } from "@/lib/logos";

/** Le rang d'une partie qui s'anime en cascade (`--i`, lu par la feuille de style). */
const rang = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties;

const DOSSIERS = [6.5, 24.5, 42.5];

const DESSINS: Record<IdAvecLogo, ReactNode> = {
  // Une pièce, un dollar dedans, l'étincelle sur le bord.
  financeai: (
    <>
      <circle className="logo__masse" cx="30" cy="34" r="22" />
      <circle className="logo__corps" cx="30" cy="34" r="22" />
      <path
        className="logo__corps logo__dollar"
        d="M38 28C38 24.5 34.5 23 30 23C25.5 23 22 25 22 28.5C22 32.5 25.5 33.5 30 34C34.5 34.5 38 35.5 38 39.5C38 43 34.5 45 30 45C25.5 45 22 43.5 22 40M30 17.5V23M30 45V50.5"
      />
      <path className="logo__ia" d="M49 5.5Q50.52 13.48 58.5 15Q50.52 16.52 49 24.5Q47.48 16.52 39.5 15Q47.48 13.48 49 5.5Z" />
    </>
  ),
  // Une voiture de profil, l'éclair dedans.
  carai: (
    <>
      <path
        className="logo__masse"
        d="M7 41Q7 35 12.5 34L18 27Q20 24 24 24H38Q41.5 24 44 26.5L49.5 33Q57 34 57 40.5V44Q57 46.5 54.5 46.5H9.5Q7 46.5 7 44Z"
      />
      <path
        className="logo__corps"
        d="M7 41Q7 35 12.5 34L18 27Q20 24 24 24H38Q41.5 24 44 26.5L49.5 33Q57 34 57 40.5V44Q57 46.5 54.5 46.5H9.5Q7 46.5 7 44Z"
      />
      <path className="logo__plein logo__eclair" d="M33.5 28.5L26.5 38.5H31.5L29.5 46L37.5 35.5H32.5Z" />
      <circle className="logo__roue" cx="19" cy="46.5" r="6.4" />
      <circle className="logo__roue" cx="46" cy="46.5" r="6.4" />
      <path className="logo__ia" d="M50 4Q51.44 11.56 59 13Q51.44 14.44 50 22Q48.56 14.44 41 13Q48.56 11.56 50 4Z" />
    </>
  ),
  // Une loupe : l'étincelle dans la lentille, c'est l'offre qui colle.
  jobai: (
    <g className="logo__balaie">
      <circle className="logo__masse" cx="27" cy="27" r="18" />
      <circle className="logo__corps" cx="27" cy="27" r="18" />
      <path className="logo__corps logo__gros" d="M40.5 40.5L55 55" />
      <path className="logo__ia" d="M27 16.5Q28.68 25.32 37.5 27Q28.68 28.68 27 37.5Q25.32 28.68 16.5 27Q25.32 25.32 27 16.5Z" />
    </g>
  ),
  // Une marmite : le couvercle bouge, l'étincelle monte comme la vapeur.
  batchchef: (
    <>
      <path className="logo__masse" d="M12 30H52V42Q52 54 40 54H24Q12 54 12 42Z" />
      <path className="logo__corps" d="M12 30H52V42Q52 54 40 54H24Q12 54 12 42Z" />
      <path className="logo__corps" d="M12 37H6M52 37H58" />
      <g className="logo__couvercle">
        <path className="logo__corps" d="M15 30Q15 21 32 21Q49 21 49 30" />
        <circle className="logo__plein" cx="32" cy="16.5" r="3" />
      </g>
      <path className="logo__ia logo__vapeur" d="M49 3.5Q50.36 10.64 57.5 12Q50.36 13.36 49 20.5Q47.64 13.36 40.5 12Q47.64 10.64 49 3.5Z" />
    </>
  ),
  // Une arborescence : l'étincelle en racine, trois dossiers classés dessous.
  driveai: (
    <>
      <path className="logo__corps logo__flux" d="M32 20V29M14 29H50M14 29V36M32 29V36M50 29V36" />
      {DOSSIERS.map((x, i) => (
        <g key={x} className="logo__dossier" style={rang(i)}>
          <rect className="logo__masse" x={x} y="36" width="15" height="17" rx="4" />
          <rect className="logo__corps" x={x} y="36" width="15" height="17" rx="4" />
        </g>
      ))}
      <path className="logo__ia" d="M32 2.5Q33.52 10.48 41.5 12Q33.52 13.52 32 21.5Q30.48 13.52 22.5 12Q30.48 10.48 32 2.5Z" />
    </>
  ),
  // Trois strates de faits, l'étincelle sur la plus récente.
  memoryai: (
    <>
      <g className="logo__strate" style={rang(2)}>
        <path className="logo__corps" d="M7 42L32 55L57 42" />
      </g>
      <g className="logo__strate" style={rang(1)}>
        <path className="logo__corps" d="M7 32L32 45L57 32" />
      </g>
      <g className="logo__strate" style={rang(0)}>
        <path className="logo__masse" d="M32 9L57 22L32 35L7 22Z" />
        <path className="logo__corps" d="M32 9L57 22L32 35L7 22Z" />
        <path className="logo__ia" d="M32 14Q33.28 20.72 40 22Q33.28 23.28 32 30Q30.72 23.28 24 22Q30.72 20.72 32 14Z" />
      </g>
    </>
  ),
};

/** Le logo d'une app qui en a un. `currentColor` : la couleur est celle de l'état (CSS). */
export function LogoApp({ id }: { id: IdAvecLogo }) {
  return (
    <svg className="logo" data-logo={id} viewBox="0 0 64 64" aria-hidden focusable="false">
      {DESSINS[id]}
    </svg>
  );
}
