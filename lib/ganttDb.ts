// lib/ganttDb.ts — ranger et relire le dernier relevé du Gantt. L'I/O, séparée du raisonnement
// (`lib/gantt.ts` est PUR).
//
// L'écriture est un upsert sur l'unique ligne (`id = 1`) : un envoi valide REMPLACE le précédent,
// et comme la validation passe AVANT d'arriver ici, un corps invalide ne touche jamais la ligne.
// Contrairement à l'archivage des relevés (`lib/historiqueDb.ts`, qui avale ses erreurs parce
// qu'il est un effet de bord), ici l'écriture EST la fonction de la route : une erreur remonte,
// la route répond 500, et le PC le voit.

import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { ganttReleve } from "./db/schema";
import type { EnvoiGantt } from "./gantt";

/** Range l'envoi comme dernier relevé. Rend l'heure de réception (ISO) écrite par la base. */
export async function enregistrerGantt(envoi: EnvoiGantt): Promise<string> {
  const valeurs = {
    envoyeLe: new Date(envoi.envoye),
    donneesGzB64: envoi.donnees_gz_b64,
    etat: envoi.etat,
    fiabilite: envoi.fiabilite,
    prochaines: envoi.prochaines,
    quota: envoi.quota,
  };
  const lignes = await db
    .insert(ganttReleve)
    .values({ id: 1, ...valeurs })
    .onConflictDoUpdate({
      target: ganttReleve.id,
      set: { ...valeurs, recuLe: sql`now()` },
    })
    .returning({ recuLe: ganttReleve.recuLe });
  const recu = lignes[0]?.recuLe;
  if (!recu) throw new Error("gantt_releve : l'écriture n'a rien rendu");
  return recu.toISOString();
}

/** Le dernier relevé, ou `null` si le PC n'a encore rien envoyé (jamais un relevé inventé). */
export async function lireGantt() {
  const lignes = await db.select().from(ganttReleve).where(eq(ganttReleve.id, 1)).limit(1);
  return lignes[0] ?? null;
}

/** Le champ `quota` du dernier relevé, SANS le reste (~400 Ko de données) : de quoi lire le taux USD→CAD. `null` si rien n'est arrivé. */
export async function lireQuotaGantt(): Promise<unknown> {
  const lignes = await db.select({ quota: ganttReleve.quota }).from(ganttReleve).where(eq(ganttReleve.id, 1)).limit(1);
  return lignes[0]?.quota ?? null;
}

/**
 * Les deux heures du dernier relevé, SANS son contenu : de quoi juger « rien de nouveau » (ETag)
 * sans relire les ~400 Ko de `donnees_gz_b64`. `null` si le PC n'a encore rien envoyé.
 */
export async function lireEnteteGantt() {
  const lignes = await db
    .select({ recuLe: ganttReleve.recuLe, envoyeLe: ganttReleve.envoyeLe })
    .from(ganttReleve)
    .where(eq(ganttReleve.id, 1))
    .limit(1);
  return lignes[0] ?? null;
}
