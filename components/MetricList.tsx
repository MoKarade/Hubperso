import type { HubMetric } from "@mokarade/hub-contract";
import { formatMetricValue, formatTrend } from "@/lib/format";
import { severityTone } from "@/lib/status";

// Les métriques SECONDAIRES seulement. La première publiée est traitée à part, en héros
// (`AppWidget`), avec sa courbe et sa variation — c'est le choix de l'app qui décide, pas
// une élection à l'exécution. Ce composant ne rend donc plus de « premier » particulier :
// s'il en faisait un, deux endroits se disputeraient la même décision.

function Metric({ metric }: { metric: HubMetric }) {
  const tone = metric.severity ? severityTone(metric.severity) : null;
  return (
    <div className="metric">
      <span className="metric__label">{metric.label}</span>
      <span className="metric__value" data-tone={tone ?? undefined}>
        {formatMetricValue(metric)}
      </span>
      {metric.trend !== undefined && (
        <span className="metric__trend" data-dir={metric.trend >= 0 ? "up" : "down"}>
          {formatTrend(metric.trend)}
        </span>
      )}
    </div>
  );
}

export function MetricList({ metrics }: { metrics: HubMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <div className="metrics__grid">
      {metrics.map((metric, i) => (
        <Metric key={`${metric.label}-${i}`} metric={metric} />
      ))}
    </div>
  );
}
