// lib/chantierEvenementsDb.ts — ranger les événements GitHub reçus pour la page Chantier. L'I/O, séparée du raisonnement
// (`lib/chantierEvenements.ts` est PUR).
//
// Comme `lib/ganttDb.ts`, l'écriture EST la fonction de la route : une erreur remonte, la route le dit.

import { lt, sql } from "drizzle-orm";
import { db } from "./db";
import { chantierEvenements } from "./db/schema";
import { JOURS_CONSERVES, type EvenementChantier } from "./chantierEvenements";

/**
 * Range l'événement. `nouveau: false` quand cet `id` était déjà là (GitHub renvoie une livraison) : rien n'est écrit
 * une seconde fois. L'élagage ne passe que sur une vraie écriture : un renvoi ne coûte qu'une insertion refusée.
 */
export async function ranger(e: EvenementChantier): Promise<{ nouveau: boolean }> {
  const lignes = await db
    .insert(chantierEvenements)
    .values({
      id: e.id,
      cle: e.cle,
      type: e.type,
      action: e.action,
      repo: e.repo,
      n: e.n,
      sha: e.sha,
      at: new Date(e.at),
      etat: e.etat,
      plus: e.plus,
    })
    .onConflictDoNothing({ target: chantierEvenements.id })
    .returning({ id: chantierEvenements.id });
  if (lignes.length === 0) return { nouveau: false };
  await db.delete(chantierEvenements).where(lt(chantierEvenements.recuLe, sql`now() - make_interval(days => ${JOURS_CONSERVES})`));
  return { nouveau: true };
}
