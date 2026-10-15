// /app/[id] — vue DÉTAILLÉE d'une seule app.
//
// La carte du hub est volontairement dense : elle doit tenir dans une tuile aux côtés de
// quatre autres. Cette page enlève cette contrainte et déplie TOUT ce que l'app publie —
// les 6 métriques, les 10 alertes avec leur sévérité, les 6 actions, les quotas, les deux
// horodatages. Elle n'ajoute aucune donnée : elle donne de la place à celle qui existe déjà.
//
// SÉCURITÉ. Cette page AFFICHE DES DONNÉES et déclenche le fetch porteur du `x-hub-token` :
// elle doit rester derrière la middleware (son chemin n'a pas de point, donc le matcher la
// couvre — ne jamais l'ajouter aux exclusions) ET revérifier la session côté serveur avant
// le moindre fetch, comme `app/page.tsx` et `app/couts/page.tsx`. Défense en profondeur.
//
// Elle n'interroge QUE la source demandée, jamais les cinq : ouvrir un détail ne doit pas
// coûter quatre appels inutiles — DriveAI en particulier paie chaque appel sur un quota dur.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigerAccesHub } from "@/lib/gardeHub";
import { isAuthConfigured } from "@/lib/authConfigured";
import { getSources } from "@/lib/sources";
import { fetchAllSummaries, fetchSummary } from "@/lib/fetchSummary";
import { lireHistorique } from "@/lib/historiqueDb";
import { recommandation, variablesAccent } from "@/lib/carte";
import { verifierConstellation } from "@/lib/constellation";
import { statusBadge } from "@/lib/status";
import { safeHttpUrl } from "@/lib/url";
import { StatusBadge } from "@/components/StatusBadge";
import { ActionList } from "@/components/ActionList";
import { DetailMetriques } from "@/components/DetailMetriques";
import { DetailAlertes } from "@/components/DetailAlertes";
import { DetailCouts } from "@/components/DetailCouts";
import {
  DetailRecommandation,
  DetailSections,
} from "@/components/DetailContenu";
import {
  BandeauPerime,
  DetailCoherence,
  DetailFraicheur,
  DetailProbleme,
} from "@/components/DetailEtat";

export const dynamic = "force-dynamic";

export default async function DetailAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isAuthConfigured()) redirect("/");
  // Session ET accès au hub : cette page déplie les données d'une app (lib/gardeHub.ts).
  await exigerAccesHub();

  const { id } = await params;
  const source = getSources().find((s) => s.id === id);
  // 404 plutôt qu'une page vide : un identifiant inconnu est une URL fausse, pas un état.
  if (!source) notFound();

  const maintenantMs = Date.now();
  // Le résumé de CETTE app et sa mémoire, en parallèle : l'un n'a pas à attendre l'autre.
  const [result, historique] = await Promise.all([
    fetchSummary(source),
    lireHistorique(source.id),
  ]);
  const badge = statusBadge(result);
  const summary = result.state === "ok" ? result.summary : null;
  // Lien déjà jugé par `safeHttpUrl` dans la fonction pure — cette page n'en rejuge aucun.
  const reco = summary ? recommandation(summary) : null;

  // La cohérence se juge sur l'ENSEMBLE (une période de coût n'est incomparable que par
  // rapport aux autres apps), puis on ne garde que ce qui concerne celle-ci.
  const incoherences = verifierConstellation(
    await fetchAllSummaries(getSources()),
  ).filter((inc) => inc.source === source.id);
  const nom = summary?.app.name ?? source.name;
  // Le pendant de la carte : couleur de l'app et texte lisible dessus, CALCULÉ (`lib/carte.ts`).
  const accent = variablesAccent(summary?.app.color);
  const lienApp = summary ? safeHttpUrl(summary.app.url) : null;

  // Chaque bloc vit dans son composant (`components/Detail*.tsx`) : cette fonction ne fait
  // que la garde, les fetchs et l'ordre des blocs.
  return (
    <main
      className="page page--app"
      style={accent as React.CSSProperties | undefined}
    >
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">{nom}</h1>
        </div>
        <div className="page__aside">
          <StatusBadge {...badge} />
          {lienApp && (
            // [PWA-ANDROID] Même raison qu'au titre de la carte (`components/AppWidget.tsx`) :
            // sans `target="_blank"`, Chrome sur Android peut router la navigation vers la PWA
            // installée. Les DEUX sites sont épinglés par `tests/pwaLiens.test.ts`.
            <a className="btn" href={lienApp} rel="noreferrer">
              Ouvrir l’app ↗
            </a>
          )}
          <Link href="/" className="btn">
            ← Hub
          </Link>
        </div>
      </header>

      {!summary && (
        <DetailProbleme result={result} summaryUrl={source.summaryUrl} />
      )}

      {summary && (
        <>
          {result.state === "ok" && result.stale && <BandeauPerime />}
          {reco && <DetailRecommandation reco={reco} summary={summary} />}
          <DetailMetriques
            metrics={summary.metrics}
            historique={historique}
            maintenantMs={maintenantMs}
          />
          <DetailAlertes alerts={summary.alerts} />

          {summary.actions.length > 0 && (
            <section className="detail__bloc" aria-label="Actions">
              <h2 className="detail__titre">
                Actions ({summary.actions.length})
              </h2>
              {/* Passe par ActionList plutôt que de refaire le rendu à la main : cette page
                  rendait TOUTE action en lien, `trigger` compris — donc un endpoint fait
                  pour un POST ouvert en GET, qui ne déclenche rien tout en ayant l'air de
                  marcher. Deux rendus à tenir en parallèle finissent toujours par diverger. */}
              <ActionList actions={summary.actions} appId={source.id} />
            </section>
          )}

          <DetailSections details={summary.details} />
          <DetailCouts usage={summary.usage} />
          <DetailCoherence incoherences={incoherences} />
          <DetailFraicheur summary={summary} summaryUrl={source.summaryUrl} />
        </>
      )}
    </main>
  );
}
