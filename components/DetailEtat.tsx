// components/DetailEtat.tsx — ce que la page de détail (/app/[id]) dit de l'ÉTAT de la
// réponse : l'échec de fetch, le résumé périmé, la cohérence avec la déclaration du hub et
// la fraîcheur des données.
//
// Sorti de `app/app/[id]/page.tsx` (refactor sans changement de rendu). Les phrases sont
// calculées dans `lib/carte.ts` (`messageProblemeDetail`), testées sans rendu.

import type { HubSummary } from "@mokarade/hub-contract";
import type { SummaryResult } from "@/lib/fetchSummary";
import type { Incoherence } from "@/lib/constellation";
import { messageProblemeDetail } from "@/lib/carte";
import { formatDateTime } from "@/lib/format";

/** Échec de fetch : on dit exactement ce qui ne va pas, jamais une page vide. */
export function DetailProbleme({
  result,
  summaryUrl,
}: {
  result: SummaryResult;
  summaryUrl: string | null | undefined;
}) {
  return (
    <section className="detail__bloc">
      <p className="widget__problem">{messageProblemeDetail(result)}</p>
      <p className="detail__endpoint">
        {/* Une source sans URL n'a pas d'endpoint à montrer : le dire, plutôt que de
            rendre un <code> vide qui se lit comme une adresse illisible. */}
        Endpoint interrogé :{" "}
        {summaryUrl ? <code>{summaryUrl}</code> : <em>aucun (non configuré)</em>}
      </p>
    </section>
  );
}

/** Le résumé vient du cache : il ne doit jamais passer pour l'état courant. */
export function BandeauPerime() {
  return (
    <div className="bandeau" role="alert">
      <span className="bandeau__icone" aria-hidden="true">!</span>
      <span className="bandeau__label">
        L’app n’a pas répondu à temps — ceci est le dernier résumé connu, pas l’état
        courant.
      </span>
    </div>
  );
}

/**
 * `verifierConstellation` existait depuis le 20/08 et n'était visible NULLE PART : seul un
 * workflow quotidien le lisait, dans des journaux que personne n'ouvre. Ce que le hub CROIT
 * d'une app (son `id` dans sources.ts) et ce qu'elle publie d'elle-même n'étaient donc
 * rapprochés qu'en coulisses. Une divergence ne se voit pas à l'écran : le widget s'affiche,
 * avec le bon contenu, sous le bon nom.
 */
const LIBELLE_GENRE: Record<Incoherence["genre"], string> = {
  "identite-divergente": "Nom différent",
  "contrat-trop-recent": "Hub à mettre à jour",
  "hors-contrat": "Réponse non conforme",
  injoignable: "App injoignable",
  jeton: "Clé refusée",
  "periodes-melangees": "Périodes mélangées",
  "devises-melangees": "Devises mélangées",
};

export function DetailCoherence({ incoherences }: { incoherences: Incoherence[] }) {
  return (
    <section className="detail__bloc" aria-label="Cohérence">
      <h2 className="detail__titre">Cohérence</h2>
      {incoherences.length === 0 ? (
        <p className="detail__vide">Ce que le hub déclare et ce que l’app publie concordent.</p>
      ) : (
        <ul className="detail__incoherences">
          {incoherences.map((inc, i) => (
            <li key={`${inc.genre}-${i}`} data-gravite={inc.gravite}>
              <span className="detail__genre">{LIBELLE_GENRE[inc.genre]}</span> {inc.detail}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DetailFraicheur({
  summary,
  summaryUrl,
}: {
  summary: HubSummary;
  summaryUrl: string | null | undefined;
}) {
  return (
    <section className="detail__bloc" aria-label="Fraîcheur">
      <h2 className="detail__titre">Fraîcheur</h2>
      <dl className="detail__meta">
        <dt>Réponse fabriquée</dt>
        <dd>{formatDateTime(summary.generatedAt)}</dd>
        <dt>Données datées de</dt>
        {/* La distinction qui compte : `generatedAt` est toujours « maintenant ».
            Sans `dataAsOf`, impossible de savoir si les chiffres sont figés. */}
        <dd>
          {summary.dataAsOf
            ? formatDateTime(summary.dataAsOf)
            : "non publié par l’app — impossible de savoir si les chiffres sont à jour"}
        </dd>
        <dt>Endpoint</dt>
        <dd>
          <code>{summaryUrl}</code>
        </dd>
      </dl>
    </section>
  );
}
