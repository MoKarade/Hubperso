// components/LignesDetail.tsx — les lignes d'une section `details` du contrat.
//
// ⚠️ UNE SOURCE UNIQUE POUR DEUX SURFACES, et c'est la leçon n° 11 du dépôt appliquée avant
// que le détecteur ne la trouve. Ces lignes sont rendues à DEUX endroits depuis le 23/09 :
// la carte du héros (aperçu borné) et la page de détail (tout). Deux copies se seraient lues
// parfaitement bien chacune de son côté — une duplication n'existe qu'à l'échelle du diff —
// et auraient divergé au premier ajustement de `hint` ou de `trend`.
//
// Le TITRE de la section n'est pas ici : la carte et la page ne le rendent pas au même
// niveau de titraille (`h3` contre `h2`), et un composant qui choisirait à leur place
// casserait la hiérarchie de l'une des deux. Chacune enveloppe, celui-ci peint le contenu.

import type { SectionDetail } from "@/lib/carte";
import { formatMetricValue, formatTrend } from "@/lib/format";
import { severityTone } from "@/lib/status";
import { Icone } from "./Icone";
import { iconeSeverite, iconeTendance } from "@/lib/icones";

export function LignesDetail({ items }: { items: SectionDetail["items"] }) {
  return (
    <ul className="detail__lignes">
      {items.map((item, i) => {
        const tone = item.severity ? severityTone(item.severity) : null;
        const icone = item.severity ? iconeSeverite(item.severity) : null;
        return (
          <li className="detail__ligne" key={`${item.label}-${i}`}>
            <span className="detail__ligne-label">
              {/* L'icône ne paraît que pour `warn` et `alert` : une ligne qui va bien n'a
                  rien à signaler, et un pictogramme sur chaque ligne n'en signale aucune. */}
              {icone && <Icone nom={icone} className={`icone--${tone}`} />}
              {item.label}
              {/* Le `hint` est la précision courte que l'app attache à la ligne. Rendu en
                  texte, jamais en infobulle : une infobulle ne se lit pas au clavier et ne
                  s'imprime pas. */}
              {item.hint && <span className="detail__ligne-hint">{item.hint}</span>}
            </span>
            <span className="detail__ligne-valeur" data-tone={tone ?? undefined}>
              {formatMetricValue(item)}
              {item.trend !== undefined && (
                <span className="metric__trend" data-dir={item.trend >= 0 ? "up" : "down"}>
                  <Icone nom={iconeTendance(item.trend)} />
                  {formatTrend(item.trend)}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
