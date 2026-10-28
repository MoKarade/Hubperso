// lib/chantierEvenementsDb.ts — ranger les événements GitHub reçus pour la page Chantier. L'I/O, séparée du raisonnement
// (`lib/chantierEvenements.ts` est PUR).
//
// Comme `lib/ganttDb.ts`, l'écriture EST la fonction de la route : une erreur remonte, la route le dit.

import { asc, desc, gt, lt, sql } from "drizzle-orm";
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

/** Combien d'événements une lecture rend au plus, et jusqu'où remonte la première lecture d'une page qui s'ouvre. */
export const LECTURE_MAX = 2000;
export const PREMIERE_LECTURE_H = 48;

export type LigneEvenement = EvenementChantier & { rl: string };

/**
 * Les événements reçus APRÈS `depuis` (l'instant de réception du dernier lu), du plus ancien au plus récent. Sans `depuis` : les
 * 48 dernières heures, les plus récentes d'abord retenues. Un événement relu (même milliseconde) revient : la page range par `id`.
 */
export async function lireDepuis(depuis: Date | null): Promise<LigneEvenement[]> {
  const base = db.select().from(chantierEvenements);
  const lignes = depuis
    ? await base.where(gt(chantierEvenements.recuLe, depuis)).orderBy(asc(chantierEvenements.recuLe), asc(chantierEvenements.id)).limit(LECTURE_MAX)
    : (
        await base
          .where(gt(chantierEvenements.recuLe, sql`now() - make_interval(hours => ${PREMIERE_LECTURE_H})`))
          .orderBy(desc(chantierEvenements.recuLe), desc(chantierEvenements.id))
          .limit(LECTURE_MAX)
      ).reverse();
  return lignes.map((l) => ({
    v: 1 as const,
    id: l.id,
    type: l.type,
    action: l.action,
    repo: l.repo,
    n: l.n,
    sha: l.sha,
    cle: l.cle,
    at: l.at.toISOString(),
    etat: l.etat,
    plus: (l.plus as Record<string, string> | null) ?? null,
    rl: l.recuLe.toISOString(),
  }));
}
