// lib/coutMois.ts — ce que chaque app a dépensé CE MOIS-CI, déduit des relevés du hub.
// PUR : aucune base, aucun réseau (les relevés se passent en paramètre, l'instant aussi).
//
// ── POURQUOI C'EST UNE DIFFÉRENCE, ET POURQUOI C'EST UNE ESTIMATION ─────────────────
// Aucune app ne publie un coût « mois » (elles publient toutes le cumul, période `total` :
// voir `lib/coutCumule.ts`). La dépense du mois est donc la différence entre le dernier cumul
// relevé et le dernier cumul relevé AVANT le début du mois (heure de Marc, `FUSEAU`). C'est une
// estimation au grain du relevé, jamais une mesure de l'app : la réponse le dit (`partiel`).
//
// Règles de non-mensonge :
//  - Pas de relevé avant le 1er : on part du PREMIER relevé du mois, et la ligne est `partiel`
//    (la dépense d'avant ce relevé est ignorée, le vrai chiffre est au moins aussi grand).
//  - Pas de relevé ce mois-ci, un seul relevé sans point de départ, ou un cumul qui a
//    RECULÉ (compteur remis à zéro) : l'app est « non lisible » ce mois-ci, jamais 0.
//  - Les deux termes sont convertis en CAD un par un (`toCad`), comme le cumulé.

import { FUSEAU } from "@/lib/fuseau";
import type { Releve } from "@/lib/historique";
import { toCad } from "@/lib/usage";

/** Instant (ms) du minuit du 1er du mois en cours, à l'heure de Marc. */
export function debutDuMois(maintenant: number): number {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date(maintenant));
  const annee = Number(parties.find((p) => p.type === "year")?.value);
  const mois = Number(parties.find((p) => p.type === "month")?.value);
  // Minuit du 1er « lu comme de l'UTC », puis décalé de l'écart du fuseau À CET INSTANT : le
  // changement d'heure ne tombe jamais un 1er à minuit, un seul passage suffit.
  const minuitUtc = Date.UTC(annee, mois - 1, 1);
  return minuitUtc - ecartFuseauMs(minuitUtc);
}

function ecartFuseauMs(instant: number): number {
  const p: Record<string, number> = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSEAU,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(new Date(instant))
      .map((x) => [x.type, Number(x.value)]),
  );
  const n = (cle: string) => p[cle] ?? 0;
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - instant;
}

/** Ce que `depenseDuMois` calcule : le détail par app reste interne, il ne sort jamais de la route. */
export type DepenseDuMois = ReturnType<typeof depenseDuMois>;

/**
 * La part PUBLIQUE de la dépense du mois : les totaux seulement (oui de Marc, 16/10/2026). Liste
 * blanche explicite, pas un « tout sauf `apps` » : un champ ajouté plus tard à `depenseDuMois`
 * ne devient pas public sans qu'on l'écrive ici.
 */
export function totauxDuMois(d: DepenseDuMois) {
  return {
    debut: d.debut,
    totalCad: d.totalCad,
    partiel: d.partiel,
    nonLisibles: d.nonLisibles,
    dernierReleve: d.dernierReleve,
  };
}

export function depenseDuMois(
  appIds: readonly string[],
  debutMs: number,
  derniers: readonly Releve[],
  avant: readonly Releve[],
  apres: readonly Releve[],
) {
  const parApp = (liste: readonly Releve[]) => new Map(liste.map((r) => [r.appId, r]));
  const dernier = parApp(derniers);
  const avantDebut = parApp(avant);
  const premierDuMois = parApp(apres);

  const apps: { id: string; cad: number; partiel: boolean }[] = [];
  const nonLisibles: string[] = [];
  let plusRecent: number | null = null;

  for (const id of appIds) {
    const fin = dernier.get(id);
    const depart = avantDebut.get(id) ?? premierDuMois.get(id);
    const partiel = !avantDebut.has(id);
    const utilisable = (r: Releve | undefined): r is Releve & { cout: NonNullable<Releve["cout"]> } =>
      r?.cout?.periode === "total" && r.cout.montant >= 0;

    if (
      !utilisable(fin) ||
      !utilisable(depart) ||
      fin.releveLe < debutMs ||
      depart.releveLe >= fin.releveLe
    ) {
      nonLisibles.push(id);
      continue;
    }
    const cad = toCad(fin.cout.montant, fin.cout.devise) - toCad(depart.cout.montant, depart.cout.devise);
    if (cad < 0) {
      nonLisibles.push(id);
      continue;
    }
    apps.push({ id, cad: Math.round(cad * 100) / 100, partiel });
    plusRecent = plusRecent === null ? fin.releveLe : Math.max(plusRecent, fin.releveLe);
  }

  return {
    debut: new Date(debutMs).toISOString(),
    totalCad: apps.length === 0 ? null : Math.round(apps.reduce((s, a) => s + a.cad, 0) * 100) / 100,
    /** Vrai si au moins une ligne part du premier relevé du mois faute d'un relevé avant le 1er. */
    partiel: apps.some((a) => a.partiel),
    apps,
    nonLisibles,
    dernierReleve: plusRecent === null ? null : new Date(plusRecent).toISOString(),
  };
}
