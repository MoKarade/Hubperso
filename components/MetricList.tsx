import type { SecondaireCarte } from "@/lib/carte";
import { formatMetricValue, formatTrend } from "@/lib/format";
import { severityTone } from "@/lib/status";
import { Icone } from "./Icone";
import { iconeTendance } from "@/lib/icones";
import { Sparkline } from "./Sparkline";

// Les métriques SECONDAIRES seulement. La première publiée est traitée à part, en héros
// (`AppWidget`), avec sa courbe et sa variation — c'est le choix de l'app qui décide, pas
// une élection à l'exécution. Ce composant ne rend donc plus de « premier » particulier :
// s'il en faisait un, deux endroits se disputeraient la même décision.
//
// ⚠️ IL REÇOIT LA SÉRIE, IL NE LA CHERCHE PAS. `etatCarte` la compose (PUR, testé) ; ici on
// peint. Aller chercher l'historique depuis le composant mettrait la décision « quelle
// courbe sous quelle métrique » hors de portée des tests, qui tournent sans rendu.

function Metric({ secondaire }: { secondaire: SecondaireCarte }) {
  const { metrique, serie } = secondaire;
  const tone = metrique.severity ? severityTone(metrique.severity) : null;
  return (
    <div className="metric">
      <span className="metric__label">{metrique.label}</span>
      <span className="metric__value" data-tone={tone ?? undefined}>
        {formatMetricValue(metrique)}
      </span>
      {metrique.trend !== undefined && (
        <span className="metric__trend" data-dir={metrique.trend >= 0 ? "up" : "down"}>
          {/* L'icône DOUBLE le signe, elle ne le remplace pas : « +9,2 % » reste écrit. Une
              flèche seule perdrait l'ampleur, et c'est l'ampleur qui décide si on agit. */}
          <Icone nom={iconeTendance(metrique.trend)} />
          {formatTrend(metrique.trend)}
        </span>
      )}
      {/* Vide quand la mémoire est trop jeune : `Sparkline` rend `null` sous deux points
          plutôt qu'un trait plat, qui affirmerait une stabilité jamais observée. */}
      {serie.length > 0 && (
        <span className="metric__courbe">
          <Sparkline points={serie} label={metrique.label} />
        </span>
      )}
    </div>
  );
}

export function MetricList({ metrics }: { metrics: SecondaireCarte[] }) {
  if (metrics.length === 0) return null;
  return (
    <div className="metrics__grid">
      {metrics.map((secondaire, i) => (
        <Metric key={`${secondaire.metrique.label}-${i}`} secondaire={secondaire} />
      ))}
    </div>
  );
}
