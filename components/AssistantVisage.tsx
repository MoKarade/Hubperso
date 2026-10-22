"use client";

// components/AssistantVisage.tsx — le visage de l'assistant, au cœur de la constellation.
//
// Marc, 22/10/2026 : « go pour le visage » (cartoon, une centaine d'expressions, plus humain que
// foyer / lentille / orbe). Un <canvas> dessiné par `lib/visage/` : sphère de verre, yeux,
// sourcils, bouche. L'expression change avec l'ACTION (repos, écoute, réflexion, consulte,
// réponse, indisponible) ; `etat` vient d'ailleurs (chantier Hubperso#292), ce composant ne
// décide de rien. Sans JavaScript : l'orbe de verre du CSS (`.visage`). Mouvement réduit : une
// image fixe.
//
// Décoratif pour l'instant (`aria-hidden` posé par le parent) : l'assistant n'est pas encore
// branché, on ne l'annonce pas à un lecteur d'écran. Quand #292 le branche, ce composant
// deviendra une image nommée (`role="img"`, libellé = `LIBELLES[etat]`) et la légende sera lue.

import { useEffect, useRef } from "react";
import { lancerVisage, type Environnement, type Pilote } from "@/lib/visage/boucle";
import { LEGENDES, type EtatAssistant } from "@/lib/visage/etats";

/** L'environnement réel : le navigateur. */
function environnementNavigateur(): Environnement {
  return {
    image: (rappel) => requestAnimationFrame(rappel),
    annulerImage: (id) => cancelAnimationFrame(id),
    densite: () => window.devicePixelRatio || 1,
    mouvementReduit: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    observerTaille(hote, rappel) {
      const o = new ResizeObserver((entrees) => {
        const largeur = entrees[0]?.contentRect.width;
        if (largeur) rappel(largeur);
      });
      o.observe(hote);
      rappel(hote.clientWidth);
      return () => o.disconnect();
    },
    observerVisibilite(hote, rappel) {
      // Marge de 120 px : le visage se remet à bouger un peu avant d'entrer à l'écran.
      const o = new IntersectionObserver((entrees) => entrees.forEach((e) => rappel(e.isIntersecting)), {
        rootMargin: "120px",
      });
      o.observe(hote);
      return () => o.disconnect();
    },
  };
}

export function AssistantVisage({
  etat = "repos",
  cible,
  expression,
}: {
  etat?: EtatAssistant;
  /** Angle (rad) de l'app consultée, depuis le centre. */
  cible?: number;
  /** Impose une expression (id de `lib/visage/expressions.ts`) : captures et essais. */
  expression?: string;
}) {
  const hote = useRef<HTMLSpanElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const pilote = useRef<Pilote | null>(null);
  const depart = useRef({ etat, cible, expression });

  useEffect(() => {
    if (!hote.current || !toile.current) return;
    const p = lancerVisage(hote.current, toile.current, environnementNavigateur(), depart.current);
    pilote.current = p;
    return () => {
      p.arreter();
      pilote.current = null;
    };
  }, []);
  useEffect(() => pilote.current?.etat(etat), [etat]);
  useEffect(() => {
    if (cible !== undefined) pilote.current?.viser(cible);
  }, [cible]);
  useEffect(() => pilote.current?.imposer(expression ?? null), [expression]);

  const legende = LEGENDES[etat];
  return (
    <span ref={hote} className="visage" data-etat={etat}>
      <canvas ref={toile} className="visage__toile" />
      {legende && <span className="visage__legende">{legende}</span>}
    </span>
  );
}
