// app/demandes/page.tsx — les demandes « Que peut-on changer ici ? » que Marc a faites à LIA.
//
// Chaque fois que Marc choisit cette entrée sur un élément du hub, la demande est gardée dans MemoryAI (une seule
// mémoire de LIA, ADR 0021 de MemoryAI) : l'app, le genre d'élément et le nom que le hub lui donne, jamais le texte de la
// page. Cette page les relit. RÉSERVÉE AU PROPRIÉTAIRE (`exigerProprietaire`) : c'est ce que Marc a voulu changer.
//
// NO FAKE DATA : MemoryAI injoignable, gelée ou hors contrat = « indisponible » avec la raison, jamais une liste inventée ;
// aucune demande gardée = « Aucune demande pour l'instant ». Les dates sont en heure du Québec (`lib/fuseau.ts`).

import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/lib/authConfigured";
import { exigerProprietaire } from "@/lib/gardeHub";
import { lireDemandes } from "@/lib/demandesMemoire";
import { formatDateTime } from "@/lib/format";
import { SOURCE_DEFS } from "@/lib/sources";

export const metadata = {
  title: "Demandes — Hub perso",
};

export const dynamic = "force-dynamic";

/** Le nom affiché de l'app visée ; `hub` = tout ce qui n'est pas dans la carte d'une app. */
const nomApp = (app: string): string => SOURCE_DEFS.find((d) => d.id === app)?.name ?? "Le hub";

export default async function PageDemandes() {
  if (!isAuthConfigured()) redirect("/");
  await exigerProprietaire();

  const lecture = await lireDemandes();

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Demandes</h1>
          <p className="page__sub">Ce que tu as voulu changer, d’un clic droit sur « Que peut-on changer ici ? ».</p>
        </div>
        <Link className="page__retour" href="/">
          ← Tableau de bord
        </Link>
      </header>

      {!lecture.ok ? (
        <p className="page__meta" role="status">
          Les demandes sont indisponibles : {lecture.raison}
        </p>
      ) : lecture.demandes.length === 0 ? (
        <p className="page__meta">Aucune demande pour l’instant.</p>
      ) : (
        <ol className="demandes" aria-label="Demandes de changement, la plus récente d’abord">
          {lecture.demandes.map((d) => (
            <li key={d.id} className="demandes__ligne">
              <span className="demandes__app">{nomApp(d.app)}</span>
              <span className="demandes__nom">{d.nom}</span>
              <time className="demandes__date" dateTime={d.demandeLe}>
                {formatDateTime(d.demandeLe)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
