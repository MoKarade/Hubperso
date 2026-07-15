import type { HubAlert } from "@mokarade/hub-contract";
import { severityTone } from "@/lib/status";
import { safeHttpUrl } from "@/lib/url";

function AlertRow({ alert }: { alert: HubAlert }) {
  const tone = severityTone(alert.severity);
  const href = safeHttpUrl(alert.href);
  const content = (
    <>
      <span className={`alert__dot alert__dot--${tone}`} aria-hidden="true" />
      <span className="alert__label">{alert.label}</span>
    </>
  );
  return (
    <li className="alert">
      {href ? (
        <a className="alert__link" href={href} target="_blank" rel="noreferrer noopener">
          {content}
        </a>
      ) : (
        content
      )}
    </li>
  );
}

export function AlertList({ alerts }: { alerts: HubAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="alerts">
      {alerts.map((alert, i) => (
        <AlertRow key={`${alert.label}-${i}`} alert={alert} />
      ))}
    </ul>
  );
}
