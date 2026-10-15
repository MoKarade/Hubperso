// lib/libelleEnvoi.ts — texte d'un bouton de formulaire selon l'avancement de l'envoi.

export type EtatEnvoi = "repos" | "en-cours" | "fait";

/** « En cours… » pendant l'envoi, « Fait » juste après, sinon le libellé habituel. */
export function libelleEnvoi(libelle: string, etat: EtatEnvoi): string {
  if (etat === "en-cours") return "En cours…";
  if (etat === "fait") return "Fait";
  return libelle;
}
