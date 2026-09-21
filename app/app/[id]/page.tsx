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
import { serieMetrique, variation, inchangeDepuisMs } from "@/lib/historique";
import { FENETRE_VARIATION_MS, SEUIL_INCHANGE_MS, recommandation } from "@/lib/carte";
import { verifierConstellation } from "@/lib/constellation";
import { Sparkline } from "@/components/Sparkline";
import { statusBadge, severityTone } from "@/lib/status";
import { quotaRatio, toCad } from "@/lib/usage";
import { formatCad, formatDateTime, formatDuree, formatMetricValue, formatTrend } from "@/lib/format";
import { safeHttpUrl } from "@/lib/url";
import { texteSur } from "@/lib/couleur";
import { StatusBadge } from "@/components/StatusBadge";
import { ActionList } from "@/components/ActionList";
import { Recommandation } from "@/components/Recommandation";

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
  const incoherences = verifierConstellation(await fetchAllSummaries(getSources())).filter(
    (inc) => inc.source === source.id,
  );
  const nom = summary?.app.name ?? source.name;
  const accent = summary?.app.color;
  // Le pendant de la carte : le texte lisible sur cette couleur, CALCULÉ (`lib/couleur.ts`).
  // Deux des six couleurs de l'écosystème rendent le blanc illisible.
  const accentTexte = texteSur(accent);
  const lienApp = summary ? safeHttpUrl(summary.app.url) : null;

  return (
    <main
      className="page page--app"
      style={
        accent
          ? ({
              "--accent": accent,
              ...(accentTexte ? { "--accent-texte": accentTexte } : {}),
            } as React.CSSProperties)
          : undefined
      }
    >
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">{nom}</h1>
        </div>
        <div className="page__aside">
          <StatusBadge {...badge} />
          {lienApp && (
            <a className="btn" href={lienApp} target="_blank" rel="noreferrer noopener">
              Ouvrir l’app ↗
            </a>
          )}
          <Link href="/" className="btn">← Hub</Link>
        </div>
      </header>

      {/* Échec de fetch : on dit exactement ce qui ne va pas, jamais une page vide. */}
      {!summary && (
        <section className="detail__bloc">
          <p className="widget__problem">
            {result.state === "unconfigured" &&
              `Non branchée dans l’environnement du hub — ${result.manque
                .map((m) =>
                  m === "url"
                    ? "aucune URL de résumé configurée"
                    : "aucun jeton x-hub-token configuré",
                )
                .join(" et ")}.`}
            {result.state === "unauthorized" &&
              "Jeton refusé (401). La valeur ne correspond pas à celle de l’app."}
            {result.state === "unreachable" && `App injoignable — ${result.detail}.`}
            {result.state === "invalid" &&
              `Réponse non conforme au contrat — ${result.detail}.`}
            {result.state === "contract-too-new" &&
              `L’app publie la version ${result.published} du contrat ; ce hub lit jusqu’à la ${result.supported}. ` +
                "C’est le hub qui est à re-pinner — l’app va bien."}
          </p>
          <p className="detail__endpoint">
            {/* Une source sans URL n'a pas d'endpoint à montrer : le dire, plutôt que de
                rendre un <code> vide qui se lit comme une adresse illisible. */}
            Endpoint interrogé :{" "}
            {source.summaryUrl ? <code>{source.summaryUrl}</code> : <em>aucun (non configuré)</em>}
          </p>
        </section>
      )}

      {summary && (
        <>
          {result.state === "ok" && result.stale && (
            <div className="bandeau" role="alert">
              <span className="bandeau__icone" aria-hidden="true">!</span>
              <span className="bandeau__label">
                L’app n’a pas répondu à temps — ceci est le dernier résumé connu, pas l’état
                courant.
              </span>
            </div>
          )}

          {/* LA RECOMMANDATION AVANT LES MÉTRIQUES, ici seulement.
              Sur la carte elle vient APRÈS les chiffres, parce qu'on y arrive par un coup
              d'œil. Sur cette page on arrive par une question — « qu'est-ce que je fais de
              cette app ? » — et la réponse doit être la première chose lue. Ce n'est pas une
              incohérence : c'est le même contenu placé selon ce qu'on est venu chercher.
              Le « pourquoi » n'est rendu qu'ICI (`compact` absent) : la place existe. */}
          {reco && (
            <section className="detail__bloc" aria-label="Recommandation">
              <h2 className="detail__titre">Recommandation</h2>
              <Recommandation reco={reco} />
              {reco.href === null && summary.recommendation?.href !== undefined && (
                // Refus VISIBLE, jamais silencieux : l'app a publié un lien que
                // `safeHttpUrl` a écarté (autre chose que http/https). Le taire donnerait un
                // conseil qui semble simplement ne pas être cliquable, et personne
                // n'irait corriger l'app.
                <p className="detail__note">
                  ⚠️ Le lien publié avec cette recommandation a été refusé (ni <code>http</code>
                  {" "}ni <code>https</code>). Le texte reste affiché, le lien non.
                </p>
              )}
            </section>
          )}

          <section className="detail__bloc" aria-label="Métriques">
            <h2 className="detail__titre">Métriques ({summary.metrics.length}/6)</h2>
            {summary.metrics.length === 0 ? (
              <p className="detail__vide">Cette app ne publie aucune métrique.</p>
            ) : (
              <ul className="detail__metriques">
                {summary.metrics.map((metrique, i) => {
                  // L'historique de CETTE métrique. Vide = mémoire encore jeune, jamais une
                  // courbe inventée : la ligne le dit en toutes lettres.
                  const serie = serieMetrique(historique, metrique.label);
                  const evolution = variation(
                    historique,
                    metrique.label,
                    FENETRE_VARIATION_MS,
                    maintenantMs,
                  );
                  const fige = inchangeDepuisMs(historique, metrique.label, maintenantMs);
                  return (
                    <li className="detail__metrique" key={`${metrique.label}-${i}`}>
                      <div className="detail__metrique-tete">
                        <span className="metric__label">{metrique.label}</span>
                        <span
                          className="metric__value"
                          data-tone={metrique.severity ? severityTone(metrique.severity) : undefined}
                        >
                          {formatMetricValue(metrique)}
                        </span>
                        {metrique.trend !== undefined && (
                          <span className="metric__trend" data-dir={metrique.trend >= 0 ? "up" : "down"}>
                            {formatTrend(metrique.trend)}
                          </span>
                        )}
                      </div>
                      <div className="detail__metrique-courbe">
                        <Sparkline points={serie} label={metrique.label} />
                      </div>
                      <p className="detail__metrique-note">
                        {evolution ? (
                          <span data-dir={evolution.deltaAbsolu >= 0 ? "up" : "down"}>
                            {evolution.deltaRelatif === null
                              ? `${evolution.deltaAbsolu >= 0 ? "+" : ""}${evolution.deltaAbsolu}`
                              : formatTrend(evolution.deltaRelatif * 100)}{" "}
                            sur {formatDuree(FENETRE_VARIATION_MS)}
                          </span>
                        ) : (
                          <span className="detail__attente">pas encore d’historique</span>
                        )}
                        {fige !== null && fige >= SEUIL_INCHANGE_MS && (
                          <span className="detail__fige">inchangé depuis {formatDuree(fige)}</span>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="detail__bloc" aria-label="Alertes">
            <h2 className="detail__titre">Alertes ({summary.alerts.length}/10)</h2>
            {summary.alerts.length === 0 ? (
              <p className="detail__vide">Aucune alerte — c’est une bonne nouvelle.</p>
            ) : (
              <ul className="alerts">
                {summary.alerts.map((a, i) => {
                  const href = safeHttpUrl(a.href);
                  const contenu = (
                    <>
                      <span
                        className={`alert__dot alert__dot--${severityTone(a.severity)}`}
                        aria-hidden="true"
                      />
                      <span className="alert__label">{a.label}</span>
                      <span className="detail__severite">{a.severity}</span>
                    </>
                  );
                  return (
                    <li key={`${a.label}-${i}`} className="alert">
                      {href ? (
                        <a
                          className="alert__link"
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {contenu}
                        </a>
                      ) : (
                        contenu
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {summary.actions.length > 0 && (
            <section className="detail__bloc" aria-label="Actions">
              <h2 className="detail__titre">Actions ({summary.actions.length}/6)</h2>
              {/* Passe par ActionList plutôt que de refaire le rendu à la main : cette page
                  rendait TOUTE action en lien, `trigger` compris — donc un endpoint fait
                  pour un POST ouvert en GET, qui ne déclenche rien tout en ayant l'air de
                  marcher. Deux rendus à tenir en parallèle finissent toujours par diverger. */}
              <ActionList actions={summary.actions} appId={source.id} />
            </section>
          )}

          {/* LES BLOCS `details` DE L'APP — ce que les 6 métriques ne peuvent pas porter.
              Le plafond de `metrics` est SIX, et il est volontaire : une carte qui en
              affiche vingt n'en affiche aucune. Mais une app a souvent des lignes qui
              méritent d'être lues sans mériter la carte — les campagnes de rangement de
              DriveAI, les placements par compte de FinanceAI, la dernière passe de veille de
              JobAI. Le contrat v1.3 leur donne `details` : jusqu'à 6 sections de 8 lignes,
              chacune titrée par l'app.
              Rendu ICI et nulle part ailleurs (choix de Marc, 15/09) : 48 lignes sur une
              carte bento casseraient la grille, et le lien « détail » y mène en un clic.
              GÉNÉRIQUE, comme tout le reste : le hub ne connaît aucun de ces titres, il rend
              ce qu'on lui publie. Aucune section n'est réordonnée ni fusionnée — l'ordre est
              celui de l'app, qui seule sait ce qui compte le plus chez elle. */}
          {summary.details?.map((section, s) => (
            <section
              className="detail__bloc"
              aria-label={section.title}
              key={`${section.title}-${s}`}
            >
              <h2 className="detail__titre">{section.title}</h2>
              <ul className="detail__lignes">
                {section.items.map((item, i) => {
                  const tone = item.severity ? severityTone(item.severity) : null;
                  return (
                    <li className="detail__ligne" key={`${item.label}-${i}`}>
                      <span className="detail__ligne-label">
                        {item.label}
                        {/* Le `hint` est la précision courte que l'app attache à la ligne.
                            Rendu en texte, jamais en infobulle : une infobulle ne se lit pas
                            au clavier et ne s'imprime pas. */}
                        {item.hint && <span className="detail__ligne-hint">{item.hint}</span>}
                      </span>
                      <span className="detail__ligne-valeur" data-tone={tone ?? undefined}>
                        {formatMetricValue(item)}
                        {item.trend !== undefined && (
                          <span
                            className="metric__trend"
                            data-dir={item.trend >= 0 ? "up" : "down"}
                          >
                            {formatTrend(item.trend)}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <section className="detail__bloc" aria-label="Coûts et quotas">
            <h2 className="detail__titre">Coûts &amp; quotas</h2>
            {!summary.usage ? (
              // « Non suivi » et non « 0 $ » : l'app ne publie pas de bloc usage, donc on
              // ne sait rien. Afficher un zéro affirmerait un suivi qui n'existe pas.
              <p className="detail__vide">Non suivi par cette app.</p>
            ) : (
              <>
                {summary.usage.cost && (
                  <p className="detail__cout">
                    {formatCad(toCad(summary.usage.cost.amount, summary.usage.cost.currency))}{" "}
                    <span className="detail__periode">
                      ({summary.usage.cost.period}
                      {summary.usage.cost.currency === "USD" && " — converti depuis USD"})
                    </span>
                  </p>
                )}
                {summary.usage.quotas?.map((q, i) => {
                  const ratio = quotaRatio(q.used, q.limit);
                  return (
                    <div key={`${q.label}-${i}`} className="couts__quota">
                      <span>
                        {q.label} — {q.used}
                        {q.limit !== null ? ` / ${q.limit}` : ""} {q.unit ?? ""}
                      </span>
                      {ratio !== null && (
                        <div className="couts__bar">
                          <span
                            className={`couts__barfill${ratio >= 0.8 ? " couts__barfill--warn" : ""}`}
                            style={{ width: `${Math.min(100, ratio * 100)}%` }}
                          />
                        </div>
                      )}
                      {q.resetAt && (
                        <p className="couts__nolimit">
                          Remise à zéro : {formatDateTime(q.resetAt)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </section>

          <section className="detail__bloc" aria-label="Cohérence">
            <h2 className="detail__titre">Cohérence</h2>
            {/* `verifierConstellation` existait depuis le 20/08 et n'était visible NULLE PART :
                seul un workflow quotidien le lisait, dans des journaux que personne n'ouvre.
                Ce que le hub CROIT d'une app (son `id` dans sources.ts) et ce qu'elle publie
                d'elle-même n'étaient donc rapprochés qu'en coulisses. Une divergence ne se voit
                pas à l'écran : le widget s'affiche, avec le bon contenu, sous le bon nom. */}
            {incoherences.length === 0 ? (
              <p className="detail__vide">
                Ce que le hub déclare et ce que l’app publie concordent.
              </p>
            ) : (
              <ul className="detail__incoherences">
                {incoherences.map((inc, i) => (
                  <li key={`${inc.genre}-${i}`} data-gravite={inc.gravite}>
                    <span className="detail__genre">{inc.genre}</span> {inc.detail}
                  </li>
                ))}
              </ul>
            )}
          </section>

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
                <code>{source.summaryUrl}</code>
              </dd>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}
