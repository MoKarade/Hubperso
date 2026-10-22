// components/NavigationMontee.tsx — le montage SERVEUR de la navigation.
//
// Même garde que `PaletteMontee` et pour la même raison : la navigation liste les apps du hub,
// donc elle exige l'ACCÈS AU HUB, pas seulement une session. Quelqu'un invité sur une seule app a
// une session valide (la connexion est unique) ; lui montrer les six apps dans une barre
// contournerait le cloisonnement que `exigerAccesHub` met en place. Sans accès, les pages sont
// rendues telles quelles : pas de barre, pas de cadre.
//
// ⚠️ Ceci ne GARDE aucune page. Chaque page et chaque Server Action se garde toute seule
// (`exigerAccesHub`, `exigerProprietaire`) ; masquer une entrée n'est qu'un confort. Si la
// lecture de la session échoue, on rend les pages sans navigation (jamais avec) et on le dit
// dans les journaux.

import type { ReactNode } from "react";
import { auth } from "@/auth";
import { APP_HUB, aAcces, estProprietaire } from "@/lib/personnes";
import { getSources } from "@/lib/sources";
import { modeleNavigation, type ModeleNav } from "@/lib/navigation";
import { Cadre } from "./Navigation";

/** Le modèle pour cette session, ou `null` : pas de session, pas d'accès au hub, ou session illisible. */
async function modelePourLaSession(): Promise<ModeleNav | null> {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email || !(await aAcces(email, APP_HUB))) return null;

    // Ce qui est DÉCLARÉ (`sources.ts`), pas ce que les apps publient : aucun résumé à attendre.
    const apps = getSources().map((source) => ({
      id: source.id,
      nom: source.name,
      couleur: source.couleur,
    }));
    return modeleNavigation(apps, estProprietaire(email));
  } catch (erreur) {
    console.error("[navigation] session illisible, pages rendues sans navigation :", erreur);
    return null;
  }
}

export async function NavigationMontee({ children }: { children: ReactNode }) {
  const modele = await modelePourLaSession();
  if (!modele) return <>{children}</>;
  return <Cadre modele={modele}>{children}</Cadre>;
}
