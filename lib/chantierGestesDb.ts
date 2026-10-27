// lib/chantierGestesDb.ts — ranger les gestes de l'onglet « À toi » en attente du PC. L'I/O, séparée du
// raisonnement (`lib/chantierGestes.ts` est PUR).
//
// Comme `lib/ganttDb.ts`, l'écriture EST la fonction de la route : une erreur remonte, la route le dit.

import { db } from "./db";
import { chantierGestes } from "./db/schema";
import type { DepotGeste } from "./chantierGestes";

/**
 * Range le geste. `nouveau: false` quand cet `id` était déjà là (un renvoi du même clic) : rien n'est
 * écrit une seconde fois, et le PC n'appliquera le geste qu'une fois.
 */
export async function deposerGeste(geste: DepotGeste): Promise<{ nouveau: boolean }> {
  const lignes = await db
    .insert(chantierGestes)
    .values({
      id: geste.id,
      ref: geste.ref,
      geste: geste.geste,
      texte: geste.texte,
      quand: new Date(geste.quand),
    })
    .onConflictDoNothing({ target: chantierGestes.id })
    .returning({ id: chantierGestes.id });
  return { nouveau: lignes.length === 1 };
}
