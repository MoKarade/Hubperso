// components/CourbeCout.tsx — l'évolution du coût d'une app, en SVG inline (H-09).
//
// Pas de librairie de graphes : la CSP (`default-src 'self'`) n'en chargerait aucune. Le tracé
// vient de `courbeCout` (PUR), côté serveur ; zéro JS client. La période et la devise sont
// ÉCRITES avec la courbe : jamais d'agrégat entre unités incomparables.

import { courbeCout } from "@/lib/courbeCout";
import type { CoutReleve, Releve } from "@/lib/historique";
import { FUSEAU } from "@/lib/fuseau";
import { formatCad } from "@/lib/format";
import { PERIOD_LABEL, toCad } from "@/lib/usage";

const JOUR_MOIS = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU, day: "numeric", month: "short" });

export function CourbeCout({
  releves,
  periode,
  devise,
  maintenantMs,
}: {
  releves: Releve[];
  periode: CoutReleve["periode"];
  devise: CoutReleve["devise"];
  maintenantMs: number;
}) {
  const courbe = courbeCout(releves, periode, devise, maintenantMs);
  const cad = (v: number) => formatCad(toCad(v, devise));
  const libellePeriode = PERIOD_LABEL[periode];

  if (!courbe) {
    return (
      <p className="detail__vide">
        Pas encore d’historique du coût ({libellePeriode}) : la courbe apparaîtra après quelques
        relevés.
      </p>
    );
  }

  return (
    <figure className="courbe-cout">
      <figcaption className="courbe-cout__legende">
        Évolution du coût ({libellePeriode}), du {JOUR_MOIS.format(courbe.debutMs)} au{" "}
        {JOUR_MOIS.format(courbe.finMs)}
        {devise === "USD" && " — converti depuis USD"}
      </figcaption>
      <svg
        className="courbe-cout__svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Coût (${libellePeriode}) : de ${cad(courbe.premier)} à ${cad(courbe.dernier)}, entre ${cad(courbe.min)} et ${cad(courbe.max)}`}
      >
        <path className="courbe-cout__trace" d={courbe.trace} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="courbe-cout__axe">
        <span>min {cad(courbe.min)}</span>
        <span>max {cad(courbe.max)}</span>
      </p>
      <p className="courbe-cout__sur7j">
        {courbe.sur7j
          ? `Sur 7 jours : ${courbe.sur7j.delta >= 0 ? "+" : "−"}${cad(Math.abs(courbe.sur7j.delta))} (${cad(courbe.sur7j.debut)} → ${cad(courbe.sur7j.fin)})`
          : "Sur 7 jours : pas assez de relevés."}
      </p>
    </figure>
  );
}
