import type { CSSProperties } from "react";
import Link from "next/link";
import type { HubSummary } from "@mokarade/hub-contract";
import { phraseManques } from "@/lib/fetchSummary";
import type { SummaryResult } from "@/lib/fetchSummary";
import type { Releve } from "@/lib/historique";
import { etatCarte, variationLisible } from "@/lib/carte";
import { widgetSize } from "@/lib/bento";
import { statusBadge } from "@/lib/status";
import { safeHttpUrl } from "@/lib/url";
import { texteSur } from "@/lib/couleur";
import { formatDateTime, formatDuree, formatMetricValue } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { MetricList } from "./MetricList";
import { AlertBanner } from "./AlertBanner";
import { ActionList } from "./ActionList";
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
  const lisible = variationLisible(metrique, variation);
  return (
    <div className="heros">
      <span className="heros__label">{metrique.label}</span>
      <span className="heros__valeur">{formatMetricValue(metrique)}</span>

      <div className="heros__courbe">
        <Sparkline points={serie} label={metrique.label} />
      </div>

      <p className="heros__note">
        {lisible ? (
          // ⚠️ LA DURÉE VIENT DES DEUX POINTS COMPARÉS, PAS DE LA FENÊTRE DE RECHERCHE.
          // Cette ligne affichait « sur 7 j » quelle que soit l'étendue réelle de
          // l'historique — un écart de 4 h annoncé comme un écart de 7 jours. Voir
          // `variationLisible` dans `lib/carte.ts`, qui porte les trois corrections.
          <span className="heros__delta" data-dir={lisible.sens}>
            {lisible.ecart} <span className="heros__entre">{lisible.entre}</span> en{" "}
            {lisible.sur}
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
  // ⚠️ `etat.recommandation` ne compte PLUS ici : depuis qu'elle a quitté la carte, une app
  // qui ne publierait QU'une recommandation n'a effectivement rien à montrer SUR LA CARTE —
  // et « aucune donnée » est alors la vérité, le conseil étant dans la vue détaillée.
  const vide =
    etat.heros === null &&
    etat.alertePrincipale === null &&
    etat.actions.length === 0;

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
      {/* ⚠️ LA RECOMMANDATION N'EST PLUS ICI — arbitrage de Marc, 15/09 : « faut aussi moins
          de texte ». C'était le bloc le plus verbeux de la carte, et le seul dont l'absence
          ne coûte aucune donnée : il reste entier dans `/app/[id]`, en tête, là où on vient
          justement pour lire. Le garder sur la carte ET le mettre en détail revenait à
          écrire deux fois la même phrase sur deux écrans successifs. */}
      <ActionList actions={etat.actions} appId={summary.app.id} />
      {vide && <p className="widget__empty">Aucune donnée à afficher pour l’instant.</p>}
    </>
  );
}

function CorpsProbleme({ result }: { result: SummaryResult }) {
  const message = (() => {
    switch (result.state) {
      case "unconfigured":
        // ⚠️ La phrase NOMME la variable qui manque : « non configurée » tout court envoie
        // chercher le jeton même quand c'est l'URL qui manque (FinanceAI, dont le résumé
        // ne vient pas de son site web).
        return `Non branchée — ${phraseManques(result.manque)}.`;
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
  // ⚠️ CALCULÉ, JAMAIS CODÉ EN DUR. `app.color` arrive du contrat à l'exécution, et deux des
  // six couleurs de l'écosystème rendent le texte blanc illisible (JobAI 2,09 ; DriveAI
  // 2,11 — la norme demande 4,5). `texteSur` choisit le noir ou le blanc selon la luminance
  // réelle, donc une app qui change sa couleur reste lisible sans qu'on touche au hub.
  // `null` quand la couleur n'est pas exploitable : on ne pose alors RIEN et le bouton
  // retombe sur le style neutre. Voir `lib/couleur.ts`.
  const accentTexte = texteSur(accent);
  const style = {
    ...(accent ? { "--accent": accent } : null),
    ...(accentTexte ? { "--accent-texte": accentTexte } : null),
    "--enter-delay": `${index * 70}ms`,
  } as CSSProperties;

  return (
    // `data-gravite` porte le TON du badge, et c'est la feuille de style qui en tire la
    // teinte de la carte — arbitrage de Marc, 15/09 : le rouge ET l'orange effacent la
    // couleur de l'app. Décider ici aurait dispersé la règle entre le composant et le CSS.
    <article className={`widget ${size}`} style={style} data-gravite={badge.tone}>
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
      {/* ⚠️ CE LIEN REND TOUTE LA CARTE CLIQUABLE, par un `::after` qui la recouvre
          (`app/globals.css`). C'est la seule façon d'y arriver sans imbriquer un `<a>` dans
          un `<a>` — du HTML invalide, que les navigateurs « réparent » en cassant la
          navigation au clavier. Le titre et les boutons d'action remontent au-dessus de la
          nappe par un `z-index`, donc ils restent atteignables.
          Contrepartie assumée (Marc, 15/09) : on ne peut plus sélectionner le texte de la
          carte à la souris. */}
      <Link className="widget__detail" href={`/app/${result.source.id}`}>
        <span>Détail</span>
        <span aria-hidden="true">→</span>
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
