// components/DetailAlertes.tsx — le bloc « Alertes » de la page de détail (/app/[id]).
//
// Sorti de `app/app/[id]/page.tsx` (refactor sans changement de rendu). Toutes les alertes,
// avec leur sévérité écrite en toutes lettres (la carte n'a que la pastille). Un lien n'est
// cliquable qu'après `safeHttpUrl` ; refusé, l'alerte reste lisible, sans lien.

import type { HubAlert } from "@mokarade/hub-contract";
import { safeHttpUrl } from "@/lib/url";
import { severityTone } from "@/lib/status";

/** Plafond du contrat : affiché dans le titre (« 2/10 »). */
const ALERTES_MAX = 10;

/** Gravité d'une alerte en mots simples (jamais le mot anglais du contrat). */
const LIBELLE_GRAVITE: Record<HubAlert["severity"], string> = {
  alert: "À régler",
  warn: "À surveiller",
  info: "Pour information",
};

function AlerteDetaillee({ alerte }: { alerte: HubAlert }) {
  const href = safeHttpUrl(alerte.href);
  const contenu = (
    <>
      <span
        className={`alert__dot alert__dot--${severityTone(alerte.severity)}`}
        aria-hidden="true"
      />
      <span className="alert__label">{alerte.label}</span>
      <span className="detail__severite">
        {LIBELLE_GRAVITE[alerte.severity]}
      </span>
    </>
  );
  return (
    <li className="alert">
      {href ? (
        <a
          className="alert__link"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
        >
          {contenu}
        </a>
      ) : (
        contenu
      )}
    </li>
  );
}

export function DetailAlertes({ alerts }: { alerts: HubAlert[] }) {
  return (
    <section className="detail__bloc" aria-label="Alertes">
      <h2 className="detail__titre">
        Alertes ({alerts.length}/{ALERTES_MAX})
      </h2>
      {alerts.length === 0 ? (
        <p className="detail__vide">
          Aucune alerte — c’est une bonne nouvelle.
        </p>
      ) : (
        <ul className="alerts">
          {alerts.map((a, i) => (
            <AlerteDetaillee key={`${a.label}-${i}`} alerte={a} />
          ))}
        </ul>
      )}
    </section>
  );
}
