// instrumentation.ts — branche Sentry côté serveur (Next 16 appelle `register` au démarrage).
//
// Le DSN vient de `SENTRY_DSN` ; absent, `optionsSentry` éteint Sentry et rien ne change.
// Les réglages (aucune donnée personnelle) vivent dans lib/sentryConfig.ts.

import * as Sentry from "@sentry/nextjs";
import { OPTIONS_HTTP_SENTRY, optionsSentry } from "@/lib/sentryConfig";

export function register(): void {
  const options = optionsSentry(process.env.SENTRY_DSN);
  // Le suivi de sessions par requête est coupé (Hubperso#702) : il doublait les appels sortants de `/login`.
  // `httpIntegration` n'existe que dans le SDK du serveur Node : le runtime edge garde ses réglages par défaut.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({ ...options, integrations: [Sentry.httpIntegration(OPTIONS_HTTP_SENTRY)] });
    return;
  }
  Sentry.init(options);
}

// Remonte les erreurs des Server Components, des routes et des Server Actions.
export const onRequestError = Sentry.captureRequestError;
