import { Suspense } from "react";
import { exigerAccesHub } from "@/lib/gardeHub";
import { isAuthConfigured } from "@/lib/authConfigured";
import { getSources, type HubSource } from "@/lib/sources";
import { fetchSummary, type SummaryResult } from "@/lib/fetchSummary";
import { enregistrerReleve, lireHistoriqueTous } from "@/lib/historiqueDb";
import { attentions } from "@/lib/attention";
import { maintenantMs } from "@/lib/horloge";
import { ResumeHub } from "@/components/ResumeHub";
import { resumeHub } from "@/lib/resume";
import type { Releve } from "@/lib/historique";
import { aggregateUsage } from "@/lib/usage";
import { formatDateTime } from "@/lib/format";
import { AppWidget } from "@/components/AppWidget";
import { WidgetSkeleton } from "@/components/WidgetSkeleton";
import { CostsCard } from "@/components/CostsCard";
import { FriseEtat } from "@/components/FriseEtat";
import { friseApp } from "@/lib/friseEtat";
import { RefreshControls } from "@/components/RefreshControls";
import { SignOutButton } from "@/components/SignOutButton";

// Un summary est un instantané : toujours frais, jamais mis en cache statiquement.
export const dynamic = "force-dynamic";

/**
 * RENDU EN FLUX — pourquoi cette page n'attend plus ses données.
 *
 * Avant, elle faisait `await fetchAllSummaries(...)` avant d'émettre le moindre octet. Les
 * quatre appels partaient bien en parallèle, mais la page attendait LE PLUS LENT : au réveil
 * à froid de DriveAI (Vercel + Apps Script), ça voulait dire jusqu'à 9 s d'écran vide — le
 * budget réseau complet (`TIMEOUT_MS`) — et ça recommençait à CHAQUE rafraîchissement
 * automatique (toutes les 60 s).
 *
 * Maintenant : les promesses sont lancées ici (toujours en parallèle, toujours server-side,
 * les jetons ne quittent pas le serveur), puis passées à des composants qui les attendent
 * CHACUN dans sa propre frontière `Suspense`. La coquille — en-tête, grille, squelettes —
 * part immédiatement ; chaque carte remplace son squelette quand SON app a répondu. Une app
 * lente ne retient plus les autres.
 *
 * Deux conditions rendaient ça possible, et il faut les préserver :
 *  1. la géométrie de la grille ne dépend plus des données (héros DÉCLARÉ dans `sources.ts`),
 *     sinon on ne saurait pas quoi dessiner avant d'avoir tout reçu ;
 *  2. `fetchSummary` ne REJETTE jamais — chaque mode d'échec est un état de retour. Une
 *     promesse partagée qui rejetterait ferait une « unhandled rejection » côté serveur.
 *
 * Ce qui N'EST PAS résolu par cette page, et ne peut pas l'être ici : la fraîcheur PROPRE de
 * chaque app (`dataAsOf`). Streamer plus vite n'invente pas de la donnée plus récente — le
 * moteur DriveAI tourne par tick de 5 min sous un quota Apps Script dur.
 */

/** Une carte : attend SA promesse, sans bloquer les autres. */
async function StreamedWidget({
  promise,
  historiques,
  index,
  featured,
}: {
  promise: Promise<SummaryResult>;
  /** La mémoire de TOUTES les apps, lue en une requête. Attendue ICI, pas dans la page :
   *  une lecture d'historique lente ne doit pas retenir la coquille ni les autres cartes. */
  historiques: Promise<Map<string, Releve[]>>;
  index: number;
  featured: boolean;
}) {
  const [result, memoire] = await Promise.all([promise, historiques]);
  return (
    <AppWidget
      result={result}
      historique={memoire.get(result.source.id) ?? []}
      index={index}
      featured={featured}
    />
  );
}

/** Compteur d'en-tête : a besoin de TOUTES les réponses, donc il arrive en dernier. */
async function OnlineCount({ promises }: { promises: Promise<SummaryResult>[] }) {
  const results = await Promise.all(promises);
  const online = results.filter((r) => r.state === "ok").length;
  // Horodaté à la RÉCEPTION, pas au début du rendu : c'est l'instant où la donnée affichée
  // a réellement été lue.
  return (
    <>
      {online}/{results.length} en ligne · rafraîchi {formatDateTime(new Date().toISOString())}
    </>
  );
}

/**
 * Le résumé : une phrase vraie sur l'état du hub et les points à regarder. Agrégat, donc il
 * attend toutes les réponses — et il est streamé pour ça. La phrase est calculée des états
 * réels (`lib/resume.ts`), jamais écrite d'avance ; les points sont ceux de `/attention`.
 */
async function StreamedAttention({ promises }: { promises: Promise<SummaryResult>[] }) {
  const results = await Promise.all(promises);
  const liste = attentions(results, maintenantMs());
  return (
    <ResumeHub
      resume={resumeHub(results, liste)}
      liste={liste}
      maintenant={maintenantMs()}
    />
  );
}

/**
 * La frise des dernières 24 h (`lib/friseEtat.ts`) : une ligne par app, tirée des relevés. Elle n'attend que la lecture de
 * l'historique, pas les réponses des apps : une app lente ne la retient pas. Sans base, les relevés sont vides et chaque app
 * dit « aucun relevé », jamais une frise verte.
 */
async function StreamedFrise({
  sources,
  historiques,
}: {
  sources: HubSource[];
  historiques: Promise<Map<string, Releve[]>>;
}) {
  const memoire = await historiques;
  const maintenant = maintenantMs();
  return <FriseEtat frises={sources.map((s) => friseApp(s.id, s.name, memoire.get(s.id) ?? [], maintenant))} />;
}

/** Panneau des coûts : agrégat, donc dépend de toutes les réponses. Streamée à part. */
async function StreamedCosts({ promises }: { promises: Promise<SummaryResult>[] }) {
  const results = await Promise.all(promises);
  return <CostsCard digest={aggregateUsage(results)} maintenant={maintenantMs()} />;
}

export default async function Page() {
  // Fail-closed : sans config d'auth complète, Auth.js peut « échouer ouvert »
  // (MissingSecret loggé mais requête servie, constaté sur Vercel). On refuse de
  // rendre la moindre donnée tant que l'auth n'est pas configurée.
  if (!isAuthConfigured()) {
    return (
      <main className="login">
        <section className="login__card">
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="login__title">Hub indisponible</h1>
          <p className="login__error" role="alert">
            Authentification non configurée (AUTH_SECRET / AUTHORIZED_EMAIL manquants
            dans l&apos;environnement). Aucune donnée n&apos;est servie tant que ce
            n&apos;est pas corrigé.
          </p>
        </section>
      </main>
    );
  }

  // Défense en profondeur : cette page porte les jetons x-hub-token des apps (le fetch
  // part d'ici). Même si la middleware garde déjà tout, on revérifie côté serveur AVANT de
  // lancer le moindre fetch — sans session, rien n'est récupéré ni rendu.
  //
  // Et pas seulement la session : l'ACCÈS AU HUB. Une personne invitée sur une seule app a
  // une session valide (la connexion est unique) — cette page-ci affiche les données des
  // cinq apps, elle exige donc `aAcces(…, APP_HUB)`. Voir lib/gardeHub.ts.
  await exigerAccesHub();

  const sources: HubSource[] = getSources();
  // Lancées tout de suite et toutes ensemble : le parallélisme vient d'ici, pas de Suspense.
  // Appariées à leur source pour qu'aucun index ne puisse se désynchroniser.
  const jobs = sources.map((source) => ({ source, promise: fetchSummary(source) }));
  const promises = jobs.map((j) => j.promise);

  // ── ARCHIVAGE : effet de bord, jamais un préalable à l'affichage ────────────────────
  //
  // Chaque résultat est proposé à la mémoire du hub (`lib/historiqueDb.ts`), qui n'écrit
  // qu'une fois par app et par quart d'heure. Volontairement SANS `await` : le rendu ne
  // doit pas attendre une écriture qui ne sert qu'à demain. `enregistrerReleve` n'échoue
  // jamais vers l'appelant — le `catch` ci-dessous ne couvre donc que l'imprévu, pour
  // qu'une promesse rejetée ne remonte pas en avertissement Node.
  // Lue une seule fois pour les cinq cartes, et NON attendue ici : chaque carte l'attend de
  // son côté, ce qui préserve le rendu en flux.
  const historiques = lireHistoriqueTous(sources.map((s) => s.id));

  for (const { promise } of jobs) {
    void promise
      .then((resultat) => enregistrerReleve(resultat))
      .catch((err) => console.error("[historique] archivage ignoré", err));
  }

  return (
    <main className="page page--large">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Hub</h1>
        </div>
        <div className="page__aside">
          <p className="page__meta">
            <Suspense fallback={<>interrogation des apps…</>}>
              <OnlineCount promises={promises} />
            </Suspense>
          </p>
          <RefreshControls />
          <SignOutButton />
        </div>
      </header>

      {/* Rien à afficher tant que les réponses n'arrivent pas : une phrase d'attente serait
          une phrase inventée, et le résumé n'a pas de forme connue d'avance. */}
      <Suspense fallback={null}>
        <StreamedAttention promises={promises} />
      </Suspense>

      {/* Densité adaptative : aéré par défaut, la grille se resserre quand les apps
          se multiplient (indépendant du contenu des apps — purement un compte). */}
      <section
        className={`bento${sources.length >= 7 ? " bento--dense" : ""}`}
        aria-label="Widgets des apps"
      >
        {jobs.map(({ source, promise }, index) => (
          <Suspense
            key={source.id}
            fallback={<WidgetSkeleton name={source.name} featured={source.hero} />}
          >
            <StreamedWidget historiques={historiques} promise={promise} index={index} featured={source.hero} />
          </Suspense>
        ))}
      </section>

      {/* Sous les cartes : ce que le hub a vu sur 24 h, avant les coûts (l'état avant la dépense). */}
      <Suspense fallback={null}>
        <StreamedFrise sources={sources} historiques={historiques} />
      </Suspense>

      {/* Sous les cartes (maquette de base) : les coûts se lisent après l'état des apps. */}
      <Suspense fallback={<div className="couts-panneau couts-panneau--attente" aria-busy="true" />}>
        <StreamedCosts promises={promises} />
      </Suspense>
    </main>
  );
}
