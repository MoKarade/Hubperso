// tests/chantierGestesDb.test.ts — les gestes de l'onglet « À toi » en base (PGlite + migrations RÉELLES).
//
// Deux promesses : un geste déposé est rangé tel que validé, `prise_le` vide (le PC ne l'a pas pris) ; le même
// `id` reçu deux fois ne crée qu'une ligne (le PC n'appliquera le geste qu'une fois).

import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const { accuserGestes, deposerGeste, gestesEnAttente } = await import("../lib/chantierGestesDb");
const { chantierGestes } = await import("../lib/db/schema");

const geste = (surcharge = {}) => ({
  v: 1 as const,
  id: "mh3k2x9a-4fzq1w",
  ref: "Org/depot#12",
  geste: "fusionner" as const,
  texte: null,
  quand: "2026-10-27T10:00:00.000Z",
  ...surcharge,
});

beforeAll(async () => {
  await migrate(dbTest, { migrationsFolder: resolve(process.cwd(), "drizzle") });
});

beforeEach(async () => {
  await dbTest.execute(sql`TRUNCATE TABLE ${chantierGestes}`);
});

describe("lib/chantierGestesDb", () => {
  it("range le geste tel que validé, reçu maintenant, pas encore pris par le PC", async () => {
    expect(await deposerGeste(geste({ geste: "reponse", texte: "Oui, vas-y" }))).toEqual({ nouveau: true });
    const lignes = await dbTest.select().from(chantierGestes);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ id: "mh3k2x9a-4fzq1w", ref: "Org/depot#12", geste: "reponse", texte: "Oui, vas-y", priseLe: null });
    expect(lignes[0]!.quand.toISOString()).toBe("2026-10-27T10:00:00.000Z");
    expect(lignes[0]!.recuLe).toBeInstanceOf(Date);
  });

  it("le même `id` reçu deux fois ne crée qu'une ligne et ne change rien à la première", async () => {
    await deposerGeste(geste());
    expect(await deposerGeste(geste({ ref: "Org/autre#99", geste: "fait" }))).toEqual({ nouveau: false });
    const lignes = await dbTest.select().from(chantierGestes);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ ref: "Org/depot#12", geste: "fusionner" });
  });

  it("deux gestes d'`id` différents font deux lignes", async () => {
    await deposerGeste(geste());
    await deposerGeste(geste({ id: "zz9y8x7w-abcdef" }));
    expect(await dbTest.select().from(chantierGestes)).toHaveLength(2);
  });

  it("le PC lit les gestes pas encore pris, du plus ancien au plus récent, dans le corps d'hier", async () => {
    await deposerGeste(geste({ id: "premier-000001", geste: "reponse", texte: "Oui" }));
    await deposerGeste(geste({ id: "second-000002" }));
    expect(await gestesEnAttente()).toEqual([
      { v: 1, id: "premier-000001", ref: "Org/depot#12", geste: "reponse", texte: "Oui", quand: "2026-10-27T10:00:00.000Z" },
      { v: 1, id: "second-000002", ref: "Org/depot#12", geste: "fusionner", texte: null, quand: "2026-10-27T10:00:00.000Z" },
    ]);
  });

  it("lire ne marque rien ; l'accusé retire de la liste et ne se pose qu'une fois", async () => {
    await deposerGeste(geste({ id: "premier-000001" }));
    await deposerGeste(geste({ id: "second-000002" }));
    expect(await gestesEnAttente()).toHaveLength(2);
    expect(await gestesEnAttente()).toHaveLength(2);

    expect(await accuserGestes(["premier-000001", "inconnu-123456"])).toEqual(["premier-000001"]);
    expect((await gestesEnAttente()).map((g) => g.id)).toEqual(["second-000002"]);

    const [pris] = await dbTest.select().from(chantierGestes).where(sql`${chantierGestes.id} = 'premier-000001'`);
    const heure = pris!.priseLe;
    expect(heure).toBeInstanceOf(Date);
    // Un second accusé ne déplace pas l'heure de prise et ne rend rien.
    expect(await accuserGestes(["premier-000001"])).toEqual([]);
    const [encore] = await dbTest.select().from(chantierGestes).where(sql`${chantierGestes.id} = 'premier-000001'`);
    expect(encore!.priseLe).toEqual(heure);
  });

  it("n'en rend pas plus de 50 d'un coup", async () => {
    for (let i = 0; i < 52; i++) await deposerGeste(geste({ id: `geste-${String(i).padStart(4, "0")}` }));
    expect(await gestesEnAttente()).toHaveLength(50);
  });
});
