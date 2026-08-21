// Types du contrôle « doc à jour ». Le module est en `.mjs` volontairement — il doit tourner
// à l'identique dans un dépôt Next et dans un dépôt Apps Script, sans étape de compilation.
// Ce fichier ne sert qu'aux dépôts TypeScript, pour que les tests soient typés.

export const HORS_BACKLOG: string;

/** TOUS les identifiants en tête de sujet — un commit peut légitimement en fermer deux. */
export function idsDeSujet(sujet: string): string[];
export function idDeSujet(sujet: string): string | null;
export function idsDesCommits(sujets: string[]): string[];
export function porteHorsBacklog(sujets: string[]): boolean;
export function idsDuBacklog(contenu: string): Set<string>;
/**
 * `contenuBacklog` active le critère PRÉCIS : la ligne modifiée est-elle DANS le bloc de
 * cette entrée. Sans lui — ou sans en-tête `@@` dans le diff — on retombe sur le critère
 * littéral, qui ne prétend rien plutôt que de refuser à tort.
 */
export function entreeTouchee(diffBacklog: string, id: string, contenuBacklog?: string): boolean;
/** Les entrées dont le BLOC contient au moins une ligne modifiée. */
export function entreesTouchees(diffBacklog: string, contenuBacklog: string): Set<string>;
export function estCode(chemin: string): boolean;

export interface Verdict {
  bloquants: string[];
  avertissements: string[];
}

export function verifier(params: {
  sujets?: string[];
  fichiers?: string[];
  contenuBacklog?: string;
  diffBacklog?: string;
  /** Quels documents EXISTENT dans ce dépôt. Un absent n'est jamais réclamé. */
  documents?: Record<string, boolean>;
}): Verdict;

export function suggestion(ids: string[], connus: Set<string>): string | null;
