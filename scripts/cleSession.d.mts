// Types du générateur de clé de session (module en .mjs : voir cleSession.mjs).

export const ALGORITHME: "ES256";

export interface JwkPublique {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid: string;
  alg: string;
  use: string;
}
export interface JwkPrivee extends JwkPublique {
  d: string;
}

export function empreinteJwk(jwkPublique: Pick<JwkPublique, "crv" | "kty" | "x" | "y">): string;
export function genererPaire(): { kid: string; publique: JwkPublique; privee: JwkPrivee };
export function versJwks(cles: JwkPublique[]): string;
export function fusionnerJwks(jwksExistant: string, nouvellePublique: JwkPublique): JwkPublique[];
export function estDansDepot(chemin: string, racine: string): boolean;
export function ecrirePriveeHorsDepot(
  privee: JwkPrivee,
  chemin: string,
  racineDepot: string,
  ecrire: (chemin: string, contenu: string, options: { flag: string; mode: number }) => void,
): string;

export interface EntreesSorties {
  racine: string;
  dossierTemporaire: string;
  suffixe: () => string;
  ecrire: (chemin: string, contenu: string, options: { flag: string; mode: number }) => void;
  log: (texte: string) => void;
}

/** Cœur du script en ligne de commande, E/S injectées. Retourne le code de sortie (0 = succès). */
export function principal(argv: string[], io: EntreesSorties): number;
