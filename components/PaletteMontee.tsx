// components/PaletteMontee.tsx — le montage SERVEUR de la palette.
//
// Elle liste les apps du hub : elle exige donc le même accès que le tableau de bord, pas
// seulement une session. Quelqu'un invité sur une seule app a une session valide (la
// connexion est unique) — lui montrer la liste des cinq apps par un raccourci clavier
// contournerait exactement le cloisonnement que `exigerAccesHub` met en place.
//
// Montée depuis le layout plutôt que dans chaque page : un seul endroit à garder, et le
// raccourci marche partout où il doit marcher. Sur /login, `auth()` rend `null` et rien
// n'est rendu — le composant disparaît, il ne se contente pas d'être caché.

import { auth } from "@/auth";
import { APP_HUB, aAcces } from "@/lib/personnes";
import { getSources } from "@/lib/sources";
import { commandes } from "@/lib/palette";
import { PaletteCommandes } from "./PaletteCommandes";

export async function PaletteMontee() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !(await aAcces(email, APP_HUB))) return null;

  // Les URLs viennent de `sources.ts` (déclarées, pas publiées par les apps) : ce sont les
  // sous-domaines hubperso.com, connus avant tout fetch. Pas de summary à attendre, donc
  // pas de raccourci qui devient utilisable seulement une fois les apps réveillées.
  const apps = getSources().map((source) => ({
    id: source.id,
    nom: source.name,
    url: new URL(source.summaryUrl).origin,
  }));

  return <PaletteCommandes commandes={commandes(apps)} />;
}
