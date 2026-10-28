// lib/resumeSerie.ts — ce que LIA lit d'une courbe du hub. PUR : aucune base, aucun réseau, aucune horloge.
//
// Une courbe (`Sparkline`) n'est qu'un tracé : LIA, qui regarde le texte de la page, n'y voyait rien. Ce résumé dit en
// français ce que le tracé montre : combien de relevés, sur quelle période, d'où à où, le plus bas et le plus haut.
// Il ne juge pas (une baisse n'est pas « mauvaise » : le hub ne sait pas ce que la métrique mesure) et n'invente rien :
// moins de deux relevés, pas de résumé (même règle que le tracé).

import type { HubMetric } from "@mokarade/hub-contract";
import { formatMetricValue } from "./format";
import { FUSEAU } from "./fuseau";
import type { Point } from "./historique";

const JOUR = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU, day: "numeric", month: "short" });

/** Écrire une valeur de la série comme la carte écrit cette métrique (`formatMetricValue`) : même unité, même format. */
export const valeurDeMetrique = (metrique: HubMetric) => (v: number) => formatMetricValue({ ...metrique, value: v });

/**
 * Le résumé d'une série, ou `null` sous deux relevés. `val` écrit une valeur (voir `valeurDeMetrique`) ; `label` vient
 * d'une app : il ressort nettoyé chez `decrireElementHub`, pas ici.
 */
export function resumerSerie(points: Point[], label: string, val: (v: number) => string): string | null {
  const utiles = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  if (utiles.length < 2) return null;

  const jour = (t: number) => JOUR.format(new Date(t));
  const premier = utiles[0]!;
  const dernier = utiles[utiles.length - 1]!;
  const bas = utiles.reduce((m, p) => (p.v < m.v ? p : m));
  const haut = utiles.reduce((m, p) => (p.v > m.v ? p : m));

  const sens = dernier.v > premier.v ? "en hausse" : dernier.v < premier.v ? "en baisse" : "au même niveau qu'au départ";
  const extremes =
    bas.v === haut.v
      ? `toujours ${val(bas.v)}`
      : `plus bas ${val(bas.v)} (${jour(bas.t)}), plus haut ${val(haut.v)} (${jour(haut.t)})`;

  return (
    `Courbe « ${label} » : ${utiles.length} relevés du ${jour(premier.t)} au ${jour(dernier.t)} ; ` +
    `de ${val(premier.v)} à ${val(dernier.v)}, ${sens} ; ${extremes}.`
  );
}
