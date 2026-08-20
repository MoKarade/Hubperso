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

export const dynamic = "force-dynamic";

const LIBELLE: Record<Gravite, string> = {
  alert: "À régler",
  warn: "À surveiller",
  info: "Pour information",
};

export default async function PageAttention() {
  await exigerAccesHub();

  const resultats = await fetchAllSummaries(getSources());
  const liste = attentions(resultats);
  const compte = compteParGravite(liste);

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
    </main>
  );
}
