// tests/migrations.test.ts — assurerMigrations (lib/migrations.ts).
//
// Appelée par la garde des pages, les Server Actions et les routes machine. Ce fichier
// prouve son contrat, écrit dans son en-tête :
//   - sans base : ne fait rien ;
//   - exécution : applique le dossier `drizzle/` à la racine du projet ;
//   - idempotence : UNE application par processus, même pour dix appels simultanés ;
//   - échec : n'échoue jamais vers l'appelant, journalise, expose l'erreur via
//     `etatMigrations()`, et OUBLIE la mémorisation pour retenter au prochain appel.
//
// Seul `migrate` de Drizzle est remplacé (il parlerait à Neon) ; la base est remplacée par
// un objet vide qu'on vérifie transmis tel quel.

import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const moq = vi.hoisted(() => ({ migrate: vi.fn(), db: { marqueur: "db" } }));

vi.mock("drizzle-orm/neon-http/migrator", () => ({ migrate: moq.migrate }));
vi.mock("@/lib/db", () => ({
  baseConfiguree: (env: Partial<NodeJS.ProcessEnv> = process.env) =>
    Boolean(env.DATABASE_URL?.trim()),
  db: moq.db,
}));

import {
  assurerMigrations,
  etatMigrations,
  reinitialiserMigrations,
} from "@/lib/migrations";

beforeEach(() => {
  reinitialiserMigrations();
  vi.stubEnv("DATABASE_URL", "postgres://base.invalid/hub");
});

afterEach(() => {
  moq.migrate.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("assurerMigrations", () => {
  it("sans DATABASE_URL : ne tente rien", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await assurerMigrations();
    expect(moq.migrate).not.toHaveBeenCalled();
    expect(etatMigrations()).toEqual({ tentee: false, erreur: null });
  });

  it("applique le dossier drizzle/ de la racine, sur la base du hub", async () => {
    moq.migrate.mockResolvedValue(undefined);
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(1);
    expect(moq.migrate).toHaveBeenCalledWith(moq.db, {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    expect(etatMigrations()).toEqual({ tentee: true, erreur: null });
  });

  it("idempotente : un second appel après un succès ne rejoue rien", async () => {
    moq.migrate.mockResolvedValue(undefined);
    await assurerMigrations();
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(1);
  });

  it("dix appels simultanés sur une instance froide : une seule application", async () => {
    let liberer!: () => void;
    moq.migrate.mockReturnValue(new Promise<void>((r) => (liberer = r)));
    const appels = Array.from({ length: 10 }, () => assurerMigrations());
    liberer();
    await Promise.all(appels);
    expect(moq.migrate).toHaveBeenCalledTimes(1);
  });

  it("échec : ne lève pas, journalise, et l'expose dans etatMigrations()", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    moq.migrate.mockRejectedValue(new Error('relation "releves" does not exist'));
    await expect(assurerMigrations()).resolves.toBeUndefined();
    expect(journal).toHaveBeenCalled();
    expect(etatMigrations().erreur).toBe('relation "releves" does not exist');
  });

  it("échec non-Error : message converti en texte", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    moq.migrate.mockRejectedValue("délai dépassé");
    await assurerMigrations();
    expect(etatMigrations().erreur).toBe("délai dépassé");
  });

  // 10 minutes plus tard : au-delà de tout délai de repli après échec (la branche
  // sante-variables en ajoute un de 60 s, testé dans tests/migrationsRepli.test.ts). Ce test
  // vérifie seulement qu'un échec n'est JAMAIS un verrou définitif.
  it("un échec n'est pas un verrou définitif : plus tard, retente, et un succès efface l'erreur", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      moq.migrate.mockRejectedValueOnce(new Error("blip réseau")).mockResolvedValue(undefined);
      await assurerMigrations();
      expect(etatMigrations().erreur).toBe("blip réseau");
      vi.advanceTimersByTime(10 * 60_000);
      await assurerMigrations();
      expect(moq.migrate).toHaveBeenCalledTimes(2);
      expect(etatMigrations()).toEqual({ tentee: true, erreur: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reinitialiserMigrations oublie la mémorisation et l'erreur", async () => {
    moq.migrate.mockResolvedValue(undefined);
    await assurerMigrations();
    reinitialiserMigrations();
    expect(etatMigrations()).toEqual({ tentee: false, erreur: null });
    await assurerMigrations();
    expect(moq.migrate).toHaveBeenCalledTimes(2);
  });
});
