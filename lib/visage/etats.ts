// lib/visage/etats.ts — les six actions de l'assistant et ce que chacune change dans son corps.
//
// Les six états viennent du chantier « Assistant du hub » (Hubperso#292) : repos, écoute,
// réflexion, consulte (seulement sur un appel réel), réponse, indisponible (plafond IA atteint ou
// panne). Ici on ne décide RIEN de l'état : on le DESSINE (`components/AssistantVisage.tsx`
// reçoit `etat`). Tant que rien ne le branche, l'accueil montre `repos`.

export const ETATS = ["repos", "ecoute", "reflexion", "consulte", "reponse", "indispo"] as const;
export type EtatAssistant = (typeof ETATS)[number];

/** Ce que le corps de l'assistant fait dans chaque action (valeurs visées, atteintes en douceur). */
export interface Corps {
  /** Vitesse de rotation des lueurs du verre. */
  spin: number;
  /** Intensité du halo. */
  glow: number;
  /** Faisceau vers l'app consultée (0 ou 1). */
  beam: number;
  /** Désaturation : 1 = tout gris (indisponible). */
  grey: number;
  /** Opacité du verre. */
  life: number;
}

export const CORPS: Record<EtatAssistant, Corps> = {
  repos: { spin: 0.05, glow: 0.5, beam: 0, grey: 0, life: 1 },
  ecoute: { spin: 0.08, glow: 0.75, beam: 0, grey: 0, life: 1 },
  reflexion: { spin: 0.6, glow: 0.85, beam: 0, grey: 0, life: 1 },
  consulte: { spin: 0.14, glow: 0.8, beam: 1, grey: 0, life: 1 },
  reponse: { spin: 0.1, glow: 1, beam: 0, grey: 0, life: 1 },
  indispo: { spin: 0, glow: 0.04, beam: 0, grey: 1, life: 0.55 },
};

/** Le petit mot sous le visage. Au repos : rien, l'assistant n'a rien à dire. */
export const LEGENDES: Record<EtatAssistant, string> = {
  repos: "",
  ecoute: "Je t'écoute",
  reflexion: "Je réfléchis",
  consulte: "Je consulte",
  reponse: "Voilà",
  indispo: "Hors ligne",
};

/** Le nom de l'action pour un lecteur d'écran. */
export const LIBELLES: Record<EtatAssistant, string> = {
  repos: "au repos",
  ecoute: "à l'écoute",
  reflexion: "en réflexion",
  consulte: "consulte une app",
  reponse: "répond",
  indispo: "indisponible",
};

export function estEtat(valeur: string): valeur is EtatAssistant {
  return (ETATS as readonly string[]).includes(valeur);
}
