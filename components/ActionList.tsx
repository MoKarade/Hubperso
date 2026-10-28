import type { HubAction } from "@mokarade/hub-contract";
import { safeHttpUrl } from "@/lib/url";
import { attributsLien } from "@/lib/lienApp";
import { BoutonTrigger } from "./BoutonTrigger";

// Deux sortes d'actions, deux rendus qui n'ont rien à voir :
//
//   `link`    → une ancre. C'est le NAVIGATEUR qui part, sans jeton, comme n'importe quel lien.
//   `trigger` → un bouton qui POSTe côté SERVEUR, avec le jeton de l'app (`lib/declencher.ts`).
//
// Un `trigger` n'est jamais rendu comme un lien : ouvrir en GET un endpoint fait pour un POST
// ne déclenche rien et laisse croire le contraire. Un href non http(s) n'est rendu ni en lien
// ni en bouton — `safeHttpUrl` d'abord, toujours.
function Action({ action, appId }: { action: HubAction; appId: string }) {
  const href = safeHttpUrl(action.href);
  if (!href) {
    return (
      <span className="action action--disabled" aria-disabled="true" title="Lien non conforme">
        {action.label}
      </span>
    );
  }

  if (action.kind === "trigger") {
    return <BoutonTrigger action={action} appId={appId} />;
  }

  return (
    <a className="action" href={href} {...attributsLien(href)}>
      {action.label}
      <span className="action__arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}

export function ActionList({ actions, appId }: { actions: HubAction[]; appId: string }) {
  if (actions.length === 0) return null;
  return (
    <div className="actions">
      {actions.map((action, i) => (
        <Action key={`${action.label}-${i}`} action={action} appId={appId} />
      ))}
    </div>
  );
}
