// components/DetailMetriques.tsx — le bloc « Métriques » de la page de détail (/app/[id]).
//
// Sorti de `app/app/[id]/page.tsx` (refactor sans changement de rendu). Chaque métrique est
// dépliée : valeur, tendance publiée, courbe de sa mémoire, évolution sur la fenêtre et
// « inchangé depuis » quand c'est significatif. Les calculs vivent dans `lib/carte.ts` et
// `lib/historique.ts` ; ce composant ne fait que placer.

import type { HubMetric } from "@mokarade/hub-contract";
import {
  FENETRE_VARIATION_MS,
  inchangeSignificatif,
  noteEvolutionDetail,
} from "@/lib/carte";
import { serieMetrique, variation, type Releve } from "@/lib/historique";
import { severityTone } from "@/lib/status";
import { formatDuree, formatMetricValue, formatTrend } from "@/lib/format";
import { valeurDeMetrique } from "@/lib/resumeSerie";
import { Sparkline } from "./Sparkline";

function MetriqueDetaillee({
  metrique,
  historique,
  maintenantMs,
}: {
  metrique: HubMetric;
  historique: Releve[];
  maintenantMs: number;
}) {
  // L'historique de CETTE métrique. Vide = mémoire encore jeune, jamais une courbe
  // inventée : la ligne le dit en toutes lettres.
  const serie = serieMetrique(historique, metrique.label);
  const evolution = variation(historique, metrique.label, FENETRE_VARIATION_MS, maintenantMs);
  const note = evolution ? noteEvolutionDetail(evolution) : null;
  const fige = inchangeSignificatif(historique, metrique.label, maintenantMs);
  return (
    <li className="detail__metrique">
      <div className="detail__metrique-tete">
        <span className="metric__label">{metrique.label}</span>
        <span
          className="metric__value"
          data-tone={metrique.severity ? severityTone(metrique.severity) : undefined}
        >
          {formatMetricValue(metrique)}
        </span>
        {metrique.trend !== undefined && (
          <span className="metric__trend" data-dir={metrique.trend >= 0 ? "up" : "down"}>
            {formatTrend(metrique.trend)}
          </span>
        )}
      </div>
      <div className="detail__metrique-courbe">
        <Sparkline points={serie} label={metrique.label} val={valeurDeMetrique(metrique)} />
      </div>
      <p className="detail__metrique-note">
        {note ? (
          <span data-dir={note.dir}>{note.texte}</span>
        ) : (
          <span className="detail__attente">pas encore d’historique</span>
        )}
        {fige !== null && (
          <span className="detail__fige">inchangé depuis {formatDuree(fige)}</span>
        )}
      </p>
    </li>
  );
}

export function DetailMetriques({
  metrics,
  historique,
  maintenantMs,
}: {
  metrics: HubMetric[];
  historique: Releve[];
  maintenantMs: number;
}) {
  return (
    <section className="detail__bloc" aria-label="Métriques">
      <h2 className="detail__titre">
        Métriques ({metrics.length})
      </h2>
      {metrics.length === 0 ? (
        <p className="detail__vide">Cette app ne publie aucune métrique.</p>
      ) : (
        <ul className="detail__metriques">
          {metrics.map((metrique, i) => (
            <MetriqueDetaillee
              key={`${metrique.label}-${i}`}
              metrique={metrique}
              historique={historique}
              maintenantMs={maintenantMs}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
