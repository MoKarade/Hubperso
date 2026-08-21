// lib/attention.ts — tout ce qui demande une décision, rassemblé. PUR.
//
// ── LE PROBLÈME QUE ÇA RÈGLE ────────────────────────────────────────────────────────
//
// Pour savoir s'il y a un problème quelque part, il fallait BALAYER cinq widgets et lire
// chacun. Avec cinq apps publiant jusqu'à dix alertes chacune, la question « est-ce que
// quelque chose ne va pas ? » demandait de tout lire — donc, en pratique, de ne rien lire.
//
// ── CE QUI COMPTE COMME « DEMANDANT DE L'ATTENTION » ────────────────────────────────
//
// Les alertes publiées par les apps, ÉVIDEMMENT. Mais pas seulement, et c'est le point :
// une app INJOIGNABLE ne publie aucune alerte. Elle n'a rien à dire, justement parce
// qu'elle est muette. Un agrégat qui ne rassemblerait que les `alerts` du contrat serait
// donc silencieux exactement quand quelque chose de grave se passe — et il aurait l'air
// rassurant, ce qui est pire que rien.
//
// Les états d'échec du hub sont donc convertis en entrées de plein droit, avec la même
// sévérité que ce qu'ils valent :
//   - injoignable / non autorisée / réponse invalide  → `alert` : il y a quelque chose à réparer ;
//   - contrat trop récent                             → `warn`  : l'APP va bien, c'est le hub
//     qui est à re-pinner. Le ton dit à qui est le problème, comme partout ailleurs ;
//   - non configurée                                  → IGNORÉE : une app sans jeton est un
//     choix, pas une panne. La signaler chaque jour apprendrait à ignorer la liste.

import type { HubAlert } from "@mokarade/hub-contract";
import type { SummaryResult } from "./fetchSummary";
import { safeHttpUrl } from "./url";

export type Gravite = "alert" | "warn" | "info";

export interface Attention {
  appId: string;
  appNom: string;
  gravite: Gravite;
  libelle: string;
  /** Deep link publié par l'app, filtré. `null` quand il n'y en a pas ou qu'il est refusé. */
  href: string | null;
  /** `true` quand l'entrée vient du HUB (app muette), pas d'une alerte publiée. */
  duHub: boolean;
}

const RANG: Record<Gravite, number> = { alert: 0, warn: 1, info: 2 };

/**
 * Rassemble et trie. Le plus grave d'abord ; à gravité égale, l'ordre des apps est celui de
 * `sources.ts` — stable, donc la liste ne se réordonne pas sous les yeux à chaque poll.
 *
 * ⚠️ Le tri est STABLE par construction (`Array.prototype.sort` l'est depuis ES2019) : deux
 * entrées de même gravité gardent leur ordre d'arrivée. Sans ça, la liste danserait à chaque
 * rafraîchissement et on ne pourrait plus cliquer sur une ligne qu'on vient de lire.
 */
export function attentions(resultats: SummaryResult[]): Attention[] {
  const entrees: Attention[] = [];

  for (const resultat of resultats) {
    const appId = resultat.source.id;
    const appNom = resultat.state === "ok" ? resultat.summary.app.name : resultat.source.name;

    if (resultat.state === "ok") {
      for (const alerte of resultat.summary.alerts) {
        entrees.push({
          appId,
          appNom,
          gravite: alerte.severity as Gravite,
          libelle: alerte.label,
          href: hrefAlerte(alerte),
          duHub: false,
        });
      }
      continue;
    }

    const duHub = entreeDuHub(resultat, appId, appNom);
    if (duHub) entrees.push(duHub);
  }

  return entrees.sort((a, b) => RANG[a.gravite] - RANG[b.gravite]);
}

function hrefAlerte(alerte: HubAlert): string | null {
  return alerte.href ? safeHttpUrl(alerte.href) : null;
}

/**
 * L'état d'échec vu par le hub, converti en entrée — ou `null` quand il n'y a rien à dire.
 *
 * `unconfigured` rend `null` : une app sans jeton n'est pas en panne, elle n'est pas branchée.
 * L'inscrire dans la liste des choses à regarder la remplirait d'un bruit permanent, et une
 * liste toujours pleine ne se lit plus.
 */
function entreeDuHub(
  resultat: SummaryResult,
  appId: string,
  appNom: string,
): Attention | null {
  const base = { appId, appNom, href: null, duHub: true as const };

  switch (resultat.state) {
    case "unconfigured":
      return null;
    case "unreachable":
      return { ...base, gravite: "alert", libelle: `Injoignable — ${resultat.detail}` };
    case "unauthorized":
      return { ...base, gravite: "alert", libelle: "Jeton refusé (401) — vérifier x-hub-token" };
    case "invalid":
      return { ...base, gravite: "alert", libelle: `Réponse hors contrat — ${resultat.detail}` };
    case "contract-too-new":
      return {
        ...base,
        gravite: "warn",
        libelle: `Publie le contrat v${resultat.published} ; ce hub lit jusqu’à v${resultat.supported} — re-pinner le hub`,
      };
    default:
      return null;
  }
}

/** Combien de choses graves ? Sert au bandeau d'en-tête, qui ne s'affiche que s'il y en a. */
export function compteParGravite(liste: Attention[]): Record<Gravite, number> {
  return liste.reduce(
    (acc, e) => ({ ...acc, [e.gravite]: acc[e.gravite] + 1 }),
    { alert: 0, warn: 0, info: 0 } as Record<Gravite, number>,
  );
}
