// app/administration/actions.ts — les seules écritures que la page d'administration
// déclenche.
//
// REVÉRIFICATION SERVEUR, PAS SEULEMENT AFFICHAGE. Une Server Action est un point
// d'entrée POST à part entière, atteignable directement sans passer par le rendu de la
// page qui l'affiche. Se fier au fait que le bouton n'est montré qu'au propriétaire
// reviendrait à vérifier à l'AFFICHAGE ce qui doit l'être à l'ÉCRITURE — même principe
// que la page Commandes de CarAI, qui écrit dans le monde réel et revérifie pour ça.

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { estProprietaire } from "@/lib/personnes";
import {
  accorderAcces,
  ajouterPersonne,
  definirActif,
  retirerAcces,
  supprimerPersonne,
} from "@/lib/administration";

async function exigerProprietaireServeur(): Promise<void> {
  const session = await auth();
  if (!estProprietaire(session?.user?.email)) {
    throw new Error("Action réservée au propriétaire du hub.");
  }
}

function champ(formData: FormData, nom: string): string {
  const valeur = formData.get(nom);
  return typeof valeur === "string" ? valeur : "";
}

export async function actionAjouterPersonne(formData: FormData): Promise<void> {
  await exigerProprietaireServeur();
  await ajouterPersonne(champ(formData, "email"), champ(formData, "nom") || null);
  revalidatePath("/administration");
}

export async function actionSupprimerPersonne(formData: FormData): Promise<void> {
  await exigerProprietaireServeur();
  await supprimerPersonne(champ(formData, "email"));
  revalidatePath("/administration");
}

export async function actionDefinirActif(formData: FormData): Promise<void> {
  await exigerProprietaireServeur();
  await definirActif(champ(formData, "email"), champ(formData, "actif") === "true");
  revalidatePath("/administration");
}

export async function actionAccorderAcces(formData: FormData): Promise<void> {
  await exigerProprietaireServeur();
  await accorderAcces(champ(formData, "email"), champ(formData, "appId"));
  revalidatePath("/administration");
}

export async function actionRetirerAcces(formData: FormData): Promise<void> {
  await exigerProprietaireServeur();
  await retirerAcces(champ(formData, "email"), champ(formData, "appId"));
  revalidatePath("/administration");
}
