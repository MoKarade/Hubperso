// components/Icone.tsx — le jeu d'icônes du hub, en SVG inline.
//
// ── POURQUOI DES SVG ET PAS DES EMOJIS ──────────────────────────────────────────────
//
// Marc, 23/09/2026 : « chiffres et icônes, peu de texte ». Sa règle globale dit par ailleurs
// « pas d'emoji dans l'UI produit », et les deux ne se contredisent pas : un emoji est un
// CARACTÈRE, dessiné par la police du système — donc différent sur Android, sur Windows et
// dans un thème sombre, parfois en couleur imposée qui ignore la teinte de la carte. Un SVG
// inline est un dessin que le hub contrôle, qui hérite de `currentColor` et se met à
// l'échelle du texte. C'est la seule forme qui tienne les deux consignes à la fois.
//
// ⚠️ PAS DE LIBRAIRIE D'ICÔNES, ET CE N'EST PAS UN CHOIX DE GOÛT. La CSP du hub est
// ENFORCÉE avec `default-src 'self'` : un sprite ou un script venu d'un CDN ne se chargerait
// pas. Même raison que `Sparkline`, qui trace son chemin à la main.
//
// ── CE QUI CHOISIT L'ICÔNE N'EST PAS ICI ────────────────────────────────────────────
//
// `iconeSeverite` et `iconeTendance` vivent dans `lib/icones.ts` : le CHOIX est une décision,
// donc il se teste sans rendu ; ce fichier ne fait que peindre. Le garde-fou y est écrit en
// entier — en un mot : une icône se choisit sur un champ du CONTRAT, jamais sur `app.id`.
//
// ⚠️ TOUTES `aria-hidden`. Une icône ne porte jamais l'information seule : elle double un
// mot qui reste écrit à côté. Un lecteur d'écran qui annoncerait « triangle exclamation »
// avant chaque alerte ajouterait du bruit, pas du sens.

import type { NomIcone } from "@/lib/icones";

/**
 * Les tracés, dans une grille 24×24. `fill="none"` + `stroke="currentColor"` : l'icône prend
 * la couleur du texte qui l'entoure, donc elle suit les deux thèmes et la teinte de gravité
 * sans qu'aucune couleur ne soit écrite ici.
 *
 * ⚠️ Aucun code hexadécimal dans ce fichier, volontairement. Une couleur codée en dur
 * rendrait l'icône illisible sur l'un des deux thèmes — et ça ne se voit qu'en basculant.
 */
const TRACES: Record<NomIcone, React.ReactNode> = {
  // Triangle d'avertissement : la gravité la plus haute du contrat.
  alerte: (
    <>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 9.5v4.2" />
      <path d="M12 16.8h.01" />
    </>
  ),
  // Cercle d'exclamation : `warn`. Une forme DIFFÉRENTE du triangle, pas seulement une autre
  // couleur — le daltonisme rend deux ronds de teintes voisines indiscernables.
  attention: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.6v4.6" />
      <path d="M12 15.6h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.2v5" />
      <path d="M12 7.9h.01" />
    </>
  ),
  // Ampoule : une SUGGESTION, pas un problème. Le rendu de la recommandation s'interdit le
  // vocabulaire visuel des alertes (cf. l'en-tête de `Recommandation.tsx`).
  conseil: (
    <>
      <path d="M9.2 17.2a6 6 0 1 1 5.6 0" />
      <path d="M9.6 17.4h4.8" />
      <path d="M10.4 20.3h3.2" />
    </>
  ),
  hausse: (
    <>
      <path d="M4 16.5 10 10l4 4 6-6.5" />
      <path d="M20 12V7.5h-4.5" />
    </>
  ),
  baisse: (
    <>
      <path d="M4 7.5 10 14l4-4 6 6.5" />
      <path d="M20 12v4.5h-4.5" />
    </>
  ),
  horloge: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.3V12l3.1 2" />
    </>
  ),
  // Marqueur de section `details` : trois lignes, la forme d'une liste.
  section: (
    <>
      <path d="M4.5 7.5h15" />
      <path d="M4.5 12h15" />
      <path d="M4.5 16.5h9" />
    </>
  ),
};

export function Icone({ nom, className }: { nom: NomIcone; className?: string }) {
  return (
    <svg
      className={className ? `icone ${className}` : "icone"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRACES[nom]}
    </svg>
  );
}
