// lib/db/schema.ts — qui a le droit d'entrer, et où.
//
// ── POURQUOI LE HUB GAGNE UNE BASE ──────────────────────────────────────────────────
//
// Il n'en avait aucune, et c'était une qualité : le hub ne stockait rien, il lisait les
// autres. L'ADR 0001 y renonce pour une raison précise — `AUTHORIZED_EMAIL` contient UNE
// adresse, dans six environnements, et donne un accès TOUT OU RIEN. Inviter quelqu'un sur
// la liste d'épicerie lui ouvrirait JobAI, où vivent l'adresse du domicile, le statut
// migratoire et des noms de personnes tierces.
//
// Deux tables suffisent à régler ça, et il n'en faut pas une de plus.
//
// ── CE QUI N'EST PAS ICI, ET POURQUOI ───────────────────────────────────────────────
//
// Pas de mot de passe, pas de rôle, pas de session. L'identité vient de Google, la session
// vit dans un cookie chiffré. Cette base ne répond qu'à UNE question : « cette adresse
// a-t-elle accès à cette app ? »
//
// Pas non plus de distinction lecture/écriture (décision de Marc, 14/08). Une colonne
// `role` qu'aucun code ne consulterait serait pire qu'absente : elle laisserait croire à
// une garantie qui n'existe pas.

import { sql } from "drizzle-orm";
import { boolean, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Les personnes admises dans l'écosystème.
 *
 * L'adresse est la clé primaire, en MINUSCULES : Google la rend telle quelle, mais rien ne
 * garantit la casse d'une saisie manuelle. Deux lignes qui ne diffèrent que par la casse
 * seraient deux personnes pour la base et une seule pour Google — l'écart exact où une
 * révocation ne révoque rien. La normalisation est faite à l'écriture (`lib/personnes.ts`)
 * ET vérifiée par une contrainte.
 */
export const personnes = pgTable("personnes", {
  email: text("email").primaryKey(),
  /** Pour l'affichage dans l'administration. Jamais utilisé pour décider. */
  nom: text("nom"),
  /**
   * Désactiver plutôt que supprimer : on garde la trace de qui a eu accès, et on retire
   * l'accès d'un geste réversible. Une suppression efface aussi la mémoire de l'invitation.
   */
  actif: boolean("actif").notNull().default(true),
  creeLe: timestamp("cree_le", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * Qui a accès à quelle app. Une ligne par couple.
 *
 * `appId` reprend les identifiants de `lib/sources.ts` (`financeai`, `driveai`,
 * `batchchef`, `carai`, `jobai`) plus `hubperso` pour le hub lui-même. Volontairement du
 * TEXTE et non une énumération : ajouter une app ne doit pas demander une migration de
 * schéma, sinon la promesse « une entrée dans sources.ts et c'est tout » tombe.
 *
 * La clé primaire composite empêche le doublon, et la cascade fait le ménage quand une
 * personne est supprimée pour de bon.
 */
export const acces = pgTable(
  "acces",
  {
    email: text("email")
      .notNull()
      .references(() => personnes.email, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    accordeLe: timestamp("accorde_le", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.email, t.appId] })],
);
