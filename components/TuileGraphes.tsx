// components/TuileGraphes.tsx — l'entrée de l'accueil vers /graphes.
//
// Marc, 21/10/2026 : « il me faut un accès depuis hubperso ». La page n'était atteignable que par
// la palette de commandes. Cette tuile n'est rendue QUE pour le propriétaire (voir `app/page.tsx`) :
// les graphes décrivent la structure de dépôts privés. Elle ne lit rien — pas d'appel GitHub à
// chaque ouverture de l'accueil — et ne promet donc pas un graphe : l'état réel est sur la page.

import Link from "next/link";
import { ConstellationSvg } from "@/components/ConstellationSvg";

export function TuileGraphes({ nombre }: { nombre: number }) {
  return (
    <Link href="/graphes" className="tuile-graphes" aria-label="Ouvrir les graphes de code">
      <ConstellationSvg nom="graphes" />
      <span className="tuile-graphes__texte">
        <span className="tuile-graphes__titre">Graphes de code</span>
        <span className="tuile-graphes__meta">{nombre} dépôts</span>
      </span>
    </Link>
  );
}
