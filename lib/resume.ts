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

/** Les nombres de la maquette en toutes lettres : « Deux apps sont à jour. » ; au-delà, des chiffres. */
const MOTS = ["aucune", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];
const enToutesLettres = (n: number) => MOTS[n] ?? String(n);

/** Au-delà, la phrase compte au lieu de nommer : une phrase n'est pas une liste. */
const MAX_NOMMEES = 3;

/**
 * Ce que la phrase dit d'une app qui ne va pas : les mêmes faits que le badge et que la phrase de LIA
 * (`lib/liaParole.ts`), jamais d'autres. `null` : rien à en dire (à jour, en construction, non branchée).
 */
function clauseDe(r: SummaryResult): string | null {
  switch (r.state) {
    case "unconfigured":
      return null;
    case "unauthorized":
      return "refuse l’accès du hub";
    case "unreachable":
      return "ne répond plus";
    case "invalid":
      return "a une réponse invalide";
    case "contract-too-new":
      return "publie un contrat plus récent que le hub";
    case "ok":
      if (r.stale) return "n’a pas répondu à temps";
      if (r.summary.status === "degraded") return "a du retard";
      if (r.summary.status === "error") return "est en erreur";
      return null;
  }
}

/** « A, B et C » : la liste de la maquette, sans virgule avant le dernier. */
const enListe = (morceaux: string[]) => morceaux.join(", ").replace(/, ([^,]*)$/, " et $1");

export function resumeHub(resultats: SummaryResult[], attentionsListe: Attention[]): Resume {
  const badges = resultats.map((r) => ({
    nom: r.state === "ok" ? r.summary.app.name : r.source.name,
    id: r.source.id,
    clause: clauseDe(r),
    ...statusBadge(r),
  }));
  const compte = (ton: Tone) => badges.filter((b) => b.tone === ton).length;
  const danger = badges.filter((b) => b.tone === "danger");
  const warn = badges.filter((b) => b.tone === "warn");
  const total = badges.length;

  const graves = attentionsListe.filter((a) => (a.gravite as Gravite) !== "info");
  const points = graves.slice(0, MAX_POINTS);
  const restants = graves.length - points.length;

  const base = { points, restants };

  // Une app « à jour » n'a ni panne ni retard ni point à regarder : celle dont le badge est vert mais
  // dont une alerte est affichée n'est pas comptée, jamais « à jour » au-dessus d'une pastille rouge.
  const avecPoints = new Set(graves.map((a) => a.appId));
  const aJour = badges.filter((b) => b.tone === "ok" && !avecPoints.has(b.id)).length;

  // Ce qui ne va pas, les pannes d'abord, puis les retards, puis les points affichés par une app qui répond.
  const dits = [...danger, ...warn].map((b) => `${b.nom} ${b.clause ?? b.label.toLowerCase()}`);
  const nommes = new Set([...danger, ...warn].map((b) => b.id));
  const parApp = new Map<string, { nom: string; n: number }>();
  for (const a of graves) {
    if (nommes.has(a.appId)) continue;
    const acc = parApp.get(a.appId) ?? { nom: a.appNom, n: 0 };
    acc.n += 1;
    parApp.set(a.appId, acc);
  }
  for (const { nom, n } of parApp.values()) dits.push(`${nom} a ${n} point${n > 1 ? "s" : ""} à regarder`);

  if (total === 0) {
    return { ...base, ton: "neutre", phrase: "Aucune app n’est déclarée dans le hub." };
  }
  if (dits.length > 0) {
    const ton = danger.length > 0 || graves.some((a) => (a.gravite as Gravite) === "alert") ? "danger" : "warn";
    // L'état d'ensemble d'abord (combien vont bien), puis ce qui compte : la phrase de la maquette.
    const ensemble =
      aJour === 0
        ? ""
        : `${enToutesLettres(aJour).replace(/^./, (c) => c.toUpperCase())} app${aJour > 1 ? "s" : ""} ${aJour > 1 ? "sont" : "est"} à jour. `;
    const detail =
      dits.length > MAX_NOMMEES ? `${APPS(dits.length)} à régler ou à surveiller.` : `${enListe(dits)}.`;
    return { ...base, ton, phrase: `${ensemble}${detail}` };
  }
  const ok = compte("ok");
  // Ni panne ni retard ni point à regarder : seules restent des apps à jour, en construction ou non branchées.
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
