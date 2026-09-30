// tests/migrationsRepli.test.ts — un échec de migration ne se retente PAS à chaque appel.
//
// Décision de pole-securite (30/09/2026) : depuis l'ouverture de `/api/sante` au public,
// oublier la mémorisation après un échec voulait dire UNE tentative de migration par
// requête — sous charge, une base déjà en panne recevait un `migrate` à chaque appel.
//
// Mais mémoriser l'échec POUR TOUJOURS serait le verrou définitif que l'en-tête de
// lib/migrations.ts refuse (un blip au démarrage à froid condamnerait l'instance). D'où un
// délai de repli : après un échec, aucune tentative pendant `DELAI_REESSAI_MIGRATIONS_MS`,
// puis une nouvelle tentative.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const moq = vi.hoisted(() => ({ migrate: vi.fn() }));

vi.mock("drizzle-orm/neon-http/migrator", () => ({ migrate: moq.migrate }));
vi.mock("@/lib/db", () => ({
  baseConfiguree: (env: Partial<NodeJS.ProcessEnv> = process.env) =>
    Boolean(env.DATABASE_URL?.trim()),
  db: {},
}));

import {
  DELAI_REESSAI_MIGRATIONS_MS,
  assurerMigrations,
  etatMigrations,
  reinitialiserMigrations,
} from "@/lib/migrations";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T13:00:00Z"));
  reinitialiserMigrations();
  vi.stubEnv("DATABASE_URL", "postgres://base.invalid/hub");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  moq.migrate.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("assurerMigrations — repli après échec", () => {
  it("le délai est d'au moins 30 s et d'au plus 10 min", () => {
    expect(DELAI_REESSAI_MIGRATIONS_MS).toBeGreaterThanOrEqual(30_000);
    expect(DELAI_REESSAI_MIGRATIONS_MS).toBeLessThanOrEqual(600_000);
  });

  it("après un échec, cent appels dans le délai ne déclenchent AUCUNE nouvelle tentative", async () => {
    moq.migrate.mockRejectedValue(new Error("base en panne"));
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 100; i++) await assurerMigrations();
    vi.advanceTimersByTime(DELAI_REESSAI_MIGRATIONS_MS - 1);
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(1);
    // L'erreur reste lisible pendant le repli.
    expect(etatMigrations().erreur).toBe("base en panne");
  });

  it("une fois le délai écoulé, retente (pas de verrou définitif) et un succès efface l'erreur", async () => {
    moq.migrate.mockRejectedValueOnce(new Error("blip")).mockResolvedValue(undefined);
    await assurerMigrations();
    vi.advanceTimersByTime(DELAI_REESSAI_MIGRATIONS_MS);
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(2);
    expect(etatMigrations().erreur).toBeNull();
    // Succès mémorisé : plus aucune tentative ensuite.
    vi.advanceTimersByTime(DELAI_REESSAI_MIGRATIONS_MS * 10);
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(2);
  });

  it("un nouvel échec relance le délai", async () => {
    moq.migrate.mockRejectedValue(new Error("toujours en panne"));
    await assurerMigrations();
    vi.advanceTimersByTime(DELAI_REESSAI_MIGRATIONS_MS);
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(DELAI_REESSAI_MIGRATIONS_MS - 1);
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(2);
  });

  it("reinitialiserMigrations lève le repli (tests, redémarrage)", async () => {
    moq.migrate.mockRejectedValueOnce(new Error("panne")).mockResolvedValue(undefined);
    await assurerMigrations();
    reinitialiserMigrations();
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(2);
  });
});
