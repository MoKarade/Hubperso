import Link from "next/link";
import type { Attention } from "@/lib/attention";
import type { Resume } from "@/lib/resume";
import { BandeauAttention } from "./BandeauAttention";

// Sous l'en-tête : une phrase vraie sur l'état du hub, puis ce qu'il faut regarder.
//
// La phrase est TOUJOURS là (maquette validée par Marc, 22/10/2026) ; les points n'apparaissent
// que s'il y en a. Au-delà de `MAX_POINTS`, le compte restant passe par le bandeau d'attention,
// qui mène à /attention : rien n'est escamoté.

function Point({ point }: { point: Attention }) {
  return (
    <li className="resume__point" data-gravite={point.gravite}>
      <span className="resume__pastille" aria-hidden="true" />
      <Link className="resume__lien" href={`/app/${point.appId}`}>
        <strong>{point.appNom}</strong> {point.libelle}
      </Link>
    </li>
  );
}

export function ResumeHub({ resume, liste }: { resume: Resume; liste: Attention[] }) {
  return (
    <section className="resume" aria-label="État du hub">
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
    </section>
  );
}
