// tests/gardeHub.test.ts — exigerAccesHub / exigerProprietaire (lib/gardeHub.ts).
//
// C'est la garde de TOUTES les pages du hub (tests/gardePages.test.ts exige qu'elles
// l'appellent) ; ce fichier prouve qu'elle fait ce qu'elle dit :
//   - sans session → /login ;
//   - session sans accès au hub → /sans-acces (échec FERMÉ, même base en panne) ;
//   - propriétaire (AUTHORIZED_EMAIL) → accès, SANS toucher la base (aucun réseau) ;
//   - exigerProprietaire : invité avec accès au hub → renvoyé vers /, propriétaire → passe.
//
// Ce qui est remplacé, et seulement ça : la session Auth.js (`@/auth`), `redirect` de Next
// (qui lève une exception dans le vrai framework — on garde ce contrat), les migrations, et
// la base, remplacée par un objet qui LÈVE à tout accès : un test qui passe prouve donc
// qu'aucune requête n'a été tentée. `lib/personnes.ts` est le VRAI module.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROPRIETAIRE = "proprietaire@exemple.test";
const INVITE = "invite@exemple.test";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  assurerMigrations: vi.fn(async () => {}),
  accesBase: vi.fn(),
  aAccesForce: null as null | ((email: string | null | undefined, appId: string) => Promise<boolean>),
}));

vi.mock("@/auth", () => ({ auth: moq.auth }));

vi.mock("next/navigation", () => ({
  redirect: (vers: string) => {
    throw new Error(`REDIRECT:${vers}`);
  },
}));

vi.mock("@/lib/migrations", () => ({ assurerMigrations: moq.assurerMigrations }));

vi.mock("@/lib/db", () => ({
  baseConfiguree: (env: Partial<NodeJS.ProcessEnv> = process.env) =>
    Boolean(env.DATABASE_URL?.trim()),
  // Tout accès à la base est un ÉCHEC du test « sans réseau » : on le compte et on lève.
  db: new Proxy(
    {},
    {
      get() {
        moq.accesBase();
        throw new Error("accès base interdit dans ce test");
      },
    },
  ),
}));

vi.mock("@/lib/personnes", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/personnes")>();
  return {
    ...vrai,
    // Par défaut : la VRAIE fonction. Un test peut la forcer pour simuler un invité autorisé
    // (l'autorisation en base est couverte par tests/personnes.test.ts).
    aAcces: (email: string | null | undefined, appId: string) =>
      moq.aAccesForce ? moq.aAccesForce(email, appId) : vrai.aAcces(email, appId),
  };
});

import { exigerAccesHub, exigerProprietaire } from "@/lib/gardeHub";

function session(email: string | null) {
  return { user: email === null ? {} : { email }, expires: "2099-01-01T00:00:00.000Z" };
}

beforeEach(() => {
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  vi.stubEnv("DATABASE_URL", "postgres://base-injoignable.invalid/hub");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  moq.auth.mockReset();
  moq.assurerMigrations.mockClear();
  moq.accesBase.mockClear();
  moq.aAccesForce = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("exigerAccesHub", () => {
  it("sans session : redirige vers /login, sans migrer ni lire la base", async () => {
    moq.auth.mockResolvedValue(null);
    await expect(exigerAccesHub()).rejects.toThrow("REDIRECT:/login");
    expect(moq.assurerMigrations).not.toHaveBeenCalled();
    expect(moq.accesBase).not.toHaveBeenCalled();
  });

  it("propriétaire : rend la session, SANS aucun accès à la base", async () => {
    const s = session(PROPRIETAIRE);
    moq.auth.mockResolvedValue(s);
    await expect(exigerAccesHub()).resolves.toBe(s);
    expect(moq.accesBase).not.toHaveBeenCalled();
  });

  it("propriétaire reconnu malgré casse et espaces", async () => {
    moq.auth.mockResolvedValue(session("  PROPRIETAIRE@Exemple.TEST "));
    await expect(exigerAccesHub()).resolves.toBeTruthy();
    expect(moq.accesBase).not.toHaveBeenCalled();
  });

  it("assure le schéma AVANT de décider de l'accès", async () => {
    moq.auth.mockResolvedValue(session(PROPRIETAIRE));
    await exigerAccesHub();
    expect(moq.assurerMigrations).toHaveBeenCalledTimes(1);
  });

  it("invité, base en panne : échec FERMÉ → /sans-acces (jamais /login, jamais ouvert)", async () => {
    moq.auth.mockResolvedValue(session(INVITE));
    await expect(exigerAccesHub()).rejects.toThrow("REDIRECT:/sans-acces");
    // La vraie `aAcces` a tenté la base (qui lève) et a répondu non.
    expect(moq.accesBase).toHaveBeenCalled();
  });

  it("invité, sans base configurée : /sans-acces, sans réseau", async () => {
    vi.stubEnv("DATABASE_URL", "");
    moq.auth.mockResolvedValue(session(INVITE));
    await expect(exigerAccesHub()).rejects.toThrow("REDIRECT:/sans-acces");
    expect(moq.accesBase).not.toHaveBeenCalled();
  });

  it("session sans adresse : /sans-acces", async () => {
    moq.auth.mockResolvedValue(session(null));
    await expect(exigerAccesHub()).rejects.toThrow("REDIRECT:/sans-acces");
  });

  it("sans AUTHORIZED_EMAIL, personne n'est propriétaire par défaut", async () => {
    vi.stubEnv("AUTHORIZED_EMAIL", "");
    vi.stubEnv("DATABASE_URL", "");
    moq.auth.mockResolvedValue(session(PROPRIETAIRE));
    await expect(exigerAccesHub()).rejects.toThrow("REDIRECT:/sans-acces");
  });

  it("invité à qui le hub est accordé : passe, et la question porte sur l'app « hubperso »", async () => {
    const demandes: string[] = [];
    moq.aAccesForce = async (_email, appId) => {
      demandes.push(appId);
      return appId === "hubperso";
    };
    const s = session(INVITE);
    moq.auth.mockResolvedValue(s);
    await expect(exigerAccesHub()).resolves.toBe(s);
    expect(demandes).toEqual(["hubperso"]);
  });
});

describe("exigerProprietaire", () => {
  it("propriétaire : rend la session", async () => {
    const s = session(PROPRIETAIRE);
    moq.auth.mockResolvedValue(s);
    await expect(exigerProprietaire()).resolves.toBe(s);
    expect(moq.accesBase).not.toHaveBeenCalled();
  });

  it("invité AVEC accès au hub mais pas propriétaire : renvoyé vers /", async () => {
    moq.aAccesForce = async () => true;
    moq.auth.mockResolvedValue(session(INVITE));
    // Motif EXACT : « REDIRECT:/ » est aussi un préfixe de « REDIRECT:/sans-acces ».
    await expect(exigerProprietaire()).rejects.toThrow(/^REDIRECT:\/$/);
  });

  it("invité sans accès au hub : /sans-acces (la garde de base passe en premier)", async () => {
    moq.auth.mockResolvedValue(session(INVITE));
    await expect(exigerProprietaire()).rejects.toThrow("REDIRECT:/sans-acces");
  });

  it("sans session : /login", async () => {
    moq.auth.mockResolvedValue(null);
    await expect(exigerProprietaire()).rejects.toThrow("REDIRECT:/login");
  });
});
