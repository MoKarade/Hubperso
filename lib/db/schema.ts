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
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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

/**
 * L'historique des résumés — la MÉMOIRE du hub.
 *
 * ── POURQUOI UNE TROISIÈME TABLE, APRÈS AVOIR ÉCRIT « DEUX SUFFISENT » ───────────────
 *
 * Parce que le hub ne savait dire que « maintenant », et que les trois pannes qui ont
 * vraiment coûté cher le 20/08/2026 étaient toutes des CHANGEMENTS SILENCIEUX :
 *
 *   - une campagne DriveAI arrêtée à 322 documents sur 1207, en pause depuis deux
 *     semaines — le tableau affichait « en pause » comme un état parfaitement normal ;
 *   - un coût publié sous « ce mois-ci » au lieu de « cumulé », donc rangé dans la
 *     mauvaise colonne sans que le montant ait l'air faux ;
 *   - un plafond de budget périmé depuis trois semaines dans une doc que personne ne relit.
 *
 * Aucun n'était rouge. Aucun n'aurait pu l'être : un instantané ne peut pas signaler
 * qu'il ressemble à celui d'hier. Il faut une mémoire pour ça, et c'est tout ce que cette
 * table sert à faire.
 *
 * ── CE QU'ON STOCKE, ET CE QU'ON NE STOCKE PAS ──────────────────────────────────────
 *
 * Les métriques en `jsonb`, telles que l'app les publie. PAS de colonne par métrique :
 * le hub est générique par le contrat (§1), et une colonne `documents_traites` y
 * introduirait la connaissance d'une app en particulier — exactement ce que tout le
 * dépôt s'interdit.
 *
 * Le coût est éclaté en trois colonnes parce qu'on veut le TRIER et le SOMMER, et parce
 * que sa `period` doit rester collée à son montant : le principe « jamais d'agrégat entre
 * unités incomparables » vaut pour l'historique comme pour l'affichage. Un `montant` sans
 * sa `periode` serait un chiffre qu'on finirait par additionner.
 *
 * ── CE QUI BORNE LA CROISSANCE ──────────────────────────────────────────────────────
 *
 * Le hub interroge les apps toutes les ~60 s tant qu'un onglet est visible (15 s avant le 26/10/2026). Écrire à chaque
 * fois ferait 5 760 lignes par jour et par app pour, l'essentiel du temps, redire la même
 * chose. L'écriture est donc espacée (`INTERVALLE_RELEVE_MS`) et l'insertion est
 * CONDITIONNELLE en SQL — voir `lib/historique.ts`. Les vieux relevés sont élagués.
 */
export const releves = pgTable(
  "releves",
  {
    appId: text("app_id").notNull(),
    releveLe: timestamp("releve_le", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /**
     * L'état vu par le hub (`ok`, `unreachable`, `invalid`, `contract-too-new`, …), et non
     * le seul `status` du contrat : une app injoignable ne publie AUCUN statut, et c'est
     * précisément le genre de trou qu'on veut pouvoir relire.
     */
    etat: text("etat").notNull(),
    /** Fraîcheur déclarée par l'app. Distincte de `releveLe`, qui est l'heure du HUB. */
    dataAsOf: timestamp("data_as_of", { withTimezone: true }),
    /** Les métriques publiées, telles quelles. `[]` quand l'app n'en publie pas. */
    metriques: jsonb("metriques").notNull().default(sql`'[]'::jsonb`),
    /** Montant, devise et période INSÉPARABLES — voir l'en-tête. Null si non suivi. */
    coutMontant: numeric("cout_montant"),
    coutDevise: text("cout_devise"),
    coutPeriode: text("cout_periode"),
  },
  (t) => [primaryKey({ columns: [t.appId, t.releveLe] })],
);

/**
 * Le DERNIER relevé du Gantt envoyé par le PC de Marc (`POST /api/gantt`, lib/gantt.ts).
 *
 * Une seule ligne, jamais un historique : la contrainte `id = 1` rend impossible d'en écrire
 * deux, et l'envoi suivant REMPLACE le précédent. Le Drive de Marc garde la copie de secours.
 * `donnees_gz_b64` est stocké tel quel (gzip puis base64) : le hub ne le décode pas.
 */
export const ganttReleve = pgTable(
  "gantt_releve",
  {
    id: integer("id").primaryKey().default(1),
    /** L'heure de RÉCEPTION, celle du hub : c'est elle qui dit « périmé ». */
    recuLe: timestamp("recu_le", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** L'heure d'envoi déclarée par le PC. */
    envoyeLe: timestamp("envoye_le", { withTimezone: true }).notNull(),
    donneesGzB64: text("donnees_gz_b64").notNull(),
    etat: jsonb("etat").notNull(),
    fiabilite: jsonb("fiabilite").notNull(),
    prochaines: jsonb("prochaines").notNull(),
    quota: jsonb("quota").notNull(),
  },
  (t) => [check("gantt_releve_une_ligne", sql`${t.id} = 1`)],
);

/**
 * Les réglages de LIA gardés par le SERVEUR du hub. Pour l'instant un seul : la pause.
 *
 * Une seule ligne (contrainte `id = 1`), comme `gantt_releve`. La pause est vérifiée ICI, côté serveur, parce qu'une pause
 * que seul le navigateur connaît n'arrête rien : une app, un autre onglet ou un script appellent `/api/lia/ask` sans
 * passer par la page. Aucune donnée de Marc dans cette table : un booléen et une date.
 */
export const liaReglages = pgTable(
  "lia_reglages",
  {
    id: integer("id").primaryKey().default(1),
    /** `true` : plus aucun appel au modèle (`/api/lia/ask` rend 423 sans quitter le hub). */
    pause: boolean("pause").notNull().default(false),
    modifieLe: timestamp("modifie_le", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [check("lia_reglages_une_ligne", sql`${t.id} = 1`)],
);

/**
 * Les gestes de l'onglet « À toi » de la page Chantier (Fusionner, Fait, une réponse) en attente du PC (`lib/chantierGestes.ts`).
 *
 * Le hub les DÉPOSE (`POST /api/chantier/gestes`, session du propriétaire) ; le PC les lit et les applique sur GitHub, puis
 * pose `prise_le`. Le corps est celui de l'ancien `reponse-<horodatage>.json` du Drive : `id` est la clé, un renvoi du même
 * geste ne crée pas de seconde ligne. Aucune donnée de relevé ici : une référence de tâche, un geste, une phrase de réponse.
 */
export const chantierGestes = pgTable("chantier_gestes", {
  id: text("id").primaryKey(),
  ref: text("ref").notNull(),
  geste: text("geste").notNull(),
  texte: text("texte"),
  /** L'heure du clic déclarée par le navigateur. */
  quand: timestamp("quand", { withTimezone: true }).notNull(),
  /** L'heure de RÉCEPTION, celle du hub. */
  recuLe: timestamp("recu_le", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  /** `null` tant que le PC ne l'a pas pris. */
  priseLe: timestamp("prise_le", { withTimezone: true }),
});

/**
 * Les événements GitHub reçus par `POST /api/chantier/evenement` (webhooks signés), pour la page Chantier : la CI rouge,
 * un déploiement en échec, la sortie du brouillon d'une PR arrivent à l'instant où ils se produisent, sans attendre le
 * relevé du PC. `id` est l'identifiant de livraison GitHub (un renvoi ne crée pas de seconde ligne), `cle` suit la clé du
 * relevé (`repo#n`, `repo@sha`, `repo:nom`), `at` est l'heure de l'événement et `recu_le` celle du hub. Élagué après 14 jours.
 * Aucun corps de commentaire ni d'issue : un titre, un lien, quelques mots dans `plus`.
 */
export const chantierEvenements = pgTable(
  "chantier_evenements",
  {
    id: text("id").primaryKey(),
    cle: text("cle").notNull(),
    type: text("type").notNull(),
    action: text("action").notNull(),
    repo: text("repo").notNull(),
    n: integer("n"),
    sha: text("sha"),
    at: timestamp("at", { withTimezone: true }).notNull(),
    etat: text("etat"),
    plus: jsonb("plus"),
    recuLe: timestamp("recu_le", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("chantier_evenements_recu_le").on(t.recuLe)],
);
