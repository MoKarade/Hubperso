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
import { assurerMigrations } from "@/lib/migrations";
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

  // ⚠️ LE SCHÉMA, ET CE FICHIER EST LE PLUS EXPOSÉ DES TROIS QUI L'OUBLIAIENT.
  //
  // C'est ici qu'on ÉCRIT le modèle d'accès — ajouter une personne, accorder un accès. Or
  // l'en-tête de ce fichier dit lui-même qu'une Server Action « est atteignable sans passer
  // par la page qui affiche le bouton » : elle peut donc être la première chose servie par un
  // déploiement neuf, avant qu'aucune page n'ait joué les migrations. La première invitation
  // échouerait alors sur une table inexistante, au moment précis où l'on vérifie que ça
  // marche.
  //
  // Placé dans le goulot commun aux cinq actions plutôt que répété cinq fois. Mémorisé par
  // processus : après le premier appel, c'est un no-op.
  //
  // Trouvé le 15/09/2026 par `tests/migrationsAppelees.test.ts` — troisième instance du même
  // oubli, après `/api/cron/releve` (la panne réelle) et `app/actions.ts`.
  await assurerMigrations();
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
