# ADR 0007 — Le cœur de la constellation est le visage de l'assistant

- **Statut** : accepté par Marc le 22/10/2026 (« go pour visage, enregistré ») — rattaché à Hubperso#286 (refonte de l'accueil, PR #290).
- **Portée** : `components/AssistantVisage.tsx`, `lib/visage/`, le cœur de `components/ConstellationVivante.tsx` ; les logos des apps passent en série A (`components/LogoApp.tsx`).

## Contexte

Marc voulait que le rond central soit l'assistant partagé du hub (type Jarvis), « plus visuel, plus humain, quand il réfléchit et tout, pas le style ». Cinq pistes ont été montrées dans une maquette vivante : lentille, orbe, présence, regard, voix. Aucune n'a convaincu ; Marc a demandé « un visage, un peu plus cartoon, avec beaucoup plus d'animation, une centaine d'expressions ». La version à visage a été retenue.

## Décision

- **Un visage cartoon** dessiné sur un `<canvas>` : sphère de verre aux lueurs qui tournent, deux yeux (iris, pupille, reflets, paupières), deux sourcils, une bouche, des joues, des accessoires de bande dessinée (cœurs, étoiles, ampoule, engrenages, ZZZ…). **124 expressions** en 14 catégories (`lib/visage/expressions.ts`). Les réglages passent par des ressorts : l'expression rebondit au lieu de claquer.
- **Six actions** (les états du chantier Hubperso#292) : `repos`, `écoute`, `réflexion`, `consulte` (seulement sur un appel réel), `réponse`, `indisponible` (plafond IA atteint ou panne). Chacune choisit dans sa liste d'expressions (une toutes les 2,4 s) et règle le corps (vitesse du verre, halo, faisceau vers l'app consultée, gris). L'action se lit sur le VISAGE, avant tout libellé.
- **Le composant ne décide de rien** : `etat` arrive en propriété. Tant que #292 ne le branche pas, l'accueil montre `repos` et aucune légende ; le visage est `aria-hidden` (l'assistant n'existe pas encore, on ne l'annonce pas). Au branchement : `role="img"` et libellé `LIBELLES[etat]`.
- **Logos des apps : série A** (pièce au dollar, voiture, loupe, marmite, arborescence, strates), avec l'étincelle IA comme signature commune. MemoryAI a donc un logo : plus aucune app du hub n'est sans logo.
- **Palette de l'assistant** : indigo de marque au repos, teinte propre selon l'action (voir ADR 0006). Les couleurs du canvas sont des triplets dans `lib/visage/couleur.ts` (un `<canvas>` ne lit pas le CSS) ; `rg` est le seul endroit qui écrit `rgba(`, exception nommée de `tests/theme.test.ts`, et `MARQUE` est verrouillée sur `--marque` (`tests/visage.test.ts`).

## Garde-fous de performance et d'accessibilité

- Une seule boucle par visage ; elle ne dessine que lorsque le visage est à l'écran (IntersectionObserver, marge 120 px) ; définition du canvas = 230 % de l'élément × densité d'écran, **plafonnée à 2**.
- **Mouvement réduit** : une image fixe dessinée une fois, rien ne tourne ensuite.
- Sans JavaScript, ou avant la première image : une sphère de verre en CSS (`.visage::before`).
- La cadence n'est PAS garantie : ~58 à 60 images/s mesurées en rendu logiciel sans GPU ; 120 images/s dépendent de l'écran et du navigateur de Marc [À vérifier sur son appareil].

## Alternatives écartées

- Lentille, orbe, présence, regard, voix (pistes montrées à Marc le 21/10) : pas assez « humaines ».
- Un visage en SVG animé par CSS : cent expressions × yeux/bouche/accessoires donneraient des centaines de règles ; le canvas garde les expressions en DONNÉES testables.
- Une bibliothèque d'animation (Lottie, Rive) : une dépendance de plus pour un dessin que quelques centaines de lignes de TypeScript suffisent à porter.

## Reste à faire

- Brancher les six états sur les vrais événements de l'assistant (Hubperso#292).
- Les mêmes logos série A dans les autres apps et le hub (favicons, PWA) : Hubperso#291 et les fils de chaque app.
