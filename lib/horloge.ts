/**
 * L'horloge du serveur, lue en UN seul endroit.
 *
 * Les pages et cartes sont des composants serveur asynchrones : ils s'exécutent une fois par
 * requête, jamais en re-rendu côté client. La règle `react-hooks/purity` (React Compiler, Next 16)
 * refuse pourtant `Date.now()` écrit dans un composant, sans savoir cela. Plutôt que de la
 * désactiver, la lecture de l'heure passe par cette fonction ; les fonctions pures
 * (`attentions`, `etatCarte`…) reçoivent l'instant en paramètre et restent testables sans horloge.
 */
export function maintenantMs(): number {
  return Date.now();
}
