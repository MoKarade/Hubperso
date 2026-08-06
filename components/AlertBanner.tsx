// components/AlertBanner.tsx — le bandeau d'alerte d'une carte.
//
// Un bandeau PAR APP (décision de Marc), pas un bandeau global en haut de page : l'alerte
// reste attachée à l'app qui la remonte, donc on voit d'un coup d'œil QUI a un problème sans
// avoir à lire un libellé pour le deviner.
//
// Il ne s'affiche que pour la sévérité `alert` — voir `lib/alertes.ts` pour le raisonnement.
// `role="alert"` le fait annoncer par un lecteur d'écran ; c'est le seul endroit du hub qui
// le justifie, précisément parce que c'est rare.

import type { HubAlert } from "@mokarade/hub-contract";
import { safeHttpUrl } from "@/lib/url";

export function AlertBanner({ alert }: { alert: HubAlert }) {
  // Même filtre que partout ailleurs : un href du contrat ne devient cliquable que s'il est
  // http/https. Jamais rendu brut.
  const href = safeHttpUrl(alert.href);

  return (
    <div className="bandeau" role="alert">
      <span className="bandeau__icone" aria-hidden="true">
        !
      </span>
      <span className="bandeau__label">{alert.label}</span>
      {href && (
        <a
          className="bandeau__lien"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
        >
          Ouvrir
        </a>
      )}
    </div>
  );
}
