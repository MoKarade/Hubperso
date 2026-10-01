// lib/retour.ts — où a-t-on le droit de renvoyer quelqu'un après sa connexion ?
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────────────
//
// Le hub devient la porte d'entrée unique (ADR 0001). Une personne qui ouvre JobAI sans
// session est envoyée sur `hubperso.com/login`, et doit revenir sur JobAI une fois
// connectée. Or Auth.js REFUSE par défaut toute redirection hors de sa propre origine —
// c'est précisément ce qui protège des redirections ouvertes. Il faut donc lever la
// garde, et une garde qu'on lève se remplace, jamais ne se supprime.
//
// ── LA REDIRECTION OUVERTE, ET POURQUOI ELLE EST DANGEREUSE ICI ─────────────────────
//
// Sans validation, `hubperso.com/login?callbackUrl=https://evil.com` enverrait la
// personne sur un site tiers APRÈS une connexion réussie — sur une page qui a toutes les
// apparences de la légitimité, puisqu'elle vient d'un domaine de confiance. C'est le
// vecteur classique d'hameçonnage : on ne vole pas la session, on emprunte la confiance.
//
// D'où une liste blanche par DOMAINE, pas par motif de texte. Les pièges qu'un
// `startsWith`/`includes` laisserait passer, et que `new URL()` traite correctement :
//
//   https://hubperso.com@evil.com     ← hostname vaut `evil.com` (le reste est un userinfo)
//   https://evil-hubperso.com         ← ne se termine pas par `.hubperso.com`
//   https://x.hubperso.com.evil.com   ← se termine par `.evil.com`
//   http://emploi.hubperso.com        ← bon domaine, mais pas chiffré
//
// Chacun a son test.

/** Le domaine parent de l'écosystème. Identique au `AUTH_COOKIE_DOMAIN` de production. */
const DOMAINE_HUB = "hubperso.com";

/**
 * Cette destination est-elle une app du hub ?
 *
 * Accepte les chemins RELATIFS (`/couts`) — même origine, aucun risque — et les URL
 * absolues en `https` sur `hubperso.com` ou l'un de ses sous-domaines. Refuse tout le
 * reste, y compris ce qui n'est pas analysable.
 */
export function estDestinationDuHub(destination: string, origine: string): boolean {
  const valeur = destination.trim();
  if (!valeur) return false;

  // Chemin relatif : même origine par construction. On exclut `//autre.com`, qui est une
  // URL protocol-relative et non un chemin — la confusion entre les deux est un classique.
  if (valeur.startsWith("/") && !valeur.startsWith("//")) return true;

  let url: URL;
  try {
    url = new URL(valeur, origine);
  } catch {
    return false;
  }

  // `https` seulement : renvoyer en clair vers une app qui porte des données personnelles
  // exposerait le trafic, et le cookie de session est de toute façon `Secure`.
  if (url.protocol !== "https:") return false;

  const hote = url.hostname.toLowerCase();
  return hote === DOMAINE_HUB || hote.endsWith(`.${DOMAINE_HUB}`);
}

/**
 * La destination à utiliser après connexion : celle demandée si elle est légitime,
 * l'origine du hub sinon.
 *
 * ÉCHEC FERMÉ : une destination refusée ne produit pas d'erreur, elle ramène simplement
 * au hub. Une redirection qu'on n'explique pas vaut mieux qu'une redirection qu'on n'a
 * pas voulue.
 */
export function destinationApresConnexion(
  demandee: string | null | undefined,
  origine: string,
): string {
  if (!demandee) return origine;
  return estDestinationDuHub(demandee, origine) ? demandee : origine;
}
