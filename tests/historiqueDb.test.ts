// tests/historiqueDb.test.ts — un échec d'écriture ne doit JAMAIS ressembler à un succès.
//
// ── CE QUE CE TEST REPRODUIT, ET IL LE REPRODUIT VRAIMENT ────────────────────────────
//
// Le 15/09/2026, `DATABASE_URL` venait d'être posée. `POST /api/cron/releve` répondait
// `HTTP 200` avec « aucun relevé écrit — le dernier date de moins de l'espacement minimal »,
// run GitHub vert. En réalité les CINQ insertions échouaient sur
// `relation "releves" does not exist` (Postgres 42P01) : la table n'existait pas.
//
// La cause n'était pas la formulation du message mais le TYPE. `enregistrerReleve` rendait un
// booléen : `false` voulait dire « espacement respecté » (sain) ET « l'écriture a échoué »
// (grave). L'appelant ne recevait donc jamais de quoi distinguer, et la seule phrase
// disponible était celle du cas sain. Aucune rédaction ne pouvait être juste.
//
// Le cas n°3 ci-dessous SUPPRIME la table, exactement comme en production, plutôt que de
// simuler une exception : ce qui est éprouvé est la panne mesurée, pas une approximation.
//
// PGlite + les migrations RÉELLES de `drizzle/`, même montage que `tests/administration.test.ts`.

import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hubSource, validSummary } from "./helpers";

// Voir `tests/administration.test.ts` : la fabrique de `vi.mock` est hissée au-dessus des
// imports, donc elle ne peut pas fermer sur `dbTest`. Un getter sur un porteur hissé lit la
// valeur à l'USAGE, bien après qu'elle ait été remplie.
const porteur = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("../lib/db", () => ({
  get db() {
    return porteur.db;
  },
  baseConfiguree: () => true,
}));

const client = new PGlite();
const dbTest = drizzle(client);
porteur.db = dbTest;

const { enregistrerReleve, elaguerHistorique } = await import("../lib/historiqueDb");
const { releves } = await import("../lib/db/schema");

const resultatOk = () => ({
  state: "ok" as const,
  source: hubSource(),
  summary: validSummary(),
});

beforeAll(async () => {
  await migrate(dbTest, { migrationsFolder: resolve(process.cwd(), "drizzle") });
});

beforeEach(async () => {
  await dbTest.execute(sql`TRUNCATE TABLE ${releves}`);
});

/**
 * Rend la table INTROUVABLE le temps d'un appel, puis la remet.
 *
 * Un `DROP TABLE` produirait la même erreur mais serait irréversible ici : Drizzle tient
 * `__drizzle_migrations` et considère la migration comme déjà appliquée, donc la rejouer ne
 * recréerait rien et les tests suivants tomberaient pour une raison sans rapport. Le
 * renommage donne EXACTEMENT la même erreur Postgres — 42P01 `relation "releves" does not
 * exist`, celle mesurée en production — sans toucher à la comptabilité des migrations.
 */
async function sansLaTable<T>(pendant: () => Promise<T>): Promise<T> {
  await dbTest.execute(sql`ALTER TABLE ${releves} RENAME TO releves_cachee`);
  try {
    return await pendant();
  } finally {
    await dbTest.execute(sql`ALTER TABLE releves_cachee RENAME TO releves`);
  }
}

describe("enregistrerReleve distingue les trois issues", () => {
  it("écrit quand rien n'a été relevé récemment", async () => {
    expect(await enregistrerReleve(resultatOk())).toBe("ecrit");
  });

  it("espace le second passage rapproché, sans rien écrire", async () => {
    expect(await enregistrerReleve(resultatOk())).toBe("ecrit");
    expect(await enregistrerReleve(resultatOk())).toBe("espace");
  });

  it("dit « echec » quand la table n'existe pas — et SURTOUT pas « espace »", async () => {
    // La panne de production, reproduite : 42P01 `relation "releves" does not exist`.
    const issue = await sansLaTable(() => enregistrerReleve(resultatOk()));

    expect(issue).toBe("echec");
    // L'assertion qui compte vraiment. Avec l'ancien booléen, cette issue était
    // indistinguable d'un espacement — et la route annonçait un run sain.
    expect(issue).not.toBe("espace");
  });

  it("ne relève pas un résumé servi depuis le cache de résilience", async () => {
    // Ce n'est pas une nouvelle observation : l'archiver ferait croire à une continuité
    // qui n'existe pas, et `inchangeDepuisMs` compterait un gel là où il y a une panne.
    expect(await enregistrerReleve({ ...resultatOk(), stale: true })).toBe("espace");
    const lignes = await dbTest.select().from(releves);
    expect(lignes).toHaveLength(0);
  });
});

describe("elaguerHistorique ne déguise pas une panne en ménage réussi", () => {
  it("rend 0 quand il n'y a rien à retirer", async () => {
    expect(await elaguerHistorique()).toBe(0);
  });

  it("rend null quand la requête échoue", async () => {
    // Il rendait `0` — soit exactement ce que rend un élagage parfaitement réussi sur une
    // table propre. Le même mensonge que l'ancien booléen, un cran plus bas.
    expect(await sansLaTable(() => elaguerHistorique())).toBeNull();
  });
});
