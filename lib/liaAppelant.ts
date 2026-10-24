// lib/liaAppelant.ts — qui appelle une route de LIA qui parle à MemoryAI : le propriétaire, un invité, ou personne.
//
// Partagé par `/api/lia/etat` et `/api/lia/demandes` : ce que garde MemoryAI sur Marc n'est jamais lisible par un invité
// du hub (403), et sans session ou sans accès au hub il n'y a aucun appel à MemoryAI (401).

import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { assurerMigrations } from "@/lib/migrations";
import { aAcces, APP_HUB } from "@/lib/personnes";

/** `undefined` = pas de session ou pas d'accès (401) ; `"invite"` = connecté mais pas le propriétaire (403). */
export async function appelantLia(): Promise<"proprietaire" | "invite" | undefined> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return undefined;
  // La liste des invités vit en base : on s'assure du schéma avant de la lire (lib/migrations.ts).
  await assurerMigrations();
  if (!(await aAcces(email, APP_HUB))) return undefined;
  return isAuthorizedEmail(email, process.env.AUTHORIZED_EMAIL) ? "proprietaire" : "invite";
}
