// tests/ganttDb.test.ts — le dernier relevé du Gantt en base (PGlite + migrations RÉELLES).
//
// Deux promesses : un envoi valide REMPLACE le précédent (une seule ligne, jamais d'historique
// qui s'empile), et la table ne peut pas porter une deuxième ligne (CHECK id = 1).

import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Même astuce que tests/historiqueDb.test.ts : la fabrique de `vi.mock` est hissée, le porteur
// aussi, et le getter lit la base à l'usage.
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

const { enregistrerGantt, lireEnteteGantt, lireGantt } = await import("../lib/ganttDb");
const { ganttReleve } = await import("../lib/db/schema");

const envoi = (surcharge = {}) => ({
  v: 1 as const,
  envoye: "2026-10-22T20:50:00.000Z",
  donnees_gz_b64: "H4sIAAAAAAAAA6tWKkktLlGyUlAqS8wpTVWqBQAbuQNdFgAAAA==",
  etat: { ecrit: true },
  fiabilite: { score: 0.98 },
  prochaines: { financeai: [] },
  quota: { restant: 12 },
  ...surcharge,
});

beforeAll(async () => {
  await migrate(dbTest, { migrationsFolder: resolve(process.cwd(), "drizzle") });
});

beforeEach(async () => {
  await dbTest.execute(sql`TRUNCATE TABLE ${ganttReleve}`);
});

describe("lib/ganttDb", () => {
  it("avant le premier envoi : null, jamais un relevé inventé", async () => {
    expect(await lireGantt()).toBeNull();
  });

  it("range l'envoi tel quel et rend l'heure de réception", async () => {
    const recu = await enregistrerGantt(envoi());
    expect(Number.isNaN(Date.parse(recu))).toBe(false);
    const ligne = await lireGantt();
    expect(ligne?.donneesGzB64).toBe(envoi().donnees_gz_b64);
    expect(ligne?.etat).toEqual({ ecrit: true });
    expect(ligne?.quota).toEqual({ restant: 12 });
    expect(ligne?.envoyeLe.toISOString()).toBe("2026-10-22T20:50:00.000Z");
  });

  it("un deuxième envoi REMPLACE le premier : une seule ligne, la plus récente", async () => {
    await enregistrerGantt(envoi());
    await enregistrerGantt(envoi({ envoye: "2026-10-22T21:00:00.000Z", etat: { ecrit: false } }));
    const toutes = await dbTest.select().from(ganttReleve);
    expect(toutes).toHaveLength(1);
    expect(toutes[0]?.etat).toEqual({ ecrit: false });
    expect(toutes[0]?.envoyeLe.toISOString()).toBe("2026-10-22T21:00:00.000Z");
  });

  it("la table refuse une deuxième ligne (CHECK id = 1)", async () => {
    await enregistrerGantt(envoi());
    await expect(
      dbTest.insert(ganttReleve).values({
        id: 2,
        envoyeLe: new Date(),
        donneesGzB64: "H4sI",
        etat: {},
        fiabilite: {},
        prochaines: {},
        quota: {},
      }),
    ).rejects.toThrow();
  });

  it("l'en-tête rend les deux heures SANS le contenu, ou null sans relevé", async () => {
    expect(await lireEnteteGantt()).toBeNull();
    await enregistrerGantt(envoi());
    const entete = await lireEnteteGantt();
    expect(entete?.envoyeLe.toISOString()).toBe("2026-10-22T20:50:00.000Z");
    expect(entete?.recuLe).toBeInstanceOf(Date);
    expect(Object.keys(entete ?? {}).sort()).toEqual(["envoyeLe", "recuLe"]);
  });
});
