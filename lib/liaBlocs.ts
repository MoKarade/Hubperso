// lib/liaBlocs.ts — les blocs de réponse de LIA (courbe, frise, jauge…) dessinés dans sa bulle (Hubperso#360).
//
// MemoryAI valide le catalogue (22 formes, `commun/assistant/BLOCS-lia.md`) AVANT l'envoi ; le hub les relaie tels
// quels (`app/api/lia/ask/route.ts`) et lia-ui les dessine (`rendreBlocs`, `@mokarade/lia-ui/blocs`) : tout texte par
// `textContent`, liens `https` seulement, une forme qui ne tient pas n'est pas dessinée. Le hub ajoute ICI sa propre
// porte, parce que la réponse traverse le navigateur et que ce qui s'y affiche engage le hub :
//   - le catalogue reste FERMÉ : un `type` inconnu, ou autre chose qu'un objet, ne passe pas ;
//   - 20 blocs au plus (comme MemoryAI) ;
//   - `confirmation` est RETIRÉE : c'est une action proposée, et le hub n'a pas encore de catalogue d'actions contre lequel
//     vérifier `action.id` (BLOCS-lia.md : « inconnue = ignorée », jamais exécutée sans le geste de Marc). Sans
//     `onConfirmer`, lia-ui ne dessinerait pas de bouton, mais on ne laisse pas passer ce qu'on ne sait pas vérifier ;
//   - aucun `lienSource` : une source n'est jamais un lien venu du modèle.
// Fonction pure d'un côté (`filtrerBlocs`), I/O de l'autre (`rendreBlocsHub`, qui touche le DOM).

import { MAX_BLOCS, rendreBlocs, TYPES_BLOCS } from "@mokarade/lia-ui/blocs";

/** Les formes que le hub ne dessine pas encore : elles demandent une vérification qu'il n'a pas. */
export const TYPES_RETIRES: readonly string[] = ["confirmation"];

const TYPES_ADMIS: ReadonlySet<string> = new Set(TYPES_BLOCS.filter((t) => !TYPES_RETIRES.includes(t)));

/** Garde, dans l'ordre, les blocs dont le `type` est une forme admise du catalogue ; au plus `MAX_BLOCS`. */
export function filtrerBlocs(blocs: readonly unknown[]): unknown[] {
  const gardes: unknown[] = [];
  for (const bloc of blocs) {
    if (typeof bloc !== "object" || bloc === null || Array.isArray(bloc)) continue;
    const type = (bloc as { type?: unknown }).type;
    if (typeof type !== "string" || !TYPES_ADMIS.has(type)) continue;
    gardes.push(bloc);
    if (gardes.length >= MAX_BLOCS) break;
  }
  return gardes;
}

/**
 * Branché sur `renderBlocks` de `demarrerLia`. Aucun bloc admis = rien n'est écrit dans `dans`, le texte de la réponse reste
 * seul ; ne lève jamais (une exception dans le rendu ne doit pas faire taire LIA).
 */
export function rendreBlocsHub(blocs: readonly unknown[], dans: HTMLElement): void {
  const admis = filtrerBlocs(blocs);
  if (admis.length === 0) return;
  try {
    rendreBlocs(admis, dans);
  } catch (e) {
    console.error("[lia] blocs non dessinés :", e instanceof Error ? e.name : "inconnue");
  }
}
