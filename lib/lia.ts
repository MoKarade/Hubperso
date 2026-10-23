// lib/lia.ts — ce que LIA propose dans son menu sur le hub (clic droit, appui long, touche Menu).
//
// Pur : seulement des destinations. LIA n'exécute rien d'elle-même (règle du paquet
// `@mokarade/lia-ui`) : choisir une entrée, c'est naviguer vers une page du hub, et CETTE page
// se garde toute seule (`exigerAccesHub`). Aucune entrée ne donne donc un droit que la
// navigation ne donnait pas déjà.

export type EntreeLia = { id: string; label: string; href: string };

export const ENTREES_LIA: readonly EntreeLia[] = [
  { id: "attention", label: "Voir ce qui demande de l’attention", href: "/attention" },
  { id: "couts", label: "Voir les coûts et quotas", href: "/couts" },
];

/** Clé de mémorisation locale (position, vie autonome) : une par hôte, pour ne pas mêler le hub aux apps. */
export const CLE_LIA_HUB = "lia-hub";

/**
 * Événement navigateur par lequel un bouton de la page demande à LIA d'aller voir la carte d'une app
 * (`detail: { appId }`). Un bouton serveur ne tient pas la poignée de LIA : il passe par la fenêtre,
 * et `LiaHub` écoute. Aucune donnée ne transite, seulement l'identifiant d'une app déclarée.
 */
export const EVENEMENT_LIA_VOIR = "hub:lia-voir";
