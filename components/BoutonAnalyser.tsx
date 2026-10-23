"use client";

import { EVENEMENT_LIA_VOIR } from "@/lib/lia";

// « Analyser » : envoie LIA se coller à la carte de l'app et en dire l'état. Le bouton ne détient pas
// LIA (un composant serveur ne tient pas sa poignée) : il prévient la fenêtre, `LiaHub` écoute. Sans
// LIA (chargement, JavaScript coupé), rien ne se passe : le lien « Voir » à côté mène à la page de l'app.
export function BoutonAnalyser({ appId, appNom }: { appId: string; appNom: string }) {
  return (
    <button
      type="button"
      className="btn resume__analyser"
      onClick={() => window.dispatchEvent(new CustomEvent(EVENEMENT_LIA_VOIR, { detail: { appId } }))}
    >
      Analyser<span className="sr-only"> {appNom}</span>
    </button>
  );
}
