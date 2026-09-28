// app/attention/page.tsx — tout ce qui demande une décision, sur une page.
//
// Pour savoir s'il y avait un problème quelque part, il fallait balayer cinq widgets et
// lire chacun. Avec cinq apps publiant jusqu'à dix alertes, la question « est-ce que
// quelque chose ne va pas ? » demandait de tout lire — donc, en pratique, de ne rien lire.
//
// ⚠️ Cette page affiche des données des cinq apps : elle exige `exigerAccesHub()`, comme
// toutes les autres. `tests/gardePages.test.ts` le fait respecter — une page ajoutée sans
// garde fait tomber le test au lieu de s'afficher pour qui n'y a pas droit.

import Link from "next/link";
import { exigerAccesHub } from "@/lib/gardeHub";
import { getSources } from "@/lib/sources";
import { fetchAllSummaries } from "@/lib/fetchSummary";
import { attentions, compteParGravite, type Gravite } from "@/lib/attention";
import { CADENCE_HORLOGE_MS, continuite, etatObservation } from "@/lib/gel";
import { lireHistoriqueTous } from "@/lib/historiqueDb";
import { baseConfiguree } from "@/lib/db";
import { formatDuree } from "@/lib/format";

export const dynamic = "force-dynamic";

const LIBELLE: Record<Gravite, string> = {
  alert: "À régler",
  warn: "À surveiller",
  info: "Pour information",
};

/** Fenêtre sur laquelle on juge la continuité de l'observation. */
const FENETRE_MS = 7 * 24 * 3_600_000;

export default async function PageAttention() {
  await exigerAccesHub();

  const sources = getSources();
  const maintenant = Date.now();
  const [resultats, historiques] = await Promise.all([
    fetchAllSummaries(sources),
    lireHistoriqueTous(sources.map((s) => s.id)),
  ]);
  const liste = attentions(resultats, maintenant);
  const compte = compteParGravite(liste);

  // Ce que le hub a pu observer, et ce qu'il a MANQUÉ. Voir le bloc de rendu plus bas.
  const observation = sources.map((source) => ({
    id: source.id,
    nom: source.name,
    ...continuite(historiques.get(source.id) ?? [], CADENCE_HORLOGE_MS, FENETRE_MS, maintenant),
  }));
  const totalReleves = observation.reduce((n, o) => n + o.releves, 0);

  // ⚠️ MESURER PLUTÔT QUE RENVOYER CHERCHER. Cette page tourne DANS l'environnement dont la
  // configuration est en cause : elle lit donc `DATABASE_URL` elle-même, au lieu d'envoyer
  // ouvrir le journal d'un workflow. Sans cette lecture, « pas de base » et « l'horloge n'a
  // pas tourné » rendent le MÊME écran — « aucun relevé » — alors que ce sont deux pannes
  // différentes, à deux endroits différents, avec deux gestes différents pour les réparer.
  // Mesuré le 14/09/2026 à 20:34 Z : la production répondait 503 « DATABASE_URL absente » à
  // l'horloge, et cet écran affichait quand même « l'horloge n'a encore rien enregistré ».
  const etat = etatObservation(baseConfiguree(), totalReleves);

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Ce qui demande mon attention</h1>
          <p className="page__sub">
            {liste.length === 0
              ? "Rien à signaler sur les cinq apps."
              : `${compte.alert} à régler · ${compte.warn} à surveiller · ${compte.info} pour information`}
          </p>
        </div>
        <Link className="page__retour" href="/">
          ← Tableau de bord
        </Link>
      </header>

      {liste.length === 0 ? (
        // Un état vide HONNÊTE : « rien à signaler » veut dire que les cinq apps ont
        // répondu et n'ont rien remonté. Une app injoignable serait dans la liste, pas
        // dans ce silence — c'est ce qui rend le vide crédible.
        <p className="attention__vide">
          Les cinq apps ont répondu et ne remontent ni alerte ni panne.
        </p>
      ) : (
        <ul className="attention">
          {liste.map((entree, i) => (
            <li
              className="attention__ligne"
              key={`${entree.appId}-${entree.libelle}-${i}`}
              data-gravite={entree.gravite}
            >
              <span className="attention__gravite">{LIBELLE[entree.gravite]}</span>
              <Link className="attention__app" href={`/app/${entree.appId}`}>
                {entree.appNom}
              </Link>
              <span className="attention__libelle">
                {entree.libelle}
                {entree.duHub && (
                  // Dire d'où vient la ligne : « injoignable » est un constat du HUB, pas
                  // un message de l'app. Confondre les deux enverrait chercher un bug dans
                  // une app qui n'a peut-être rien à se reprocher.
                  <span className="attention__origine" title="Constat du hub, pas une alerte publiée par l’app">
                    {" "}
                    · vu par le hub
                  </span>
                )}
              </span>
              {entree.href && (
                <a
                  className="attention__lien"
                  href={entree.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Ouvrir ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        CE QUE LE HUB A PU OBSERVER — et c'est inconfortable exprès.

        Cette section ne juge pas les apps, elle juge le HUB. Sa mémoire n'était alimentée
        que par l'affichage d'une page : rien ne s'enregistrait quand personne ne regardait,
        donc l'observateur était requis pour l'observation. L'horloge
        (`.github/workflows/releve.yml` → `POST /api/cron/releve`, ADR 0003) répare la
        cause ; ce bloc rend le RÉSIDU visible, parce que la cadence d'un `schedule` GitHub
        n'est pas garantie — mesuré à environ trois fois plus lent que déclaré, tous les
        runs verts.

        L'afficher plutôt que de lisser est le principe « no fake data » appliqué au temps :
        une courbe qui relie deux points par-dessus un silence de sept heures n'est pas une
        approximation, c'est une affirmation fausse sur ce qui s'est passé entre les deux.
      */}
      <section className="observation">
        <h2 className="observation__titre">Ce que le hub a pu observer</h2>
        {etat === "sans-base" ? (
          // ⚠️ DEUX PANNES QUI RENDAIENT LE MÊME ÉCRAN, ET C'EST LA PIRE FORME DU DÉFAUT.
          //
          // « Le hub n'a pas de base » et « l'horloge n'a pas encore tourné » produisent tous
          // deux zéro relevé. Confondus, le message envoyait régler l'horloge — c'est-à-dire
          // le dépôt GitHub — alors que rien ne pouvait être écrit nulle part : le geste est
          // côté Vercel, et l'horloge est déjà correcte. Un diagnostic qui accuse le mauvais
          // endroit ne fait pas perdre une minute, il fait chercher au mauvais endroit
          // pendant que la cause reste entière.
          //
          // L'absence de base ne coûte pas que l'historique : `lib/personnes.ts` retombe sur
          // le PROPRIÉTAIRE seul, vérifié sans réseau. Le hub reste donc parfaitement
          // utilisable POUR MARC — et c'est exactement ce qui rend la panne invisible, parce
          // que le seul chemin qu'il emprunte est le seul qui n'a pas besoin de la base.
          // C'est la leçon n°1 du `HANDOVER.md`, rendue concrète.
          //
          // ⚠️ ET LE GESTE EST EN DEUX TEMPS, SINON IL SEMBLE NE RIEN FAIRE. Vercel FIGE les
          // variables d'environnement au moment où un déploiement est créé : le déploiement
          // qui sert déjà ne verra jamais apparaître celle qu'on vient de poser. Ce message a
          // omis le redéploiement jusqu'au 15/09/2026 — et l'omission a produit une mesure
          // fausse le jour même, un `503` relevé 46 secondes avant la fin du redéploiement,
          // qui a failli faire conclure que la variable était mauvaise. C'est le piège de
          // `[H-18]` : le 01/09, deux « Redeploy » d'affilée avaient été ANNULÉS par
          // `scripts/build-necessaire.sh`, parce qu'il ne juge que le diff git et qu'aucune
          // variable Vercel n'est dans git. Dire « pose la variable » sans dire « puis
          // redéploie » décrit donc un geste qui, seul, ne change rien.
          <p className="observation__vide">
            <strong>Le hub n’a pas de base de données.</strong> La production ne voit pas de{" "}
            <code>DATABASE_URL</code> — mesuré, pas supposé : l’horloge reçoit un{" "}
            <strong>503</strong> qui le dit. Rien ne peut donc être enregistré ni relu : aucun
            relevé, aucune courbe d’évolution, aucune détection de métrique figée. Et le
            modèle d’accès par app est inactif — seul le <strong>propriétaire</strong> peut
            entrer, par le repli sans réseau.
            {" "}Le geste est côté <strong>Vercel</strong>, pas côté dépôt GitHub — l’horloge,
            elle, est déjà correcte — et il se fait en <strong>deux temps</strong> :
            (1) poser <code>DATABASE_URL</code> (projet du hub → Settings → Environment
            Variables, environnement <em>Production</em>) ; (2) <strong>redéployer</strong>.
            Sans le second, rien ne change : Vercel fige les variables au moment où un
            déploiement est créé, donc celui qui sert déjà ne verra jamais la nouvelle.
          </p>
        ) : etat === "horloge-muette" ? (
          // ⚠️ CE MESSAGE A DIT « IL FAUT LES SECRETS » JUSQU'AU 14/09/2026 AU SOIR, alors
          // qu'ils étaient posés et corrects. Il envoyait refaire un geste déjà fait, et
          // laissait la vraie cause invisible : `HUB_URL` désignait l'apex, qui redirige en
          // 308 vers `www` — et `curl` retire l'en-tête `Authorization` dès que l'hôte
          // change, donc le hub répondait 401 « secret refusé ». C'est exactement le défaut
          // que cette page existe pour combattre, commis par cette page.
          //
          // Il ne DEVINE donc plus la cause : il renvoie à l'endroit qui la NOMME. Le
          // workflow, depuis la même journée, compare l'hôte demandé à l'hôte final et écrit
          // les deux dans son journal — un diagnostic mesuré vaut mieux qu'une liste de
          // suspects, surtout quand le premier suspect est innocent.
          <p className="observation__vide">
            Aucun relevé sur les 7 derniers jours : l’horloge n’a encore rien enregistré. La
            raison est écrite dans le dernier run du workflow{" "}
            <code>Relevé</code> (onglet Actions du dépôt) — il nomme ce qui bloque plutôt que
            de laisser deviner : <strong>401</strong> = le secret <code>CRON_SECRET</code> ne
            correspond pas à celui de Vercel, ou <code>HUB_URL</code> ne désigne pas l’origine
            canonique (un apex qui redirige vers <code>www</code> fait perdre le jeton en
            route) ; <strong>503</strong> = <code>CRON_SECRET</code> manque côté Vercel (la
            base, elle, est configurée — sinon c’est l’encadré précédent qui s’afficherait).
            Sans horloge, les courbes d’évolution restent vides : le hub n’enregistre que ce
            qu’il observe.
          </p>
        ) : (
          <>
            <ul className="observation__liste">
              {observation.map((o) => (
                <li className="observation__ligne" key={o.id}>
                  <span className="observation__app">{o.nom}</span>
                  <span className="observation__chiffres">
                    {o.releves === 0
                      ? "aucun relevé"
                      : `${o.releves} relevés · ${o.trous === 0 ? "aucun trou" : `${o.trous} trou${o.trous > 1 ? "s" : ""}`}${
                          o.ecartMaxMs === null
                            ? ""
                            : ` · le pire écart ${formatDuree(o.ecartMaxMs)}`
                        }`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="observation__note">
              Sur 7 jours, une cadence de {formatDuree(CADENCE_HORLOGE_MS)} donnerait{" "}
              {Math.round(FENETRE_MS / CADENCE_HORLOGE_MS)} relevés. Un « trou » est un écart
              de plus du double de cette cadence, donc au moins un passage perdu — les
              courbes d’évolution en portent la trace.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
