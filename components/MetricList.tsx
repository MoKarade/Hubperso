import type { HubMetric } from "@mokarade/hub-contract";
import { formatMetricValue, formatTrend } from "@/lib/format";
import { severityTone } from "@/lib/status";

function Metric({ metric, hero }: { metric: HubMetric; hero?: boolean }) {
  const tone = metric.severity ? severityTone(metric.severity) : null;
  const trendTone =
    metric.trend === undefined ? null : metric.trend >= 0 ? "up" : "down";
  return (
    <div className={hero ? "metric metric--hero" : "metric"}>
      <span className="metric__label">{metric.label}</span>
      <span className="metric__value" data-tone={tone ?? undefined}>
        {formatMetricValue(metric)}
      </span>
      {metric.trend !== undefined && (
        <span className="metric__trend" data-dir={trendTone ?? undefined}>
          {formatTrend(metric.trend)}
        </span>
      )}
    </div>
  );
}

export function MetricList({ metrics }: { metrics: HubMetric[] }) {
  if (metrics.length === 0) return null;
  const [first, ...rest] = metrics;
  return (
    <div className="metrics">
      {first && <Metric metric={first} hero />}
      {rest.length > 0 && (
        <div className="metrics__grid">
          {rest.map((metric, i) => (
            <Metric key={`${metric.label}-${i}`} metric={metric} />
          ))}
        </div>
      )}
    </div>
  );
}
