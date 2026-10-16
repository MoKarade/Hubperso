"use client";

// app/error.tsx — écran de secours quand une page du hub plante au rendu.
//
// Sans ce fichier Next affiche son écran d’erreur anglais par défaut. Le message technique
// de l'erreur n'est JAMAIS montré (il peut contenir une adresse interne ou un morceau de
// réponse d'app) : il reste dans la console et les journaux du serveur. Il part aussi à Sentry
// (éteint sans `SENTRY_DSN`, sans donnée personnelle : lib/sentryConfig.ts).

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErreurPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="login">
      <section className="login__card" aria-labelledby="erreur-title">
        <p className="page__eyebrow">hubperso.com</p>
        <h1 id="erreur-title" className="login__title">
          Oups, cette page n’a pas pu s’afficher
        </h1>
        <p className="login__lede">
          Un problème est survenu de notre côté. Réessaie dans un instant ; si ça
          recommence, reviens plus tard.
        </p>
        <button type="button" className="btn" onClick={() => reset()}>
          Réessayer
        </button>
      </section>
    </main>
  );
}
