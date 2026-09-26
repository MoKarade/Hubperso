// scripts/codesRaison.mjs — briques de l'étape 2 (coût CI), importables telles quelles par chaque dépôt.

/**
 * Codes de raison de l'auto-merge : liste FERMÉE, lue par le workflow (sortie du job) et les tests.
 * `attestation_requise`, `frein_horaire` et `sha_change` de la spec de l'étape 2 ne s'appliquent
 * que dans les dépôts qui ont une attestation ou un frein horaire : à ajouter là, jamais inventés ici.
 */
export const CODES_RAISON = [
  "merge_ok",
  "brouillon",
  "do_not_merge",
  "controle_en_cours",
  "controle_rouge",
  "etat_fusion",
  "hors_perimetre",
];

/**
 * Les `uses:` d'un workflow qui ne sont PAS épinglés par un SHA de commit de 40 caractères.
 * Les actions locales (`./...`) sont ignorées. Retourne la liste des références fautives.
 * @param {string} texteWorkflow
 * @returns {string[]}
 */
export function usesNonEpingles(texteWorkflow) {
  const fautifs = [];
  for (const m of texteWorkflow.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
    const ref = m[1];
    if (ref.startsWith("./")) continue;
    if (!/@[0-9a-f]{40}$/.test(ref)) fautifs.push(ref);
  }
  return fautifs;
}
