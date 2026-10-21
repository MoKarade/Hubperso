// app/graphes/page.tsx — les graphes de code de tous les dépôts, à jour à chaque fusion.
//
// Chaque dépôt publie un artefact `graphe` à chaque push sur `main` (voir lib/graphes.ts) ; cette
// page lit le dernier de chacun. RÉSERVÉE AU PROPRIÉTAIRE (`exigerProprietaire`) : un graphe
// décrit la structure d'un dépôt, dont certains sont privés.
//
// NO FAKE DATA : chaque dépôt affiche son état réel (graphe prêt, aucun graphe, expiré, erreur),
// jamais un graphe ou une date présumés. Sans jeton de lecture, la page le dit en tête.

import Link from "next/link";
import { exigerProprietaire } from "@/lib/gardeHub";
import { isAuthConfigured } from "@/lib/authConfigured";
import { redirect } from "next/navigation";
import { DEPOTS, etatDepot, idDepot, jetonGraphes, type EtatGraphe } from "@/lib/graphes";
import { formatDateTime } from "@/lib/format";

export const metadata = {
  title: "Graphes de code — Hub perso",
};

export const dynamic = "force-dynamic";

function Etat({ depot, etat }: { depot: string; etat: EtatGraphe }) {
  switch (etat.etat) {
    case "ok":
      return (
        <p className="admin__personne-meta">
          commit {etat.sha.slice(0, 7)} · publié le {formatDateTime(etat.creeLe)} ·{" "}
          {Math.max(1, Math.round(etat.octets / 1024))} Ko
        </p>
      );
    case "aucun":
      return <p className="admin__personne-meta">aucun graphe publié pour l’instant</p>;
    case "expire":
      return (
        <p className="admin__personne-meta">
          expiré (publié le {formatDateTime(etat.creeLe)}) — se renouvelle à la prochaine fusion
        </p>
      );
    case "erreur":
      return (
        <p className="admin__personne-meta" role="alert">
          {depot} : {etat.detail}
        </p>
      );
    case "non-branche":
      return <p className="admin__personne-meta">non branché</p>;
  }
}

export default async function GraphesPage() {
  if (!isAuthConfigured()) redirect("/");
  await exigerProprietaire();

  const branche = jetonGraphes() !== null;
  const etats = await Promise.all(DEPOTS.map((d) => etatDepot(d)));

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Graphes de code</h1>
        </div>
        <div className="page__aside">
          <p className="page__meta">{DEPOTS.length} dépôts</p>
          <Link href="/" className="btn">← Hub</Link>
        </div>
      </header>

      <p className="admin__intro">
        Le graphe de chaque dépôt est reconstruit à chaque fusion sur <code>main</code>. Il s’ouvre
        dans un onglet isolé.
      </p>

      {!branche && (
        <p className="admin__vide" role="alert">
          Pas encore branché : le hub n’a pas de jeton de lecture GitHub (variable serveur
          GITHUB_GRAPHES_TOKEN). Aucun graphe ne peut être lu tant qu’elle n’est pas posée.
        </p>
      )}

      <ul className="admin__liste">
        {DEPOTS.map((depot, i) => {
          const etat = etats[i]!;
          return (
            <li key={depot} className="admin__personne">
              <div className="admin__personne-tete">
                <div>
                  <p className="admin__personne-email">{depot}</p>
                  <Etat depot={depot} etat={etat} />
                </div>
                {etat.etat === "ok" && (
                  <div className="admin__personne-actions">
                    <a
                      className="btn"
                      href={`/api/graphes/${idDepot(depot)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ouvrir le graphe
                    </a>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
