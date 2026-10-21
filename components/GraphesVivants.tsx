"use client";

// components/GraphesVivants.tsx — rend /graphes vivante : un vrai graphe 3D réduit dans chaque carte,
// et l'ouverture du graphe sur place (plein écran dans la page, sans changer de page).
//
// Ne rend rien : le HTML des cartes vient du serveur (et reste complet sans JavaScript, avec le lien
// 2D). Ce composant charge la bibliothèque 3D et le visualiseur du hub (`public/graphes/vue3d.js`),
// puis branche la grille. Sans WebGL, le visualiseur ne branche rien et les constellations restent.

import { useEffect } from "react";
import { LIB3D, VISUALISEUR3D } from "@/lib/grapheVue3d";

interface VisualiseurGlobal {
  activer: (grille: Element | null) => () => void;
}

function charger(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const deja = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (deja?.dataset.charge === "oui") return resolve();
    const s = deja ?? document.createElement("script");
    s.addEventListener("load", () => {
      s.dataset.charge = "oui";
      resolve();
    });
    s.addEventListener("error", () => reject(new Error(`chargement impossible : ${src}`)));
    if (!deja) {
      s.src = src;
      document.head.appendChild(s);
    }
  });
}

export function GraphesVivants() {
  useEffect(() => {
    let vivant = true;
    let arreter = () => {};
    charger(LIB3D)
      .then(() => charger(VISUALISEUR3D))
      .then(() => {
        const v = (window as unknown as { GrapheVue3d?: VisualiseurGlobal }).GrapheVue3d;
        if (vivant && v) arreter = v.activer(document.querySelector(".graphes__grille"));
      })
      .catch((e: unknown) => {
        // Les cartes restent utiles sans la 3D (constellation, bouton 2D) ; on le dit en console.
        console.error("Graphes 3D indisponibles", e);
      });
    return () => {
      vivant = false;
      arreter();
    };
  }, []);
  return null;
}
