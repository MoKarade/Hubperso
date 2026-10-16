"use client";

// components/BoutonEnvoi.tsx — bouton d'envoi des formulaires d'Administration.
//
// Montre « En cours… » pendant l'envoi puis « Fait » un court instant, pour qu'on ne se
// demande plus si le clic a marché. Ergonomie seulement : chaque Server Action revérifie
// session ET accès propriétaire.

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { libelleEnvoi, type EtatEnvoi } from "@/lib/libelleEnvoi";

const DUREE_FAIT_MS = 2000;

export function BoutonEnvoi({
  libelle,
  className,
  pressed,
}: {
  libelle: string;
  className: string;
  pressed?: boolean;
}) {
  const { pending } = useFormStatus();
  const [fait, setFait] = useState(false);
  const etaitEnCours = useRef(false);

  useEffect(() => {
    if (pending) {
      etaitEnCours.current = true;
      return;
    }
    if (!etaitEnCours.current) return;
    etaitEnCours.current = false;
    setFait(true);
    const minuteur = setTimeout(() => setFait(false), DUREE_FAIT_MS);
    return () => clearTimeout(minuteur);
  }, [pending]);

  const etat: EtatEnvoi = pending ? "en-cours" : fait ? "fait" : "repos";

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-pressed={pressed}
      aria-live="polite"
    >
      {libelleEnvoi(libelle, etat)}
    </button>
  );
}
