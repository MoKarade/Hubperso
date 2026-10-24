// lib/liaPauseDb.ts — lire et écrire la pause de LIA (I/O ; le jugement est dans `lib/liaPause.ts`, pur).
//
// ── ÉCHEC FERMÉ ─────────────────────────────────────────────────────────────────────
//
// Cet interrupteur protège un COÛT (chaque question de LIA est un appel de modèle). Une lecture qui échoue ne se déguise
// donc jamais en « pas en pause » : `lirePause` rend `"indisponible"` et la route refuse (503). Seule exception honnête :
// aucune base configurée (`baseConfiguree()` faux) — la pause ne peut alors pas avoir été posée (l'écriture est refusée
// aussi), donc « pas en pause » est l'état réel, pas une supposition.
//
// Le schéma est assuré par l'appelant (`assurerMigrations`, comme partout dans le hub). Une table encore absente fait
// échouer la lecture, donc fermer : pas d'appel au modèle tant que la pause ne peut pas être lue.

import { eq, sql } from "drizzle-orm";
import { baseConfiguree, db } from "./db";
import { liaReglages } from "./db/schema";
import type { EtatPause } from "./liaPause";

const ID = 1;

/** L'état de la pause, ou `"indisponible"` si la base ne le dit pas. */
export async function lirePause(): Promise<EtatPause | "indisponible"> {
  if (!baseConfiguree()) return { pause: false, modifieLe: null };
  try {
    const [ligne] = await db.select().from(liaReglages).where(eq(liaReglages.id, ID)).limit(1);
    return ligne ? { pause: ligne.pause, modifieLe: ligne.modifieLe.toISOString() } : { pause: false, modifieLe: null };
  } catch (e) {
    // Seulement le type d'erreur : jamais de requête ni de contenu.
    console.error("[lia/pause] lecture impossible :", e instanceof Error ? e.name : "inconnue");
    return "indisponible";
  }
}

/** Pose la pause (ligne unique, remplacée). `"indisponible"` si la base ne l'a pas enregistrée ou n'existe pas. */
export async function ecrirePause(pause: boolean): Promise<EtatPause | "indisponible"> {
  if (!baseConfiguree()) return "indisponible";
  try {
    const [ligne] = await db
      .insert(liaReglages)
      .values({ id: ID, pause })
      .onConflictDoUpdate({ target: liaReglages.id, set: { pause, modifieLe: sql`now()` } })
      .returning();
    return ligne ? { pause: ligne.pause, modifieLe: ligne.modifieLe.toISOString() } : "indisponible";
  } catch (e) {
    console.error("[lia/pause] écriture impossible :", e instanceof Error ? e.name : "inconnue");
    return "indisponible";
  }
}
