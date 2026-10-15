import type { ResultatDeclenchement } from "@/lib/declencher";

/** Message affiché sous le bouton d'une action, en mots simples (jamais de code HTTP ni d'état anglais). */
export type MessageAction = { statut: "succes" | "erreur"; message: string };

export function messageSansConfirmation(nomApp: string): string {
  return `${nomApp} n'a pas confirmé ses actions, rien n'a été lancé.`;
}

export function messageResultat(
  nomApp: string,
  resultat: ResultatDeclenchement,
): MessageAction {
  switch (resultat.etat) {
    case "ok":
      return { statut: "succes", message: `${nomApp} a bien reçu la demande.` };
    case "non-configuree":
      return {
        statut: "erreur",
        message: `${nomApp} n'a pas de jeton configuré.`,
      };
    case "refuse":
      // Le détail du refus reste affiché : c'est un diagnostic de sécurité en français.
      return {
        statut: "erreur",
        message: `Refusé par le hub — ${resultat.detail}`,
      };
    case "echec":
      return {
        statut: "erreur",
        message: `${nomApp} ne répond pas, rien n'a été lancé.`,
      };
  }
}
