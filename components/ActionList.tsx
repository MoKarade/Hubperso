import type { HubAction } from "@mokarade/hub-contract";
import { safeHttpUrl } from "@/lib/url";

// v1 : seul `kind: "link"` est cliquable. `trigger` (webhook POST) est réservé v2 —
// on l'affiche désactivé plutôt que de l'ignorer, pour signaler qu'il existe.
function Action({ action }: { action: HubAction }) {
  const href = safeHttpUrl(action.href);
  if (action.kind === "link" && href) {
    return (
      <a className="action" href={href} target="_blank" rel="noreferrer noopener">
        {action.label}
        <span className="action__arrow" aria-hidden="true">
          ↗
        </span>
      </a>
    );
  }
  return (
    <span className="action action--disabled" aria-disabled="true" title="Bientôt disponible">
      {action.label}
    </span>
  );
}

export function ActionList({ actions }: { actions: HubAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="actions">
      {actions.map((action, i) => (
        <Action key={`${action.label}-${i}`} action={action} />
      ))}
    </div>
  );
}
