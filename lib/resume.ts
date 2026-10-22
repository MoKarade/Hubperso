// lib/resume.ts — la phrase d'état de l'accueil et les points « à regarder ». PUR.
//
// Marc, 22/10/2026 (maquette validée) : « une phrase vraie sur l'état du hub ». Vraie veut
// dire calculée, jamais décorative : elle ne dit « tout est à jour » que si CHAQUE app
// branchée répond à jour, et elle nomme l'app quand une seule pose problème. Les mots des
// états sont ceux du badge de la carte (`lib/status.ts`) : la phrase et la carte ne peuvent
// pas se contredire.
//
// Les points « à regarder » sont les entrées de `lib/attention.ts` (alertes publiées, apps
// muettes, données figées), les plus graves d'abord, au plus `MAX_POINTS`.

import type { SummaryResult } from "./fetchSummary";
import { statusBadge, type Tone } from "./status";
import type { Attention, Gravite } from "./attention";

export const MAX_POINTS = 3;

export interface Resume {
  phrase: string;
  /** Le ton de la phrase : le plus grave des états des apps. */
  ton: "ok" | "warn" | "danger" | "neutre";
  /** Les points à regarder (alertes et avertissements ; les infos n'y sont pas). */
  points: Attention[];
  /** Combien de points de plus que ceux affichés (compté, jamais escamoté). */
  restants: number;
}

const APPS = (n: number) => `${n} app${n > 1 ? "s" : ""}`;

/** `Injoignable` → `injoignable` : le libellé du badge, repris dans la phrase. */
const enMinuscule = (libelle: string) => libelle.charAt(0).toLowerCase() + libelle.slice(1);

export function resumeHub(resultats: SummaryResult[], attentionsListe: Attention[]): Resume {
  const badges = resultats.map((r) => ({
    nom: r.state === "ok" ? r.summary.app.name : r.source.name,
    ...statusBadge(r),
  }));
  const compte = (ton: Tone) => badges.filter((b) => b.tone === ton).length;
  const danger = badges.filter((b) => b.tone === "danger");
  const warn = badges.filter((b) => b.tone === "warn");
  const ok = compte("ok");
  const total = badges.length;

  const graves = attentionsListe.filter((a) => (a.gravite as Gravite) !== "info");
  const points = graves.slice(0, MAX_POINTS);
  const restants = graves.length - points.length;

  const base = { points, restants };

  if (total === 0) {
    return { ...base, ton: "neutre", phrase: "Aucune app n’est déclarée dans le hub." };
  }
  if (danger.length === 1) {
    return { ...base, ton: "danger", phrase: `${danger[0]!.nom} : ${enMinuscule(danger[0]!.label)}.` };
  }
  if (danger.length > 1) {
    return { ...base, ton: "danger", phrase: `${APPS(danger.length)} à régler.` };
  }
  if (warn.length === 1) {
    return { ...base, ton: "warn", phrase: `${warn[0]!.nom} : ${enMinuscule(warn[0]!.label)}.` };
  }
  if (warn.length > 1) {
    return { ...base, ton: "warn", phrase: `${APPS(warn.length)} à surveiller.` };
  }
  // Ni panne ni retard : seules restent des apps à jour, en construction ou non branchées.
  if (ok === total) {
    return { ...base, ton: "ok", phrase: total === 1 ? "L’app est à jour." : "Tout est à jour." };
  }
  if (ok === 0) {
    return { ...base, ton: "neutre", phrase: "Aucune app ne publie encore de données." };
  }
  return {
    ...base,
    ton: "ok",
    phrase: `Tout ce qui est branché est à jour (${ok} sur ${total}).`,
  };
}
