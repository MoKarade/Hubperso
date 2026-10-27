// lib/chantierGestesDb.ts — ranger les gestes de l'onglet « À toi » en attente du PC. L'I/O, séparée du
// raisonnement (`lib/chantierGestes.ts` est PUR).
//
// Comme `lib/ganttDb.ts`, l'écriture EST la fonction de la route : une erreur remonte, la route le dit.

import { and, asc, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { chantierGestes } from "./db/schema";
import { ACCUSE_MAX, type DepotGeste } from "./chantierGestes";

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

/**
 * Les gestes que le PC n'a pas encore pris, du plus ancien au plus récent, dans la forme de l'ancien
 * `reponse-*.json` (le PC garde sa logique) : `v`, `id`, `ref`, `geste`, `texte`, `quand` (ISO).
 */
export async function gestesEnAttente(): Promise<DepotGeste[]> {
  const lignes = await db
    .select()
    .from(chantierGestes)
    .where(isNull(chantierGestes.priseLe))
    .orderBy(asc(chantierGestes.recuLe), asc(chantierGestes.id))
    .limit(ACCUSE_MAX);
  return lignes.map((l) => ({
    v: 1 as const,
    id: l.id,
    ref: l.ref,
    geste: l.geste as DepotGeste["geste"],
    texte: l.texte,
    quand: l.quand.toISOString(),
  }));
}

/**
 * Le PC a pris ces gestes : `prise_le` se pose UNE fois (une seconde prise ne la déplace pas). Rend les
 * identifiants réellement accusés ; un identifiant inconnu ou déjà pris n'y figure pas.
 */
export async function accuserGestes(ids: string[]): Promise<string[]> {
  const lignes = await db
    .update(chantierGestes)
    .set({ priseLe: sql`now()` })
    .where(and(inArray(chantierGestes.id, ids), isNull(chantierGestes.priseLe)))
    .returning({ id: chantierGestes.id });
  return lignes.map((l) => l.id);
}
