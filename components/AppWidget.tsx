import type { CSSProperties } from "react";
import Link from "next/link";
import type { HubSummary } from "@mokarade/hub-contract";
import { phraseManques } from "@/lib/fetchSummary";
import { maintenantMs as instantMaintenant } from "@/lib/horloge";
import type { SummaryResult } from "@/lib/fetchSummary";
import type { Releve } from "@/lib/historique";
import { etatCarte, variationLisible, type PlaceCarte } from "@/lib/carte";
import { widgetSize } from "@/lib/bento";
import { statusBadge } from "@/lib/status";
import { safeHttpUrl } from "@/lib/url";
import { texteSur } from "@/lib/couleur";
import { formatDateTime, formatDuree, formatMetricValue } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { MetricList } from "./MetricList";
import { AlertBanner } from "./AlertBanner";
import { ActionList } from "./ActionList";
import { AlertList } from "./AlertList";
import { Sparkline } from "./Sparkline";
import { Icone } from "./Icone";
import { LogoApp } from "./LogoApp";
import { aUnLogo } from "@/lib/logos";
import { Recommandation } from "./Recommandation";

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

      <div className="heros__courbe">
        <Sparkline points={serie} label={metrique.label} />
      </div>
    </div>
  );
}

function CorpsOk({
  summary,
  historique,
  maintenantMs,
  place,
}: {
  summary: HubSummary;
  historique: Releve[];
  maintenantMs: number;
  place: PlaceCarte;
}) {
  const etat = etatCarte(summary, historique, maintenantMs, place);
  // ⚠️ La recommandation compte de nouveau dans « vide » depuis qu'elle est revenue sur la
  // carte (23/09) : une app qui ne publierait QU'un conseil a désormais quelque chose à
  // montrer ici, donc écrire « aucune donnée » serait faux.
  const vide =
    etat.heros === null &&
    etat.alertePrincipale === null &&
    etat.recommandation === null &&
    etat.actions.length === 0;

  // ⚠️ LE BANDEAU ROUGE EST RÉSERVÉ À LA SÉVÉRITÉ `alert` (`lib/alertes.ts`). Il prenait la
  // première alerte quelle que soit sa gravité : une simple info (« un relevé à classer »)
  // s'affichait donc en rouge avec le triangle d'alerte. Une alerte moins grave rejoint la
  // liste en pastille, à sa couleur.
  const principale = etat.alertePrincipale;
  const bandeau = principale?.severity === "alert" ? principale : null;
  const liste = principale && !bandeau ? [principale, ...etat.alertesSecondaires] : etat.alertesSecondaires;

  return (
    <>
      {etat.heros && <Heros heros={etat.heros} />}
      {bandeau && <AlertBanner alert={bandeau} />}
      <MetricList metrics={etat.secondaires} />
      {/* Les mesures d'abord, puis les alertes en pastilles (maquette de base, 22/10). Les
          suivantes sont LISTÉES quand la carte a la place, au lieu d'être réduites à un
          compteur. Voir `EtatCarte.alertesSecondaires` : sur la capture du 23/09, une alerte
          était résumée à « + 1 autre alerte » avec 420 px de vide juste en dessous. */}
      <AlertList alerts={liste} />
      {etat.autresAlertes > 0 && (
        // Compté, jamais escamoté : une alerte cachée sans trace est une alerte perdue.
        <p className="widget__reste">
          + {etat.autresAlertes} autre{etat.autresAlertes > 1 ? "s" : ""} alerte
          {etat.autresAlertes > 1 ? "s" : ""}
        </p>
      )}
      {/* ⚠️ LA RECOMMANDATION EST REVENUE — et l'arbitrage de Marc du 15/09 (« faut aussi
          moins de texte ») n'est pas contredit : elle est rendue en `compact`, donc le
          `pourquoi` reste dans `/app/[id]`. Ce qui revient est UNE ligne avec son icône, pas
          le bloc de deux paragraphes qui avait été retiré. Marc, 23/09 : « le conseil est
          parti » + « chiffres et icônes, peu de texte ». */}
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
        // ⚠️ La phrase NOMME la variable qui manque : « non configurée » tout court envoie
        // chercher le jeton même quand c'est l'URL qui manque (FinanceAI, dont le résumé
        // ne vient pas de son site web).
        return `Non branchée — ${phraseManques(result.manque)}.`;
      case "unauthorized":
        return "Le hub n’a pas la bonne clé pour lire cette app.";
      case "unreachable":
        return `App injoignable — ${result.detail}.`;
      case "invalid":
        return `Réponse non conforme au contrat — ${result.detail}.`;
      case "contract-too-new":
        // Le ton dit à qui est le problème : l'app va bien, c'est le hub qui est en retard.
        return `Cette app publie la version ${result.published} du contrat ; ce hub lit jusqu’à ${result.supported}. Le hub doit être mis à jour pour lire cette app.`;
      default:
        return "";
    }
  })();
  return <p className="widget__problem">{message}</p>;
}

/**
 * La fraîcheur, à gauche du pied de la carte : elle n'est plus une mention discrète.
 *
 * `dataAsOf` PASSE DEVANT `generatedAt` quand l'app le publie. Le second dit seulement quand
 * la réponse a été fabriquée — c'est toujours « à l'instant », donc ça ne renseigne sur rien.
 * Le premier dit quand la DONNÉE a bougé pour la dernière fois, et c'est la différence entre
 * « à jour » et « figé depuis trois jours ».
 */
function Fraicheur({
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
    <>
      {cachedAgeMs !== undefined && (
        <span className="widget__cache" title="L’app n’a pas répondu à temps : dernier résumé connu.">
          En cache · {formatDuree(cachedAgeMs)}
        </span>
      )}
      {ageDonnee !== null ? (
        <span title={`Données du ${formatDateTime(summary.dataAsOf!)}`}>
          {/* L'horloge remplace le mot « Données » comme point d'entrée du regard : c'est la
              ligne qu'on balaie en dernier, et une icône s'y repère sans être lue. Le texte
              reste entier — l'icône double, elle ne remplace pas (cf. `Icone.tsx`). */}
          <Icone nom="horloge" /> Données d’il y a {formatDuree(ageDonnee)}
        </span>
      ) : (
        // L'app ne publie pas `dataAsOf` : le hub ne SAIT pas si la donnée est fraîche, et il
        // le dit plutôt que d'afficher l'heure de génération comme si c'était la même chose.
        <span title="Cette app ne publie pas dataAsOf — la fraîcheur réelle est inconnue.">
          Généré {formatDateTime(summary.generatedAt)}
        </span>
      )}
    </>
  );
}

export function AppWidget({
  result,
  historique = [],
  maintenantMs = instantMaintenant(),
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
  const accent = result.state === "ok" ? result.summary.app.color : result.source.couleur;
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
        {/* Le logo de la série A, décoratif (le nom suit) ; une app sans logo n'en reçoit PAS un
            inventé (`lib/logos.ts`). */}
        {aUnLogo(result.source.id) && (
          <span className="widget__logo" data-etat={badge.tone}>
            <LogoApp id={result.source.id} />
          </span>
        )}
        <h2 className="widget__title">
          {appUrl ? (
            // [PWA-ANDROID] PAS de `target="_blank"`, et c'est le verrou de « ouvrir depuis le
            // hub ouvre l'app INSTALLÉE » (Marc, 18/09). Une PWA installée sur Android
            // s'enregistre comme gestionnaire des URL de son `scope` (WebAPK) : Chrome peut
            // alors passer la main à l'app plutôt que d'ouvrir un onglet — mais seulement sur
            // une navigation de premier niveau. `_blank` crée un onglet de navigateur, donc
            // court-circuite la bascule. Contrepartie ASSUMÉE : sur PC, le hub est quitté
            // plutôt que doublé (retour arrière pour revenir). `tests/pwaLiens.test.ts`
            // épingle l'absence du drapeau — sinon il revient au prochain lot qui touche
            // cette carte, et la bascule s'éteint sans que rien ne change à l'écran.
            <a href={appUrl} rel="noreferrer">
              {name}
            </a>
          ) : (
            name
          )}
        </h2>
        <StatusBadge {...badge} />
      </header>
      <div className="widget__body">
        {result.state === "ok" ? (
          <CorpsOk
            summary={result.summary}
            historique={historique}
            maintenantMs={maintenantMs}
            // Depuis la maquette du 22/10 toutes les cartes sont identiques : une colonne, un
            // chiffre, des mesures en lignes, les alertes en pastilles. C'est le contenu de la
            // place « large » (alertes listées, courbes des mesures) — sans les sections
            // `details`, qui vivent sur la page de détail (« Détail ») et la rendent en entier.
            place="large"
          />
        ) : (
          <CorpsProbleme result={result} />
        )}
      </div>
      <footer className="widget__foot">
        {result.state === "ok" && (
          <Fraicheur
            summary={result.summary}
            cachedAgeMs={result.stale ? result.cachedAgeMs : undefined}
            maintenantMs={maintenantMs}
          />
        )}
        <span className="widget__actions">
          {/* Le titre ouvre l'APP elle-même (lien externe) ; ce lien-ci ouvre le DÉTAIL dans
              le hub. Deux destinations différentes, donc deux liens distincts plutôt qu'un
              seul ambigu. Il vaut aussi pour une app en erreur : c'est là qu'on voit
              l'endpoint interrogé et le message complet. */}
          {/* ⚠️ CE LIEN REND TOUTE LA CARTE CLIQUABLE, par un `::after` qui la recouvre
              (`app/globals.css`). C'est la seule façon d'y arriver sans imbriquer un `<a>`
              dans un `<a>` — du HTML invalide, que les navigateurs « réparent » en cassant
              la navigation au clavier. Le titre, « Ouvrir » et les boutons d'action
              remontent au-dessus de la nappe par un `z-index`, donc ils restent atteignables.
              Contrepartie assumée (Marc, 15/09) : on ne peut plus sélectionner le texte de
              la carte à la souris. Depuis la maquette du 22/10, il est dans le pied, à côté
              d'« Ouvrir » : deux boutons de même poids, l'un dans le hub, l'autre dans l'app. */}
          <Link
            className="widget__detail"
            href={`/app/${result.source.id}`}
            aria-label={`Détail de ${name}`}
          >
            Détail
          </Link>
          {appUrl && (
            // Même règle que le titre : PAS de `target="_blank"` (`[PWA-ANDROID]` ci-dessus).
            <a className="widget__ouvrir" href={appUrl} rel="noreferrer" aria-label={`Ouvrir ${name}`}>
              Ouvrir
            </a>
          )}
        </span>
      </footer>
    </article>
  );
}
