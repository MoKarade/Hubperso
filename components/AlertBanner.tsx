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
import { attributsLien } from "@/lib/lienApp";
import { Icone } from "./Icone";
import { iconeSeverite } from "@/lib/icones";

export function AlertBanner({ alert }: { alert: HubAlert }) {
  // Même filtre que partout ailleurs : un href du contrat ne devient cliquable que s'il est
  // http/https. Jamais rendu brut.
  const href = safeHttpUrl(alert.href);
  const icone = iconeSeverite(alert.severity);

  return (
    <div className="bandeau" role="alert">
      {/* ⚠️ C'ÉTAIT LE CARACTÈRE « ! », pas un dessin — donc à la merci de la police et sans
          rapport de forme avec la gravité. L'icône vient maintenant de `severity`, un champ
          du CONTRAT : triangle pour `alert`, cercle pour `warn`. Deux FORMES distinctes et
          pas seulement deux couleurs, parce que deux ronds de teintes voisines sont
          indiscernables pour un daltonien. `info` n'en a pas : ce bandeau ne sert que les
          deux gravités hautes, et un pictogramme sur tout n'en signale plus aucun. */}
      {icone && <Icone nom={icone} className="bandeau__icone" />}
      <span className="bandeau__label">{alert.label}</span>
      {href && (
        <a
          className="bandeau__lien"
          href={href}
          {...attributsLien(href)}
        >
          Ouvrir
        </a>
      )}
    </div>
  );
}
