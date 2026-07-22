import type { CSSProperties } from "react";
import type { HubSummary } from "@mokarade/hub-contract";
import type { SummaryResult } from "@/lib/fetchSummary";
import { statusBadge } from "@/lib/status";
import { safeHttpUrl } from "@/lib/url";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { MetricList } from "./MetricList";
import { AlertList } from "./AlertList";
import { ActionList } from "./ActionList";

/** Taille bento : dérivée de la richesse du contenu, jamais uniforme. */
function sizeClass(result: SummaryResult): string {
  if (result.state !== "ok") return "widget--sm";
  const n = result.summary.metrics.length;
  if (n >= 4) return "widget--lg";
  if (n >= 1) return "widget--md";
  return "widget--sm";
}

function OkBody({ summary }: { summary: HubSummary }) {
  const empty =
    summary.metrics.length === 0 &&
    summary.alerts.length === 0 &&
    summary.actions.length === 0;
  return (
    <>
      <MetricList metrics={summary.metrics} />
      <AlertList alerts={summary.alerts} />
      <ActionList actions={summary.actions} />
      {empty && <p className="widget__empty">Aucune donnée à afficher pour l’instant.</p>}
    </>
  );
}

function ProblemBody({ result }: { result: SummaryResult }) {
  const message = (() => {
    switch (result.state) {
      case "unconfigured":
        return "Aucun jeton x-hub-token configuré pour cette app.";
      case "unauthorized":
        return "Jeton refusé (401). Vérifie la valeur de x-hub-token.";
      case "unreachable":
        return `App injoignable — ${result.detail}.`;
      case "invalid":
        return `Réponse non conforme au contrat — ${result.detail}.`;
      default:
        return "";
    }
  })();
  return <p className="widget__problem">{message}</p>;
}

/** « il y a 3 min » / « il y a 40 s » — âge lisible d'un résumé servi depuis le cache. */
function humanAge(ms: number): string {
  const min = Math.round(ms / 60000);
  return min >= 1 ? `il y a ${min} min` : `il y a ${Math.max(1, Math.round(ms / 1000))} s`;
}

function Footer({ summary, cachedAgeMs }: { summary: HubSummary; cachedAgeMs?: number }) {
  return (
    <footer className="widget__foot">
      {cachedAgeMs !== undefined ? (
        <span title="L’app n’a pas répondu à temps : dernier résumé connu.">
          En cache · {humanAge(cachedAgeMs)}
        </span>
      ) : (
        <span>Généré {formatDateTime(summary.generatedAt)}</span>
      )}
      {summary.dataAsOf && <span>Données du {formatDateTime(summary.dataAsOf)}</span>}
    </footer>
  );
}

export function AppWidget({
  result,
  index = 0,
}: {
  result: SummaryResult;
  /** Position dans la grille — pilote le délai de l'animation d'entrée en cascade. */
  index?: number;
}) {
  const badge = statusBadge(result);
  const name = result.state === "ok" ? result.summary.app.name : result.source.name;
  const accent = result.state === "ok" ? result.summary.app.color : undefined;
  const appUrl = result.state === "ok" ? safeHttpUrl(result.summary.app.url) : null;
  const style = {
    ...(accent ? { "--accent": accent } : null),
    "--enter-delay": `${index * 70}ms`,
  } as CSSProperties;

  return (
    <article className={`widget ${sizeClass(result)}`} style={style}>
      <header className="widget__head">
        <h2 className="widget__title">
          {appUrl ? (
            <a href={appUrl} target="_blank" rel="noreferrer noopener">
              {name}
            </a>
          ) : (
            name
          )}
        </h2>
        <StatusBadge {...badge} />
      </header>
      <div className="widget__body">
        {result.state === "ok" ? (
          <OkBody summary={result.summary} />
        ) : (
          <ProblemBody result={result} />
        )}
      </div>
      {result.state === "ok" && (
        <Footer summary={result.summary} cachedAgeMs={result.stale ? result.cachedAgeMs : undefined} />
      )}
    </article>
  );
}
