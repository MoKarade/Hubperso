// lib/sentryConfig.ts — réglages Sentry communs au serveur, au navigateur et au script d'essai.
//
// Pur et sans effet de bord : ne lit aucun environnement, ne démarre rien. Le DSN arrive en
// paramètre, et SANS DSN Sentry reste éteint (un fork qui n'a rien configuré démarre et se
// construit sans erreur).
//
// Donnée personnelle (décision de Marc, 15/10/2026 : aucune donnée perso en ligne) : l'adresse IP,
// les cookies, les en-têtes, le corps et la chaîne de requête ne partent JAMAIS. `sendDefaultPii`
// reste faux ET `retirerDonneesPersonnelles` nettoie l'événement en dernier recours. Verrou :
// `tests/sentryConfig.test.ts`.

/** Le sous-ensemble d'un événement Sentry que l'on nettoie (types structurels, aucun import). */
export interface EvenementNettoyable {
  message?: string;
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: unknown;
    query_string?: unknown;
  };
  user?: unknown;
}

/** Retire tout ce qui peut identifier une personne ; garde le message, la pile et le chemin. */
export function retirerDonneesPersonnelles<T extends EvenementNettoyable>(evenement: T): T {
  if (evenement.request) {
    delete evenement.request.data;
    delete evenement.request.cookies;
    delete evenement.request.headers;
    delete evenement.request.query_string;
  }
  delete evenement.user;
  return evenement;
}

export interface OptionsSentry {
  dsn: string | undefined;
  enabled: boolean;
  sendDefaultPii: false;
  tracesSampleRate: 0;
  beforeSend: typeof retirerDonneesPersonnelles;
}

/**
 * Options de `Sentry.init`. `dsn` vide ou absent = éteint : aucun événement ne part.
 * Pas de traces de performance (`tracesSampleRate` à 0) : le besoin est de voir les ERREURS.
 */
export function optionsSentry(dsn: string | undefined): OptionsSentry {
  const propre = dsn?.trim() ? dsn.trim() : undefined;
  return {
    dsn: propre,
    enabled: propre !== undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: retirerDonneesPersonnelles,
  };
}

/**
 * Réglage de l'intégration HTTP serveur de Sentry (Hubperso#702). Par défaut le SDK ouvre une « session » de
 * suivi de santé des versions pour CHAQUE requête entrante et l'envoie à Sentry : sur `/login`, environ deux
 * appels sortants par invocation (7,1 k vus en 24 h le 28/10/2026) pour une fonction qu'on n'utilise pas.
 * Le besoin est de voir les erreurs : elles, partent toujours (`captureRequestError`, `beforeSend` inchangé).
 * `sessions` est l'option de `httpIntegration` de la version installée (`@sentry/node`, `HttpServerIntegrationOptions`).
 */
export const OPTIONS_HTTP_SENTRY = { sessions: false } as const;
