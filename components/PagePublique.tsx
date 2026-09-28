// components/PagePublique.tsx
//
// Squelette GÉNÉRIQUE pour une page publique de texte (confidentialité, conditions…) :
// accessible SANS session — voir lib/authGuard.ts (isPublicPath) — et sans aucune logique
// propre à une app du hub. Une page qui a besoin d'autre chose qu'un titre et du texte
// structuré (données live, formulaire, état d'app) ne doit PAS passer par ce composant.
//
// `maj` est écrite en toutes lettres par l'appelant (pas de `Date.now()` ici) : une date
// calculée au moment du rendu changerait à chaque déploiement sans qu'aucun mot du texte
// n'ait bougé, ce qui serait un mensonge silencieux sur ce qui a réellement changé.

import type { ReactNode } from "react";
import Link from "next/link";

export function PagePublique({
  titre,
  maj,
  children,
}: {
  titre: string;
  /** Date de dernière mise à jour du CONTENU, en toutes lettres (ex. « 28 septembre 2026 »). */
  maj: string;
  children: ReactNode;
}) {
  return (
    <main className="legal">
      <article className="legal__card" aria-labelledby="legal-title">
        <Link className="page__retour" href="/">
          ← Tableau de bord
        </Link>
        <header>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 id="legal-title" className="legal__title">
            {titre}
          </h1>
          <p className="legal__meta">Dernière mise à jour : {maj}</p>
        </header>
        {children}
      </article>
    </main>
  );
}
