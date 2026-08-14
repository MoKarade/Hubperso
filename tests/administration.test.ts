// tests/administration.test.ts — la page d'administration, sur le VRAI schéma.
//
// `lib/administration.ts` importe `db` directement (pas de paramètre injectable : ces
// fonctions ne servent QUE derrière `exigerProprietaire`, il n'y a pas de chemin
// « sans base » à préserver comme pour `aAcces`). Pour éprouver son VRAI comportement —
// idempotence, cascade, la fusion à deux requêtes de `listerPersonnes` — ce fichier
// remplace `lib/db` par une connexion PGlite via `vi.mock`, plutôt que de tester le
// schéma à côté comme le fait `tests/personnes.test.ts`.
//
// `vi.hoisted` est nécessaire : le facteur de `vi.mock` est hissé au-dessus des imports
// et ne peut référencer que des variables elles-mêmes hissées.

import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` est hissé au-dessus des imports : sa fabrique ne peut pas fermer sur `dbTest`
// directement (il n'existe pas encore à cet instant). Un getter sur un porteur, lui-même
// créé par `vi.hoisted` sans dépendre d'aucun import, contourne l'ordre — `db` n'est lu
// qu'à l'USAGE (chaque `db.select()…` de lib/administration.ts), bien après que le
// porteur ait été rempli plus bas.
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

const {
  APPS_DISPONIBLES,
  ajouterPersonne,
  accorderAcces,
  definirActif,
  listerPersonnes,
  retirerAcces,
  supprimerPersonne,
} = await import("../lib/administration");
const { acces, personnes } = await import("../lib/db/schema");
const { APP_HUB } = await import("../lib/personnes");

const INVITEE = "quelquun@exemple.com";
const AUTRE = "autre@exemple.com";

beforeAll(async () => {
  await migrate(dbTest, { migrationsFolder: resolve(process.cwd(), "drizzle") });
});

beforeEach(async () => {
  await dbTest.execute(sql`TRUNCATE TABLE ${acces}, ${personnes} CASCADE`);
});

describe("APPS_DISPONIBLES", () => {
  it("place le hub en premier, puis chaque app du contrat", () => {
    expect(APPS_DISPONIBLES[0]?.id).toBe(APP_HUB);
    // Au moins une app du contrat, sans quoi ce test ne prouve rien de la composition.
    expect(APPS_DISPONIBLES.length).toBeGreaterThan(1);
    // Aucun doublon d'identifiant : deux entrées pour la même app rendraient un des
    // deux boutons de la page fantôme (il agirait sur l'app, l'autre resterait figé).
    const ids = APPS_DISPONIBLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("validation — avant toute écriture", () => {
  it("refuse une adresse qui n'a pas la forme d'un courriel", async () => {
    await expect(ajouterPersonne("pas-une-adresse", null)).rejects.toThrow(/invalide/);
  });

  it("refuse une app inconnue, à l'octroi comme au retrait", async () => {
    await ajouterPersonne(INVITEE, null);
    await expect(accorderAcces(INVITEE, "app-qui-n-existe-pas")).rejects.toThrow(/inconnue/);
    await expect(retirerAcces(INVITEE, "app-qui-n-existe-pas")).rejects.toThrow(/inconnue/);
  });
});

describe("ajouterPersonne", () => {
  it("crée une personne active, sans accès", async () => {
    await ajouterPersonne(INVITEE, "Quelqu'un");
    const [p] = await listerPersonnes();
    expect(p).toMatchObject({ email: INVITEE, nom: "Quelqu'un", actif: true, appIds: [] });
  });

  it("normalise l'adresse (casse, espaces)", async () => {
    await ajouterPersonne("  Quelqu.Un@Exemple.com ", null);
    const [p] = await listerPersonnes();
    expect(p?.email).toBe("quelqu.un@exemple.com");
  });

  it("est idempotent : ajouter deux fois ne duplique ni n'échoue", async () => {
    await ajouterPersonne(INVITEE, "Premier nom");
    await ajouterPersonne(INVITEE, "Second nom");
    const lignes = await listerPersonnes();
    expect(lignes).toHaveLength(1);
    // Le premier ajout gagne : un doublon silencieux ne doit pas effacer ce qui existait.
    expect(lignes[0]?.nom).toBe("Premier nom");
  });

  it("un nom vide devient null, pas une chaîne vide", async () => {
    await ajouterPersonne(INVITEE, "   ");
    const [p] = await listerPersonnes();
    expect(p?.nom).toBeNull();
  });
});

describe("supprimerPersonne", () => {
  it("emporte ses accès avec elle (cascade)", async () => {
    await ajouterPersonne(INVITEE, null);
    await accorderAcces(INVITEE, APP_HUB);
    await supprimerPersonne(INVITEE);
    expect(await listerPersonnes()).toHaveLength(0);
    const lignesAcces = await dbTest.select().from(acces);
    expect(lignesAcces).toHaveLength(0);
  });

  it("ne touche pas aux autres personnes", async () => {
    await ajouterPersonne(INVITEE, null);
    await ajouterPersonne(AUTRE, null);
    await supprimerPersonne(INVITEE);
    const lignes = await listerPersonnes();
    expect(lignes.map((p) => p.email)).toEqual([AUTRE]);
  });
});

describe("definirActif", () => {
  it("désactive sans retirer les accès accordés", async () => {
    await ajouterPersonne(INVITEE, null);
    await accorderAcces(INVITEE, APP_HUB);
    await definirActif(INVITEE, false);
    const [p] = await listerPersonnes();
    expect(p).toMatchObject({ actif: false, appIds: [APP_HUB] });
  });
});

describe("accorderAcces / retirerAcces", () => {
  it("accorde plusieurs apps à la même personne", async () => {
    await ajouterPersonne(INVITEE, null);
    await accorderAcces(INVITEE, APP_HUB);
    await accorderAcces(INVITEE, APPS_DISPONIBLES[1]!.id);
    const [p] = await listerPersonnes();
    expect(p?.appIds.sort()).toEqual([APP_HUB, APPS_DISPONIBLES[1]!.id].sort());
  });

  it("accorder deux fois la même app est idempotent", async () => {
    await ajouterPersonne(INVITEE, null);
    await accorderAcces(INVITEE, APP_HUB);
    await accorderAcces(INVITEE, APP_HUB);
    const [p] = await listerPersonnes();
    expect(p?.appIds).toEqual([APP_HUB]);
  });

  it("retirer une app ne touche pas aux autres", async () => {
    await ajouterPersonne(INVITEE, null);
    await accorderAcces(INVITEE, APP_HUB);
    await accorderAcces(INVITEE, APPS_DISPONIBLES[1]!.id);
    await retirerAcces(INVITEE, APP_HUB);
    const [p] = await listerPersonnes();
    expect(p?.appIds).toEqual([APPS_DISPONIBLES[1]!.id]);
  });

  it("accorder un accès à une adresse jamais ajoutée échoue (clé étrangère)", async () => {
    // Pas d'accès orphelin : la contrainte de lib/db/schema.ts fait le travail, pas
    // une vérification applicative qui pourrait être oubliée ailleurs.
    await expect(accorderAcces("fantome@exemple.com", APP_HUB)).rejects.toThrow();
  });
});

describe("listerPersonnes", () => {
  it("inclut une personne sans AUCUN accès — pas de jointure interne qui l'effacerait", async () => {
    await ajouterPersonne(INVITEE, null);
    const lignes = await listerPersonnes();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.appIds).toEqual([]);
  });

  it("associe chaque accès à la bonne personne, pas à toutes", async () => {
    await ajouterPersonne(INVITEE, null);
    await ajouterPersonne(AUTRE, null);
    await accorderAcces(INVITEE, APP_HUB);
    const lignes = await listerPersonnes();
    const parEmail = new Map(lignes.map((p) => [p.email, p.appIds]));
    expect(parEmail.get(INVITEE)).toEqual([APP_HUB]);
    expect(parEmail.get(AUTRE)).toEqual([]);
  });
});
