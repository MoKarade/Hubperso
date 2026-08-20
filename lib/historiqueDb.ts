// lib/historiqueDb.ts — écrire et relire la mémoire du hub. L'I/O, séparé du raisonnement
// (`lib/historique.ts` est PUR et se teste sans rien monter).
//
// ── CE QUI BORNE LA CROISSANCE, ET POURQUOI C'EST EN SQL ────────────────────────────
//
// Le hub interroge les apps toutes les ~15 s tant qu'un onglet est ouvert. Écrire à chaque
// fois ferait 5 760 lignes par jour et par app pour redire, l'essentiel du temps, la même
// chose — sur un Neon gratuit, et pour une valeur nulle.
//
// L'écriture est donc espacée d'`INTERVALLE_RELEVE_MS`, et la condition est posée DANS
// l'instruction d'insertion plutôt qu'en JavaScript. La raison est une course, pas une
// élégance : lire « quand date le dernier relevé ? » puis écrire laisse une fenêtre où deux
// instances Vercel concurrentes lisent le même « rien depuis 20 min » et insèrent toutes les
// deux. Un `WHERE NOT EXISTS` dans l'insertion tranche côté base, une fois.
//
// ── AUCUNE ÉCRITURE NE DOIT POUVOIR CASSER UNE PAGE ─────────────────────────────────
//
// Le relevé est un effet de bord de l'affichage : il enrichit demain, il ne sert pas
// aujourd'hui. Une panne d'écriture est donc journalisée et avalée — c'est l'un des rares
// endroits où avaler une erreur est le bon choix, et il est nommé pour qu'on ne l'imite pas
// ailleurs. Un `throw` ici ferait tomber le tableau de bord pour cause d'échec d'archivage.

import { and, desc, gt, inArray, sql } from "drizzle-orm";
import { db, baseConfiguree } from "./db";
import { releves } from "./db/schema";
import type { Releve } from "./historique";
import type { SummaryResult } from "./fetchSummary";

/** Un relevé par app au plus toutes les 15 minutes. Voir l'en-tête. */
export const INTERVALLE_RELEVE_MS = 15 * 60_000;

/** Au-delà, un relevé n'apprend plus rien et coûte du stockage. */
export const RETENTION_JOURS = 90;

/**
 * Enregistre un relevé, SI le dernier date de plus d'`INTERVALLE_RELEVE_MS`.
 *
 * Rend `true` quand une ligne a été écrite — utile aux tests et au diagnostic, jamais à
 * l'affichage.
 */
export async function enregistrerReleve(resultat: SummaryResult): Promise<boolean> {
  if (!baseConfiguree()) return false;

  const appId = resultat.source.id;
  const summary = resultat.state === "ok" ? resultat.summary : null;

  // ⚠️ Un résumé servi depuis le CACHE de résilience n'est pas une nouvelle observation :
  // c'est le même instantané resservi parce que l'app n'a pas répondu. L'archiver ferait
  // croire à une continuité qui n'existe pas, et `inchangeDepuisMs` compterait un gel là
  // où il y a en réalité une panne. On ne relève que du LIVE.
  if (resultat.state === "ok" && resultat.stale) return false;

  const cout = summary?.usage?.cost ?? null;

  try {
    // SQL brut, et assumé : Drizzle ne sait pas exprimer `INSERT … SELECT … WHERE NOT EXISTS`
    // par son constructeur (un `select` sans `from` n'accepte pas de `where`). Le contourner
    // en JavaScript rouvrirait précisément la course que cette forme ferme.
    //
    // Tout est PARAMÉTRÉ, y compris l'intervalle (`make_interval`) : aucune interpolation de
    // chaîne dans le SQL, même pour une constante que je contrôle — l'habitude compte plus
    // que le cas.
    const insere = await db.execute(sql`
      INSERT INTO ${releves} (app_id, releve_le, etat, data_as_of, metriques, cout_montant, cout_devise, cout_periode)
      SELECT ${appId}, now(), ${resultat.state},
             ${summary?.dataAsOf ?? null}::timestamptz,
             ${JSON.stringify(summary?.metrics ?? [])}::jsonb,
             ${cout?.amount ?? null}::numeric,
             ${cout?.currency ?? null},
             ${cout?.period ?? null}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${releves}
        WHERE app_id = ${appId}
          AND releve_le > now() - make_interval(secs => ${INTERVALLE_RELEVE_MS / 1000})
      )
      RETURNING app_id
    `);
    return (insere.rows?.length ?? 0) > 0;
  } catch (err) {
    // Voir l'en-tête : l'archivage ne fait pas tomber l'affichage.
    console.error("[historique] relevé non enregistré", err);
    return false;
  }
}

/** Les relevés d'une app, du plus récent au plus ancien, bornés en nombre. */
export async function lireHistorique(appId: string, limite = 400): Promise<Releve[]> {
  if (!baseConfiguree()) return [];
  try {
    const lignes = await db
      .select()
      .from(releves)
      .where(
        and(
          sql`${releves.appId} = ${appId}`,
          gt(releves.releveLe, sql`now() - make_interval(days => ${RETENTION_JOURS})`),
        ),
      )
      .orderBy(desc(releves.releveLe))
      .limit(limite);
    return lignes.map(versReleve);
  } catch (err) {
    // Pas d'historique ⇒ l'appelant affiche « pas encore d'historique », jamais une
    // courbe plate inventée. Une mémoire absente et une mémoire vide se ressemblent à
    // l'écran, et c'est acceptable : les deux disent honnêtement « je ne sais pas ».
    console.error("[historique] lecture impossible", err);
    return [];
  }
}


/**
 * L'historique de PLUSIEURS apps, en UNE requête.
 *
 * Le tableau de bord affiche cinq cartes : cinq lectures séparées feraient cinq allers-retours
 * là où un `IN` suffit. Le résultat est groupé par app, et une app sans relevé rend un tableau
 * vide plutôt que d'être absente de la Map — l'appelant n'a ainsi pas à distinguer « pas
 * d'historique » de « clé manquante ».
 */
export async function lireHistoriqueTous(
  appIds: string[],
  limiteParApp = 400,
): Promise<Map<string, Releve[]>> {
  const vide = new Map<string, Releve[]>(appIds.map((id) => [id, []]));
  if (!baseConfiguree() || appIds.length === 0) return vide;

  try {
    const lignes = await db
      .select()
      .from(releves)
      .where(
        and(
          inArray(releves.appId, appIds),
          gt(releves.releveLe, sql`now() - make_interval(days => ${RETENTION_JOURS})`),
        ),
      )
      .orderBy(desc(releves.releveLe))
      .limit(limiteParApp * appIds.length);

    for (const ligne of lignes) {
      vide.get(ligne.appId)?.push(versReleve(ligne));
    }
    return vide;
  } catch (err) {
    console.error("[historique] lecture groupée impossible", err);
    return vide;
  }
}

/** Élague ce qui a dépassé la rétention. Sans effet s'il n'y a rien à retirer. */
export async function elaguerHistorique(): Promise<number> {
  if (!baseConfiguree()) return 0;
  try {
    const retires = await db
      .delete(releves)
      .where(sql`${releves.releveLe} < now() - make_interval(days => ${RETENTION_JOURS})`)
      .returning({ appId: releves.appId });
    return retires.length;
  } catch (err) {
    console.error("[historique] élagage impossible", err);
    return 0;
  }
}

type LigneReleve = typeof releves.$inferSelect;

/**
 * Ligne de base → `Releve` du domaine.
 *
 * ⚠️ `numeric` revient en CHAÎNE avec le pilote Postgres (il refuse de perdre de la
 * précision en la coulant dans un `number`). Un `montant` laissé en chaîne se comparerait
 * et s'additionnerait comme du texte — « 9 » > « 10 ». La conversion est donc explicite, et
 * une valeur illisible devient `null` plutôt qu'un `NaN` contagieux.
 */
function versReleve(ligne: LigneReleve): Releve {
  const montant = ligne.coutMontant === null ? null : Number(ligne.coutMontant);
  const coutUtilisable =
    montant !== null &&
    Number.isFinite(montant) &&
    (ligne.coutDevise === "USD" || ligne.coutDevise === "CAD") &&
    (ligne.coutPeriode === "total" || ligne.coutPeriode === "mois" || ligne.coutPeriode === "jour");

  return {
    appId: ligne.appId,
    releveLe: ligne.releveLe.getTime(),
    etat: ligne.etat,
    dataAsOf: ligne.dataAsOf ? ligne.dataAsOf.getTime() : null,
    metriques: Array.isArray(ligne.metriques) ? ligne.metriques : [],
    cout: coutUtilisable
      ? {
          montant: montant!,
          devise: ligne.coutDevise as "USD" | "CAD",
          periode: ligne.coutPeriode as "total" | "mois" | "jour",
        }
      : null,
  };
}
