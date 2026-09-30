// lib/constellation.ts
//
// Vérifie que la CONSTELLATION est cohérente — pas qu'une app répond, mais que ce que le hub
// croit d'elle et ce qu'elle publie d'elle-même concordent.
//
// Pourquoi ça n'existait pas et pourquoi ça manque : `lib/sources.ts` déclare `id: "driveai"`
// et l'app publie son `app.id` de son côté. La correspondance est tenue À LA MAIN, et rien ne
// la teste. Même chose pour la période des coûts : le contrat laisse chaque app choisir la
// sienne, le hub somme PAR période et n'expose aucun total global — donc une app qui publie
// `mois` pendant que les autres publient `total` se retrouve seule dans sa colonne et empêche
// tout montant unique. Vécu : DriveAI, jusqu'au 2026-08-20.
//
// Aucune de ces incohérences ne casse quoi que ce soit BRUYAMMENT. Le hub affiche, les widgets
// se rendent, la CI est verte. C'est précisément pour ça qu'elles survivent des semaines.
//
// ⚠️ Ce module est PUR : il juge des résultats déjà obtenus. Le réseau est au-dessus
// (`scripts/verifier-constellation.ts`), pour que la logique se teste sans jeton ni réseau.

import type { SummaryResult } from "./fetchSummary";

type GraviteIncoherence = "bloquant" | "avertissement";

export interface Incoherence {
  /** `source.id` tel que déclaré dans `lib/sources.ts`. */
  source: string;
  gravite: GraviteIncoherence;
  /** Étiquette courte et stable, pour grouper. */
  genre:
    | "identite-divergente"
    | "contrat-trop-recent"
    | "hors-contrat"
    | "injoignable"
    | "jeton"
    | "periodes-melangees"
    | "devises-melangees";
  detail: string;
}

/**
 * Juge un lot de résultats de fetch.
 *
 * Retourne la liste VIDE quand tout concorde. L'ordre est stable (bloquants d'abord, puis par
 * source) pour qu'un rapport ne bouge pas d'un run à l'autre sans raison.
 */
export function verifierConstellation(results: readonly SummaryResult[]): Incoherence[] {
  const trouvees: Incoherence[] = [];

  for (const r of results) {
    const source = r.source.id;

    switch (r.state) {
      case "unconfigured":
        trouvees.push({
          source,
          gravite: "avertissement",
          genre: "jeton",
          detail: `aucun jeton configuré (${r.source.name}) — l'app n'est pas interrogée`,
        });
        break;

      case "unauthorized":
        trouvees.push({
          source,
          gravite: "bloquant",
          genre: "jeton",
          detail: "401 — le jeton du hub est refusé par l'app",
        });
        break;

      case "unreachable":
        trouvees.push({
          source,
          gravite: "bloquant",
          genre: "injoignable",
          detail: r.detail,
        });
        break;

      case "contract-too-new":
        trouvees.push({
          source,
          gravite: "bloquant",
          genre: "contrat-trop-recent",
          detail: `l'app publie la version ${r.published}, le hub lit jusqu'à ${r.supported} — re-pinner le HUB (l'app va bien)`,
        });
        break;

      case "invalid":
        trouvees.push({
          source,
          gravite: "bloquant",
          genre: "hors-contrat",
          detail: r.detail,
        });
        break;

      case "ok": {
        // LE contrôle qui n'existait nulle part : le hub et l'app sont-ils d'accord sur QUI
        // est cette app ? Une divergence ne se voit pas à l'écran — le widget s'affiche, avec
        // le bon contenu, sous le bon nom. Elle se paie plus tard, quand quelque chose
        // s'indexe par `app.id` (les accès par app, par exemple).
        if (r.summary.app.id !== r.source.id) {
          trouvees.push({
            source,
            gravite: "bloquant",
            genre: "identite-divergente",
            detail: `sources.ts déclare "${r.source.id}", l'app publie "${r.summary.app.id}"`,
          });
        }
        break;
      }
    }
  }

  // --- cohérence d'AGRÉGAT, qui ne se juge qu'en regardant tout le monde ensemble ---------
  const couts = results.flatMap((r) =>
    r.state === "ok" && r.summary.usage?.cost
      ? [{ source: r.source.id, cost: r.summary.usage.cost }]
      : [],
  );

  const periodes = new Set(couts.map((c) => c.cost.period));
  if (periodes.size > 1) {
    const parPeriode = [...periodes]
      .sort()
      .map((p) => `${p}: ${couts.filter((c) => c.cost.period === p).map((c) => c.source).join(", ")}`)
      .join(" · ");
    trouvees.push({
      source: "(constellation)",
      gravite: "avertissement",
      genre: "periodes-melangees",
      // Pas « bloquant » : le contrat AUTORISE des périodes différentes, et le hub les somme
      // séparément — il ne ment donc jamais. Mais tant qu'elles divergent, aucun montant
      // unique n'est affichable, et ça se constate ici plutôt qu'en regardant l'écran.
      detail: `aucun total unique possible — ${parPeriode}`,
    });
  }

  const devises = new Set(couts.map((c) => c.cost.currency));
  if (devises.size > 1) {
    trouvees.push({
      source: "(constellation)",
      gravite: "avertissement",
      genre: "devises-melangees",
      detail: `devises publiées : ${[...devises].sort().join(", ")} — la conversion est faite côté hub, vérifier son taux`,
    });
  }

  const rang = (i: Incoherence) => (i.gravite === "bloquant" ? 0 : 1);
  return trouvees.sort((a, b) => rang(a) - rang(b) || a.source.localeCompare(b.source));
}

/** Rend le rapport en texte, pour un log de CI ou une sortie de script. */
export function rapportConstellation(incoherences: readonly Incoherence[]): string {
  if (incoherences.length === 0) {
    return "Constellation cohérente : identités concordantes, contrats lisibles, coûts comparables.";
  }
  const lignes = incoherences.map(
    (i) => `${i.gravite === "bloquant" ? "BLOQUANT" : "avertis."}  [${i.genre}] ${i.source} — ${i.detail}`,
  );
  const bloquants = incoherences.filter((i) => i.gravite === "bloquant").length;
  return [
    `${incoherences.length} incohérence(s), dont ${bloquants} bloquante(s) :`,
    ...lignes,
  ].join("\n");
}
