import Link from "next/link";
import type { Attention } from "@/lib/attention";
import { formatEnteteAccueil } from "@/lib/format";
import type { Resume } from "@/lib/resume";
import { BandeauAttention } from "./BandeauAttention";
import { BoutonAnalyser } from "./BoutonAnalyser";

// Sous l'en-tête : la date, une phrase vraie sur l'état du hub, puis ce qu'il faut regarder.
//
// La phrase est TOUJOURS là (maquette validée par Marc, 22/10/2026) ; les points n'apparaissent
// que s'il y en a. Au-delà de `MAX_POINTS`, le compte restant passe par le bandeau d'attention,
// qui mène à /attention : rien n'est escamoté.
//
// LIA n'a PLUS de colonne ici (Marc, 22/10/2026) : elle vit dans la fenêtre entière, comme dans les
// apps (`components/LiaHub.tsx`), et ne réserve aucun espace sur cette page.

function Point({ point }: { point: Attention }) {
  return (
    <li className="resume__point" data-gravite={point.gravite}>
      <span className="resume__pastille" aria-hidden="true" />
      <span className="resume__texte">
        <strong>{point.appNom}</strong> {point.libelle}
      </span>
      <span className="resume__actions">
        <BoutonAnalyser appId={point.appId} appNom={point.appNom} />
        <Link className="btn resume__voir" href={`/app/${encodeURIComponent(point.appId)}`}>
          Voir<span className="sr-only"> {point.appNom}</span>
        </Link>
      </span>
    </li>
  );
}

export function ResumeHub({
  resume,
  liste,
  maintenant,
}: {
  resume: Resume;
  liste: Attention[];
  /** L'instant de la requête, lu par la page (`lib/horloge.ts`) : le composant reste pur. */
  maintenant: number;
}) {
  return (
    <section className="accueil" aria-label="État du hub" data-lia-cible="" data-lia-dit={resume.phrase}>
      <div className="resume">
        <p className="resume__date">{formatEnteteAccueil(maintenant)}</p>
        <h2 className="resume__phrase" data-ton={resume.ton}>
          {resume.phrase}
        </h2>
        {resume.points.length > 0 && (
          <ul className="resume__points" aria-label="À regarder">
            {resume.points.map((p, i) => (
              <Point key={`${p.appId}-${i}`} point={p} />
            ))}
          </ul>
        )}
        {resume.restants > 0 && <BandeauAttention liste={liste} />}
      </div>
    </section>
  );
}
