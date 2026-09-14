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
import { CADENCE_HORLOGE_MS, continuite } from "@/lib/gel";
import { lireHistoriqueTous } from "@/lib/historiqueDb";
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
        {totalReleves === 0 ? (
          <p className="observation__vide">
            Aucun relevé sur les 7 derniers jours. L’horloge n’a pas encore tourné — il faut
            les secrets <code>HUB_URL</code> et <code>CRON_SECRET</code> (dépôt GitHub et
            Vercel). Sans elle, les courbes d’évolution restent vides : le hub n’enregistre
            que ce qu’il observe.
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
              Sur 7 jours, une cadence de {formatDuree(CADENCE_HORLOGE_MS)} donnerait 336
              relevés. Un « trou » est un écart de plus du double de cette cadence, donc au
              moins un passage perdu — les courbes d’évolution en portent la trace.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
