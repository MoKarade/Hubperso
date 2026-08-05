"use client";

// components/ServiceWorker.tsx
//
// Enregistre `/sw.js`, uniquement pour rendre le hub INSTALLABLE sur PC et Android
// (Chromium exige un service worker actif pour proposer « Installer l'application » ;
// iOS s'en passe et n'a besoin que du manifeste).
//
// Le worker lui-même ne met RIEN en cache — voir l'en-tête de `public/sw.js`. Il n'y a
// donc aucun risque que le hub affiche une page ou des chiffres périmés à cause de lui.
//
// Silencieux par conception : si l'enregistrement échoue (navigateur sans support, mode
// privé, contexte non sécurisé), l'app fonctionne exactement pareil — elle n'est
// simplement pas installable. On n'affiche pas d'erreur pour une capacité optionnelle,
// mais on ne l'avale pas non plus en silence total : la console garde la trace.

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("Service worker non enregistré — le hub reste utilisable, mais pas installable.", err);
    });
  }, []);

  return null;
}
