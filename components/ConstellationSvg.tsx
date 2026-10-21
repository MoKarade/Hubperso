// components/ConstellationSvg.tsx — le dessin animé d'une carte de /graphes et de la tuile d'accueil.
//
// Décoratif (`aria-hidden`) : le nom du dépôt reste écrit à côté. Aucune couleur ici — le SVG
// prend `currentColor` et ses animations vivent dans `app/globals.css` (coupées par
// `prefers-reduced-motion`).

import { dessinDepot } from "@/lib/dessinDepot";

export function ConstellationSvg({ nom }: { nom: string }) {
  const c = dessinDepot(nom);
  return (
    <svg
      className="constellation"
      viewBox={`0 0 ${c.largeur} ${c.hauteur}`}
      aria-hidden
      focusable="false"
    >
      {c.liens.map(([a, b], i) => (
        <line
          key={`l${i}`}
          className="constellation__lien"
          style={{ "--n": i } as React.CSSProperties}
          x1={c.points[a]!.x}
          y1={c.points[a]!.y}
          x2={c.points[b]!.x}
          y2={c.points[b]!.y}
        />
      ))}
      {c.points.map((p, i) => (
        <circle
          key={`p${i}`}
          className="constellation__point"
          style={{ "--n": i } as React.CSSProperties}
          cx={p.x}
          cy={p.y}
          r={p.r}
        />
      ))}
    </svg>
  );
}
