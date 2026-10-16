"use client";

// app/global-error.tsx — dernier filet : une erreur de rendu que rien d'autre n'attrape (y compris
// celle du layout racine, que `app/error.tsx` ne voit pas). Elle est envoyée à Sentry (éteint sans
// DSN, voir lib/sentryConfig.ts) puis l'écran dit honnêtement qu'il y a eu un problème. Aucun détail
// technique n'est affiché.
//
// Ce fichier REMPLACE le layout racine : `globals.css` n'est pas chargé ici. `colorScheme: dark`
// garde au moins le fond sombre du hub (thème sombre seul), sans aucune couleur écrite.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr-CA" style={{ colorScheme: "dark" }}>
      <body>
        <main>
          <h1>Un problème est survenu</h1>
          <p>L’erreur a été signalée. Recharge la page pour réessayer.</p>
        </main>
      </body>
    </html>
  );
}
