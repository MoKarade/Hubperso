// app/graphes/page.tsx — les graphes de code de tous les dépôts, à jour à chaque fusion.
//
// Chaque dépôt publie un artefact `graphe` à chaque push sur `main` (voir lib/graphes.ts) ; cette
// page lit le dernier de chacun. RÉSERVÉE AU PROPRIÉTAIRE (`exigerProprietaire`) : un graphe
// décrit la structure d'un dépôt, dont certains sont privés.
//
// NO FAKE DATA : chaque dépôt affiche son état réel (graphe prêt, aucun graphe, expiré, erreur),
// jamais un graphe ou une date présumés. Sans jeton de lecture, la page le dit en tête.
//
// Peu de texte, gros (Marc, 21/10/2026) : le nom du dépôt, un état en quelques mots, un bouton.
// La constellation de chaque carte est un dessin décoratif (lib/dessinDepot.ts) : elle tient la place
// pendant que le VRAI graphe 3D du dépôt se charge dans la carte (components/GraphesVivants.tsx), et
// reste seule quand il n'y a pas de graphe. « Ouvrir » ouvre le graphe sur place, sans changer de page.

import Link from "next/link";
import { exigerProprietaire } from "@/lib/gardeHub";
import { isAuthConfigured } from "@/lib/authConfigured";
import { redirect } from "next/navigation";
import { DEPOTS, etatDepot, idDepot, jetonGraphes, type EtatGraphe } from "@/lib/graphes";
import { ilYa } from "@/lib/format";
import { maintenantMs } from "@/lib/horloge";
import { faitsCarteGraphe } from "@/lib/liaGraphes";
import { ConstellationSvg } from "@/components/ConstellationSvg";
import { GraphesVivants } from "@/components/GraphesVivants";

export const metadata = {
  title: "Graphes de code — Hub perso",
};

export const dynamic = "force-dynamic";

/** L'état en quelques mots : un commit et un âge, ou la raison honnête de l'absence. */
function Etat({ etat, maintenant }: { etat: EtatGraphe; maintenant: number }) {
  switch (etat.etat) {
    case "ok":
      return (
        <p className="carte-graphe__etat">
          <code className="carte-graphe__commit">{etat.sha.slice(0, 7)}</code>
          <span>{ilYa(etat.creeLe, maintenant)}</span>
        </p>
      );
    case "aucun":
      return <p className="carte-graphe__etat">Pas encore de graphe</p>;
    case "expire":
      return <p className="carte-graphe__etat">Expiré, revient à la prochaine fusion</p>;
    case "erreur":
      return (
        <p className="carte-graphe__etat" role="alert">
          {etat.detail}
        </p>
      );
    case "non-branche":
      return <p className="carte-graphe__etat">Non branché</p>;
  }
}

export default async function GraphesPage() {
  if (!isAuthConfigured()) redirect("/");
  await exigerProprietaire();

  const branche = jetonGraphes() !== null;
  const etats = await Promise.all(DEPOTS.map((d) => etatDepot(d)));
  const maintenant = maintenantMs();
  const nbPrets = etats.filter((e) => e.etat === "ok").length;

  return (
    <main className="page graphes">
      <div className="graphes__aurore" aria-hidden />
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Graphes</h1>
        </div>
        <div className="page__aside">
          <p className="page__meta">
            {nbPrets}/{DEPOTS.length} prêts
          </p>
          <Link href="/" className="btn">← Hub</Link>
        </div>
      </header>

      {!branche && (
        <p className="admin__vide" role="alert">
          Non branché : le jeton de lecture GitHub manque (GITHUB_GRAPHES_TOKEN).
        </p>
      )}

      <ul className="graphes__grille">
        {DEPOTS.map((depot, i) => {
          const etat = etats[i]!;
          const pret = etat.etat === "ok";
          return (
            <li
              key={depot}
              className={`carte-graphe carte-graphe--${etat.etat}`}
              style={{ "--i": i } as React.CSSProperties}
              data-lia-donnees={faitsCarteGraphe(depot, etat, maintenant)}
              {...(pret ? { "data-graphe": idDepot(depot), "data-nom": depot } : {})}
            >
              <div className="carte-graphe__vue" data-lia-genre="l’aperçu du graphe de code d’un dépôt" {...(pret ? { "data-ouvrir": "" } : {})}>
                <ConstellationSvg nom={depot} />
                {pret && <div className="carte-graphe__apercu" data-lia-genre="l’aperçu du graphe de code d’un dépôt" />}
              </div>
              <h2 className="carte-graphe__nom">{depot}</h2>
              <Etat etat={etat} maintenant={maintenant} />
              {pret && (
                // Sans JavaScript le lien ouvre la vue 2D d'origine ; avec, le graphe 3D s'ouvre sur place.
                <a
                  className="btn carte-graphe__ouvrir"
                  href={`/api/graphes/${idDepot(depot)}?vue=2d`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ouvrir=""
                  aria-label={`Ouvrir le graphe de ${depot}`}
                >
                  Ouvrir
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <GraphesVivants />
    </main>
  );
}
