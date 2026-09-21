// lib/declencher.ts — l'exécution d'une action `kind: "trigger"` publiée par une app.
//
// Le contrat prévoit deux sortes d'actions. `link` : le NAVIGATEUR de Marc ouvre l'URL.
// `trigger` : le SERVEUR du hub fait un POST, avec le jeton de l'app en main. La seconde
// est d'une autre nature — ce n'est plus un clic qui part d'un poste, c'est une requête
// qui part du réseau du hub, avec une créance.
//
// ── LE RISQUE, NOMMÉ ────────────────────────────────────────────────────────────────
//
// Un `href` est une chaîne fournie par une app. Si le hub POSTe simplement là où on le lui
// demande, il devient un relais SSRF : « POSTe donc sur http://169.254.169.254/… » atteint
// depuis le hub ce qu'aucune app ne peut atteindre elle-même, et y porte un jeton valide.
// Le mode d'échec est SILENCIEUX — la requête part, réussit, et rien à l'écran ne le dit.
//
// Quatre verrous. Tous nécessaires, aucun suffisant seul :
//
//   1. `safeHttpUrl` — http(s) uniquement. `javascript:`, `file:`, `data:` sont refusés,
//      alors que le `z.string().url()` du contrat les accepte.
//   2. L'action doit être PUBLIÉE par l'app, dans un résumé refetché À L'INSTANT, avec
//      `kind === "trigger"`. Un href fabriqué côté client ne passe pas : le hub ne fait
//      confiance qu'à ce que l'app vient de dire d'elle-même.
//   3. MÊME ORIGINE que le `summaryUrl` de la source. C'est le verrou qui tient même quand
//      l'app est compromise ou boguée : le jeton lui appartient, il ne sort pas de chez
//      elle, et le hub ne POSTe jamais sur un hôte tiers. Sans lui, le verrou 2 ne protège
//      de rien — c'est l'app qui décide de ce qu'elle publie.
//   4. AUCUNE redirection suivie (`redirect: "manual"`). C'est le contournement classique
//      du verrou 3 : l'app publie un href chez elle, répond `302` vers l'adresse interne,
//      et `fetch` suit sans rien dire. Ici un 3xx est un ÉCHEC, pas une étape.
//
// ── CE QUI N'EST PAS COUVERT, ET POURQUOI C'EST ÉCRIT ───────────────────────────────
//
// Le DNS rebinding : l'origine vérifiée résout vers une IP interne entre la vérification et
// le POST. Les origines admises sont des sous-domaines `hubperso.com` servis par Vercel ;
// s'en prémunir demanderait de résoudre puis d'épingler l'IP soi-même, ce que `fetch` ne
// permet pas. Dit ici plutôt que passé sous silence — une défense qu'on croit avoir est
// pire qu'une défense qu'on sait ne pas avoir.
//
// La réponse de l'app n'est JAMAIS renvoyée telle quelle à l'écran : seul son code HTTP
// remonte. Un corps contrôlé par l'app n'a pas à être réfléchi dans le hub.

import { HUB_TOKEN_HEADER, type HubSummary } from "@mokarade/hub-contract";
import type { HubSource } from "./sources";
import { safeHttpUrl } from "./url";

/** Budget d'attente du POST. Aligné sur celui de `fetchSummary` (mêmes réveils à froid). */
const TIMEOUT_MS = 9000;

export type RaisonRefus = "href-invalide" | "action-inconnue" | "origine-etrangere";

export type VerdictAction =
  | { ok: true; href: string }
  | { ok: false; refus: RaisonRefus; detail: string };

/**
 * PURE — aucun réseau, aucune horloge, aucune base.
 *
 * Décide si `hrefDemande` peut être POSTé pour cette source, au vu du résumé que l'app
 * vient de publier. C'est la fonction qui porte la sécurité, donc c'est celle qui doit
 * pouvoir se tester sans rien monter (cf. `tests/declencher.test.ts`).
 */
export function verifierAction(params: {
  summary: HubSummary;
  hrefDemande: string;
  summaryUrl: string;
}): VerdictAction {
  const { summary, hrefDemande, summaryUrl } = params;

  // Verrou 1 — le protocole.
  const href = safeHttpUrl(hrefDemande);
  if (!href) {
    return { ok: false, refus: "href-invalide", detail: "href absent ou non http(s)" };
  }

  // Verrou 2 — l'app l'a publiée, et comme `trigger`. Une action `link` n'est PAS
  // déclenchable : elle est faite pour être ouverte par un navigateur, pas POSTée.
  const publiee = summary.actions.some(
    (action) => action.kind === "trigger" && safeHttpUrl(action.href) === href,
  );
  if (!publiee) {
    return {
      ok: false,
      refus: "action-inconnue",
      detail: "aucune action `trigger` publiée à l'instant ne porte cet href",
    };
  }

  // Verrou 3 — l'origine. `URL.origin` inclut le port : un href sur un autre port de la
  // même machine est déjà une autre origine, et c'est voulu.
  const origineApp = origine(summaryUrl);
  const origineCible = origine(href);
  if (!origineApp || origineCible !== origineApp) {
    return {
      ok: false,
      refus: "origine-etrangere",
      detail: `cible ${origineCible ?? "illisible"} hors de l'origine de l'app (${origineApp ?? "illisible"})`,
    };
  }

  return { ok: true, href };
}

function origine(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export type ResultatDeclenchement =
  | { etat: "ok"; statut: number }
  | { etat: "refuse"; refus: RaisonRefus; detail: string }
  | { etat: "non-configuree" }
  | { etat: "echec"; detail: string };

/**
 * Vérifie puis POSTe. Le résumé est passé en paramètre — refetché LIVE par l'appelant,
 * jamais tiré du cache de résilience : voir `fetchSummaryLive`.
 */
export async function posterAction(params: {
  source: HubSource;
  summary: HubSummary;
  hrefDemande: string;
  fetchImpl?: typeof fetch;
}): Promise<ResultatDeclenchement> {
  const { source, summary, hrefDemande, fetchImpl = fetch } = params;

  // Une app sans jeton configuré n'est pas interrogée — et encore moins mutée.
  // ⚠️ Et sans URL de résumé non plus : le verrou 3 compare l'origine de la cible à celle
  // du `summaryUrl`. Sans lui il n'y a AUCUNE origine de référence, donc plus de verrou —
  // exactement le cas que ce module existe pour empêcher. On refuse AVANT, plutôt que de
  // laisser `origine(null)` rendre `null` et compter sur le message d'erreur.
  if (!source.token || !source.summaryUrl) return { etat: "non-configuree" };

  const verdict = verifierAction({
    summary,
    hrefDemande,
    summaryUrl: source.summaryUrl,
  });
  if (!verdict.ok) {
    return { etat: "refuse", refus: verdict.refus, detail: verdict.detail };
  }

  let reponse: Response;
  try {
    reponse = await fetchImpl(verdict.href, {
      method: "POST",
      headers: { [HUB_TOKEN_HEADER]: source.token, accept: "application/json" },
      cache: "no-store",
      // Verrou 4. Côté serveur (undici), `manual` rend la vraie réponse 3xx — on peut donc
      // la voir et la refuser. Ne pas confondre avec le comportement navigateur, où elle
      // serait opaque : ce code ne tourne QUE sur le serveur.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const detail =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? `délai dépassé (${TIMEOUT_MS} ms)`
          : err.message
        : String(err);
    return { etat: "echec", detail };
  }

  // Un 3xx n'est pas un succès partiel : c'est une tentative de sortir de l'origine qu'on
  // vient de vérifier. On le nomme comme tel plutôt que de le ranger dans « échec HTTP ».
  if (reponse.status >= 300 && reponse.status < 400) {
    return {
      etat: "refuse",
      refus: "origine-etrangere",
      detail: `redirection ${reponse.status} refusée (le POST ne suit aucune redirection)`,
    };
  }

  if (!reponse.ok) return { etat: "echec", detail: `HTTP ${reponse.status}` };

  return { etat: "ok", statut: reponse.status };
}
