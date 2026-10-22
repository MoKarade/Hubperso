// components/Sparkline.tsx — la courbe d'une métrique, en SVG inline.
//
// Aucune librairie de graphes, et ce n'est pas de l'ascétisme : la CSP du hub est ENFORCÉE
// avec `default-src 'self'` — un script de CDN ne se chargerait tout simplement pas. Le tracé
// est calculé côté serveur (`traceSparkline`, PUR) et rendu en un `<path>`. Zéro JavaScript
// client, zéro dépendance, et ça marche avant l'hydratation.
//
// `preserveAspectRatio="none"` : la courbe s'étire à la largeur de la carte. Les proportions
// n'ont aucun sens ici — on lit une FORME (ça monte, ça stagne), pas des valeurs. Les
// valeurs, elles, sont écrites en toutes lettres à côté.

import { traceSparkline } from "@/lib/carte";
import type { Point } from "@/lib/historique";

export function Sparkline({ points, label }: { points: Point[]; label: string }) {
  const d = traceSparkline(points);
  // Moins de deux points : rien à tracer. Un trait plat affirmerait une stabilité qu'on n'a
  // pas observée — la carte écrit « pas encore d'historique » à la place.
  if (!d) return null;

  return (
    <svg
      className="sparkline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Évolution de ${label} sur les relevés conservés`}
    >
      {/* L'aire sous la courbe (maquette du 22/10) : la même série, fermée vers le bas. Elle ne
          dit rien de plus que le trait — elle le rend lisible d'un coup d'œil. */}
      <path className="sparkline__zone" d={`${d} L100,100 L0,100 Z`} />
      <path className="sparkline__trace" d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
