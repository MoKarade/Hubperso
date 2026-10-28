import type { HubAlert } from "@mokarade/hub-contract";
import { severityTone } from "@/lib/status";
import { safeHttpUrl } from "@/lib/url";
import { attributsLien } from "@/lib/lienApp";
import { Icone } from "./Icone";
import { iconeSeverite } from "@/lib/icones";

function AlertRow({ alert }: { alert: HubAlert }) {
  const tone = severityTone(alert.severity);
  const href = safeHttpUrl(alert.href);
  const icone = iconeSeverite(alert.severity);
  // ⚠️ L'icône REMPLACE la pastille quand la gravité en a une, elle ne s'y ajoute pas : deux
  // marqueurs côte à côte pour la même information font une colonne de bruit. `info` n'a pas
  // d'icône (cf. `iconeSeverite`), et garde donc sa pastille — c'est le seul cas où la
  // couleur porte le signal toute seule, et c'est acceptable pour la gravité la plus basse.
  const content = (
    <>
      {icone ? (
        <Icone nom={icone} className={`icone--${tone}`} />
      ) : (
        <span className={`alert__dot alert__dot--${tone}`} aria-hidden="true" />
      )}
      <span className="alert__label">{alert.label}</span>
    </>
  );
  return (
    <li className="alert">
      {href ? (
        <a className="alert__link" href={href} {...attributsLien(href)}>
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
