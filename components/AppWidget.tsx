import type { CSSProperties } from "react";
import Link from "next/link";
import type { HubSummary } from "@mokarade/hub-contract";
import type { SummaryResult } from "@/lib/fetchSummary";
import type { Releve } from "@/lib/historique";
import { etatCarte, FENETRE_VARIATION_MS } from "@/lib/carte";
import { widgetSize } from "@/lib/bento";
import { statusBadge } from "@/lib/status";
import { safeHttpUrl } from "@/lib/url";
import { formatDateTime, formatDuree, formatMetricValue, formatTrend } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { MetricList } from "./MetricList";
import { AlertBanner } from "./AlertBanner";
import { ActionList } from "./ActionList";
import { Recommandation } from "./Recommandation";
import { Sparkline } from "./Sparkline";

/**
 * Le bloc dominant de la carte : la métrique que l'app a choisi de publier en premier, sa
 * courbe, et ce que la mémoire en dit.
 *
 * ⚠️ « Inchangé depuis N j » est NEUTRE, jamais un avertissement. Beaucoup de métriques ne
 * bougent légitimement jamais (« 3 véhicules ») ; les peindre en orange apprendrait à ignorer
 * l'orange. Et décider qu'une métrique DEVRAIT bouger demanderait de savoir ce qu'elle
 * mesure — la connaissance app par app que le hub s'interdit. On montre le fait, le jugement
 * reste humain. Voir l'en-tête de `lib/carte.ts`.
 */
function Heros({ heros }: { heros: NonNullable<ReturnType<typeof etatCarte>["heros"]> }) {
  const { metrique, serie, variation, inchangeDepuisMs } = heros;
  return (
    <div className="heros">
      <span className="heros__label">{metrique.label}</span>
      <span className="heros__valeur">{formatMetricValue(metrique)}</span>

      <div className="heros__courbe">
        <Sparkline points={serie} label={metrique.label} />
      </div>

      <p className="heros__note">
        {variation ? (
          <span className="heros__delta" data-dir={variation.deltaAbsolu >= 0 ? "up" : "down"}>
            {variation.deltaRelatif === null
              ? // Départ à zéro : un pourcentage y serait infini. On dit l'écart brut, qui
                // est la seule chose vraie.
                `${variation.deltaAbsolu >= 0 ? "+" : ""}${variation.deltaAbsolu}`
              : formatTrend(variation.deltaRelatif * 100)}{" "}
            sur {formatDuree(FENETRE_VARIATION_MS)}
          </span>
        ) : (
          // Pas « 0 % » : on ne SAIT pas encore. La distinction est le cœur du no-fake-data.
          <span className="heros__attente">pas encore d’historique</span>
        )}
        {inchangeDepuisMs !== null && (
          <span className="heros__fige">inchangé depuis {formatDuree(inchangeDepuisMs)}</span>
        )}
      </p>
    </div>
  );
}

function CorpsOk({
  summary,
  historique,
  maintenantMs,
}: {
  summary: HubSummary;
  historique: Releve[];
  maintenantMs: number;
}) {
  const etat = etatCarte(summary, historique, maintenantMs);
  const vide =
    etat.heros === null &&
    etat.alertePrincipale === null &&
    etat.actions.length === 0 &&
    // Sans cette ligne, une app qui ne publie QU'une recommandation afficherait « aucune
    // donnée à afficher » juste au-dessus d'un conseil parfaitement lisible.
    etat.recommandation === null;

  return (
    <>
      {etat.heros && <Heros heros={etat.heros} />}
      {etat.alertePrincipale && <AlertBanner alert={etat.alertePrincipale} />}
      {etat.autresAlertes > 0 && (
        // Compté, jamais escamoté : une alerte cachée sans trace est une alerte perdue.
        <p className="widget__reste">
          + {etat.autresAlertes} autre{etat.autresAlertes > 1 ? "s" : ""} alerte
          {etat.autresAlertes > 1 ? "s" : ""}
        </p>
      )}
      <MetricList metrics={etat.secondaires} />
      {/* APRÈS les métriques et AVANT les actions, et l'ordre est le message : une
          recommandation se lit une fois les chiffres vus, et elle mène souvent au geste qui
          suit. La mettre en tête l'aurait fait passer pour un titre ; en queue, sous les
          boutons, elle aurait disparu. */}
      {etat.recommandation && <Recommandation reco={etat.recommandation} compact />}
      <ActionList actions={etat.actions} appId={summary.app.id} />
      {vide && <p className="widget__empty">Aucune donnée à afficher pour l’instant.</p>}
    </>
  );
}

function CorpsProbleme({ result }: { result: SummaryResult }) {
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
      case "contract-too-new":
        // Le ton dit à qui est le problème : l'app va bien, c'est le hub qui est en retard.
        return `Cette app publie la version ${result.published} du contrat ; ce hub lit jusqu’à ${result.supported}. Re-pinner le hub.`;
      default:
        return "";
    }
  })();
  return <p className="widget__problem">{message}</p>;
}

/**
 * Le pied : la fraîcheur, qui n'est plus une mention discrète.
 *
 * `dataAsOf` PASSE DEVANT `generatedAt` quand l'app le publie. Le second dit seulement quand
 * la réponse a été fabriquée — c'est toujours « à l'instant », donc ça ne renseigne sur rien.
 * Le premier dit quand la DONNÉE a bougé pour la dernière fois, et c'est la différence entre
 * « à jour » et « figé depuis trois jours ».
 */
function Pied({
  summary,
  cachedAgeMs,
  maintenantMs,
}: {
  summary: HubSummary;
  cachedAgeMs?: number;
  maintenantMs: number;
}) {
  const ageDonnee = summary.dataAsOf
    ? maintenantMs - new Date(summary.dataAsOf).getTime()
    : null;

  return (
    <footer className="widget__foot">
      {cachedAgeMs !== undefined && (
        <span className="widget__cache" title="L’app n’a pas répondu à temps : dernier résumé connu.">
          En cache · {formatDuree(cachedAgeMs)}
        </span>
      )}
      {ageDonnee !== null ? (
        <span title={`Données du ${formatDateTime(summary.dataAsOf!)}`}>
          Données d’il y a {formatDuree(ageDonnee)}
        </span>
      ) : (
        // L'app ne publie pas `dataAsOf` : le hub ne SAIT pas si la donnée est fraîche, et il
        // le dit plutôt que d'afficher l'heure de génération comme si c'était la même chose.
        <span title="Cette app ne publie pas dataAsOf — la fraîcheur réelle est inconnue.">
          Généré {formatDateTime(summary.generatedAt)}
        </span>
      )}
    </footer>
  );
}

export function AppWidget({
  result,
  historique = [],
  maintenantMs = Date.now(),
  index = 0,
  featured = false,
}: {
  result: SummaryResult;
  /** La mémoire de CETTE app. Vide = pas encore d'historique, jamais une courbe inventée. */
  historique?: Releve[];
  /** Injecté pour que le rendu reste testable sans horloge. */
  maintenantMs?: number;
  index?: number;
  featured?: boolean;
}) {
  const okMetrics = result.state === "ok" ? result.summary.metrics.length : 0;
  const size = widgetSize(result.state === "ok", okMetrics, featured);
  const badge = statusBadge(result);
  const name = result.state === "ok" ? result.summary.app.name : result.source.name;
  const accent = result.state === "ok" ? result.summary.app.color : undefined;
  const appUrl = result.state === "ok" ? safeHttpUrl(result.summary.app.url) : null;
  const style = {
    ...(accent ? { "--accent": accent } : null),
    "--enter-delay": `${index * 70}ms`,
  } as CSSProperties;

  return (
    <article className={`widget ${size}`} style={style}>
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
      {/* Le titre ouvre l'APP elle-même (lien externe) ; ce lien-ci ouvre le DÉTAIL dans le
          hub. Deux destinations différentes, donc deux liens distincts plutôt qu'un seul
          ambigu. Il vaut aussi pour une app en erreur : c'est là qu'on voit l'endpoint
          interrogé et le message complet. */}
      <Link className="widget__detail" href={`/app/${result.source.id}`}>
        Détail →
      </Link>
      <div className="widget__body">
        {result.state === "ok" ? (
          <CorpsOk
            summary={result.summary}
            historique={historique}
            maintenantMs={maintenantMs}
          />
        ) : (
          <CorpsProbleme result={result} />
        )}
      </div>
      {result.state === "ok" && (
        <Pied
          summary={result.summary}
          cachedAgeMs={result.stale ? result.cachedAgeMs : undefined}
          maintenantMs={maintenantMs}
        />
      )}
    </article>
  );
}
