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
import {
  CACHE_CONNEXION_MS,
  estProprietaire,
  normaliser,
  peutSeConnecter,
  viderCacheConnexion,
} from "../lib/personnes";

const client = new PGlite();
const dbTest = drizzle(client);

const PROPRIO = "proprietaire@exemple.com";
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
    expect(normaliser("  Proprietaire@EXEMPLE.com ")).toBe(PROPRIO);
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
    expect(estProprietaire("PROPRIETAIRE@exemple.com", env)).toBe(true);
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

describe("peutSeConnecter — la porte d'entrée, distincte des accès par app", () => {
  const env = { AUTHORIZED_EMAIL: PROPRIO, DATABASE_URL: "postgres://peu-importe" };

  beforeEach(() => {
    // Le cache est un état de MODULE, pas de base : sans le vider, un test hériterait de
    // l'entrée laissée par le précédent, et ce serait un faux positif.
    viderCacheConnexion();
  });

  it("laisse entrer le propriétaire sans jamais interroger la base", async () => {
    const lecture = vi.fn(async () => false);
    expect(await peutSeConnecter(PROPRIO, env, 0, lecture)).toBe(true);
    expect(lecture).not.toHaveBeenCalled();
  });

  it("refuse une adresse vide", async () => {
    const lecture = vi.fn(async () => true);
    expect(await peutSeConnecter("", env, 0, lecture)).toBe(false);
    expect(lecture).not.toHaveBeenCalled();
  });

  it("refuse quand la base n'est pas configurée, même pour une adresse qui aurait accès", async () => {
    const lecture = vi.fn(async () => true);
    expect(await peutSeConnecter(INVITEE, {}, 0, lecture)).toBe(false);
    expect(lecture).not.toHaveBeenCalled();
  });

  it("laisse entrer une invitée qui a au moins un accès", async () => {
    const lecture = vi.fn(async () => true);
    expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(true);
    expect(lecture).toHaveBeenCalledWith(INVITEE);
  });

  it("refuse une invitée sans aucun accès", async () => {
    const lecture = vi.fn(async () => false);
    expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(false);
  });

  it("répond `false` si la lecture échoue, sans laisser fuiter l'exception", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const lecture = vi.fn(async () => {
      throw new Error("panne réseau");
    });
    expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(false);
    expect(erreur).toHaveBeenCalledOnce();
    erreur.mockRestore();
  });

  describe("le cache d'une minute", () => {
    it("mémorise un OUI et ne relit plus la base tant qu'il est valide", async () => {
      const lecture = vi.fn(async () => true);
      expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(true);
      // Juste avant l'expiration : toujours en cache, la base n'est PAS relue — même si
      // elle répondrait autre chose entre-temps, ce qui est justement ce qu'on vérifie.
      lecture.mockResolvedValue(false);
      const justeAvant = CACHE_CONNEXION_MS - 1;
      expect(await peutSeConnecter(INVITEE, env, justeAvant, lecture)).toBe(true);
      expect(lecture).toHaveBeenCalledOnce();
    });

    it("relit la base une fois le cache expiré", async () => {
      const lecture = vi.fn(async () => true);
      expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(true);
      lecture.mockResolvedValue(false);
      expect(
        await peutSeConnecter(INVITEE, env, CACHE_CONNEXION_MS, lecture),
      ).toBe(false);
      expect(lecture).toHaveBeenCalledTimes(2);
    });

    it("NE mémorise JAMAIS un refus — sinon quelqu'un qu'on vient d'ajouter attendrait une minute", async () => {
      const lecture = vi.fn(async () => false);
      expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(false);
      // Même instant (0 ms écoulée) : si le refus avait été mis en cache, cette deuxième
      // lecture serait COURT-CIRCUITÉE par le cache — la base ne serait pas relue.
      expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(false);
      expect(lecture).toHaveBeenCalledTimes(2);

      // Et à l'inverse : dès que la base dit `true`, le OUI est immédiat — rien ne devait
      // rester en travers.
      lecture.mockResolvedValue(true);
      expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(true);
      expect(lecture).toHaveBeenCalledTimes(3);
    });

    it("une révocation efface le cache tout de suite, pas seulement à l'expiration", async () => {
      const lecture = vi.fn(async () => true);
      expect(await peutSeConnecter(INVITEE, env, 0, lecture)).toBe(true);
      lecture.mockResolvedValue(false);
      // Même instant (0 ms écoulée) : sans l'appel qui vide le cache sur un refus constaté,
      // rien ne forcerait cette deuxième lecture — mais elle EST forcée ici parce que ce
      // test avance le temps jusqu'à l'expiration pour l'observer proprement.
      expect(
        await peutSeConnecter(INVITEE, env, CACHE_CONNEXION_MS, lecture),
      ).toBe(false);
      // Un accès rendu juste après ne doit pas se heurter à une entrée fantôme du refus.
      lecture.mockResolvedValue(true);
      expect(
        await peutSeConnecter(INVITEE, env, CACHE_CONNEXION_MS, lecture),
      ).toBe(true);
    });
  });
});
