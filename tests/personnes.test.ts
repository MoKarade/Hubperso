// tests/personnes.test.ts — le contrôle d'accès, sur le VRAI schéma.
//
// PGlite (Postgres compilé en WASM) + les migrations RÉELLES du dossier `drizzle/` : ce
// qu'on exerce ici est le schéma que la production applique, cascade et clé composite
// comprises. Pas de mock — c'est l'exigence « au moins un test d'intégration par feature ».
//
// Les cas qui comptent vraiment sont ceux du REFUS : une autorisation accordée par erreur
// ne se voit pas, alors qu'un refus injustifié se signale tout seul.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { acces, personnes } from "../lib/db/schema";
import { estProprietaire, normaliser } from "../lib/personnes";

const client = new PGlite();
const dbTest = drizzle(client);

const PROPRIO = "marc.richard4@gmail.com";
const INVITEE = "quelquun@exemple.com";

beforeAll(async () => {
  await migrate(dbTest, { migrationsFolder: resolve(process.cwd(), "drizzle") });
});

beforeEach(async () => {
  await dbTest.execute(sql`TRUNCATE TABLE ${acces}, ${personnes} CASCADE`);
});

describe("normaliser", () => {
  it("efface les différences qui n'en sont pas", () => {
    // Deux lignes qui ne diffèrent que par la casse seraient deux personnes pour la base
    // et une seule pour Google : l'écart exact où une révocation ne révoque rien.
    expect(normaliser("  Marc.Richard4@GMAIL.com ")).toBe(PROPRIO);
  });

  it("rend une chaîne vide pour l'absence", () => {
    expect(normaliser(null)).toBe("");
    expect(normaliser(undefined)).toBe("");
    expect(normaliser("   ")).toBe("");
  });
});

describe("estProprietaire", () => {
  const env = { AUTHORIZED_EMAIL: PROPRIO };

  it("reconnaît le propriétaire quelle que soit la casse", () => {
    expect(estProprietaire("MARC.RICHARD4@gmail.com", env)).toBe(true);
  });

  it("refuse tout le monde d'autre", () => {
    expect(estProprietaire(INVITEE, env)).toBe(false);
  });

  it("refuse quand AUTHORIZED_EMAIL n'est pas configuré", () => {
    // ÉCHEC FERMÉ : sans la variable, `"" === ""` laisserait entrer n'importe qui.
    expect(estProprietaire(PROPRIO, {})).toBe(false);
    expect(estProprietaire("", {})).toBe(false);
  });
});

describe("le schéma tient ses promesses", () => {
  it("empêche deux fois le même accès", async () => {
    await dbTest.insert(personnes).values({ email: INVITEE });
    await dbTest.insert(acces).values({ email: INVITEE, appId: "batchchef" });
    await expect(
      dbTest.insert(acces).values({ email: INVITEE, appId: "batchchef" }),
    ).rejects.toThrow();
  });

  it("laisse la même personne avoir plusieurs apps", async () => {
    await dbTest.insert(personnes).values({ email: INVITEE });
    await dbTest.insert(acces).values([
      { email: INVITEE, appId: "batchchef" },
      { email: INVITEE, appId: "carai" },
    ]);
    const lignes = await dbTest.select().from(acces);
    expect(lignes).toHaveLength(2);
  });

  it("refuse un accès pour une personne inconnue", async () => {
    // La clé étrangère empêche une ligne d'accès orpheline — donc un accès qu'aucune
    // page d'administration n'afficherait, et que personne ne penserait à retirer.
    await expect(
      dbTest.insert(acces).values({ email: "fantome@exemple.com", appId: "carai" }),
    ).rejects.toThrow();
  });

  it("emporte les accès quand la personne est supprimée", async () => {
    await dbTest.insert(personnes).values({ email: INVITEE });
    await dbTest.insert(acces).values({ email: INVITEE, appId: "carai" });
    await dbTest.delete(personnes);
    expect(await dbTest.select().from(acces)).toHaveLength(0);
  });

  it("crée les personnes actives par défaut", async () => {
    // Le défaut doit être le cas courant : on ajoute quelqu'un POUR qu'il entre.
    await dbTest.insert(personnes).values({ email: INVITEE });
    const [ligne] = await dbTest.select().from(personnes);
    expect(ligne?.actif).toBe(true);
  });
});

describe("aAcces — le propriétaire ne dépend jamais de la base", () => {
  it("entre partout même sans DATABASE_URL", async () => {
    // Le scénario qui justifie ce chemin : premier déploiement, table vide, aucune base.
    // Sans lui, personne ne peut entrer — donc personne ne peut ouvrir l'administration
    // pour ajouter la première personne. Un verrou dont la clé est à l'intérieur.
    vi.resetModules();
    const { aAcces } = await import("../lib/personnes");
    const env = { AUTHORIZED_EMAIL: PROPRIO };
    expect(await aAcces(PROPRIO, "hubperso", env)).toBe(true);
    expect(await aAcces(PROPRIO, "jobai", env)).toBe(true);
  });

  it("refuse tout le monde d'autre quand la base est absente", async () => {
    // ÉCHEC FERMÉ : une base injoignable n'ouvre aucune porte. Le hub devient un point de
    // panne unique, c'est assumé dans l'ADR 0001 — mieux vaut une app qui refuse que six
    // qui s'ouvrent parce qu'une requête a échoué.
    vi.resetModules();
    const { aAcces } = await import("../lib/personnes");
    const env = { AUTHORIZED_EMAIL: PROPRIO };
    expect(await aAcces(INVITEE, "batchchef", env)).toBe(false);
  });

  it("refuse une adresse vide, propriétaire ou non", async () => {
    vi.resetModules();
    const { aAcces } = await import("../lib/personnes");
    expect(await aAcces("", "hubperso", { AUTHORIZED_EMAIL: PROPRIO })).toBe(
      false,
    );
    expect(await aAcces(PROPRIO, "", { AUTHORIZED_EMAIL: PROPRIO })).toBe(
      false,
    );
  });
});
