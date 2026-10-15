"use client";

// components/BoutonAdmin.tsx — bouton d'envoi des formulaires d'Administration.
//
// Ergonomie seulement : la sécurité reste côté serveur (chaque Server Action revérifie
// session ET accès propriétaire). `confirmation` pose une question avant un geste destructeur.

import type { ReactNode } from "react";

export function BoutonAdmin({
  children,
  className,
  confirmation,
  pressed,
}: {
  children?: ReactNode;
  className: string;
  confirmation?: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="submit"
      className={className}
      aria-pressed={pressed}
      onClick={(evenement) => {
        if (confirmation && !window.confirm(confirmation)) {
          evenement.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
