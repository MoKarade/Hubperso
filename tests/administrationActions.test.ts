// tests/administrationActions.test.ts — les Server Actions de l'administration.
//
// Une Server Action est un point d'entrée POST atteignable SANS passer par la page qui
// affiche le bouton : se fier à l'affichage ne protège rien. Ce fichier prouve que chacune
// des cinq actions revérifie côté serveur, AVANT toute écriture :
//   - sans session → refus, aucune écriture, aucune migration ;
//   - session d'un invité (même avec accès au hub) → refus, aucune écriture ;
//   - propriétaire → migrations assurées PUIS écriture, avec les champs du formulaire ;
//   - le propriétaire est reconnu SANS réseau (AUTHORIZED_EMAIL, lib/personnes.ts réel).
//
// Remplacés : la session (`@/auth`), `revalidatePath`, les migrations et les écritures de
// `lib/administration.ts` (couvertes par tests/administration.test.ts sur PGlite).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROPRIETAIRE = "proprietaire@exemple.test";
const INVITE = "invite@exemple.test";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  assurerMigrations: vi.fn(async () => {}),
  ordre: [] as string[],
  ajouterPersonne: vi.fn(),
  supprimerPersonne: vi.fn(),
  definirActif: vi.fn(),
  accorderAcces: vi.fn(),
  retirerAcces: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("next/cache", () => ({ revalidatePath: moq.revalidatePath }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: moq.assurerMigrations }));
vi.mock("@/lib/db", () => ({
  baseConfiguree: () => false,
  db: new Proxy({}, { get: () => { throw new Error("accès base interdit dans ce test"); } }),
}));
vi.mock("@/lib/administration", () => ({
  ajouterPersonne: moq.ajouterPersonne,
  supprimerPersonne: moq.supprimerPersonne,
  definirActif: moq.definirActif,
  accorderAcces: moq.accorderAcces,
  retirerAcces: moq.retirerAcces,
}));

import {
  actionAccorderAcces,
  actionAjouterPersonne,
  actionDefinirActif,
  actionRetirerAcces,
  actionSupprimerPersonne,
} from "@/app/administration/actions";

function formulaire(champs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
}

const ECRITURES = [
  moq.ajouterPersonne,
  moq.supprimerPersonne,
  moq.definirActif,
  moq.accorderAcces,
  moq.retirerAcces,
];

const ACTIONS: [string, (f: FormData) => Promise<void>][] = [
  ["actionAjouterPersonne", actionAjouterPersonne],
  ["actionSupprimerPersonne", actionSupprimerPersonne],
  ["actionDefinirActif", actionDefinirActif],
  ["actionAccorderAcces", actionAccorderAcces],
  ["actionRetirerAcces", actionRetirerAcces],
];

const F = () => formulaire({ email: "cible@exemple.test", nom: "Cible", actif: "true", appId: "batchchef" });

beforeEach(() => {
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  moq.ordre.length = 0;
  moq.assurerMigrations.mockImplementation(async () => {
    moq.ordre.push("migrations");
  });
  for (const e of ECRITURES) e.mockImplementation(async () => {
    moq.ordre.push("ecriture");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  moq.auth.mockReset();
  moq.revalidatePath.mockReset();
  moq.assurerMigrations.mockReset();
  for (const e of ECRITURES) e.mockReset();
});

function aucuneEcriture() {
  for (const e of ECRITURES) expect(e).not.toHaveBeenCalled();
  expect(moq.revalidatePath).not.toHaveBeenCalled();
}

describe.each(ACTIONS)("%s", (_nom, action) => {
  it("sans session : refus, aucune écriture, aucune migration", async () => {
    moq.auth.mockResolvedValue(null);
    await expect(action(F())).rejects.toThrow(/propriétaire/);
    aucuneEcriture();
    expect(moq.assurerMigrations).not.toHaveBeenCalled();
  });

  it("session d'un invité : refus, aucune écriture", async () => {
    moq.auth.mockResolvedValue({ user: { email: INVITE } });
    await expect(action(F())).rejects.toThrow(/propriétaire/);
    aucuneEcriture();
  });

  it("session sans adresse : refus", async () => {
    moq.auth.mockResolvedValue({ user: {} });
    await expect(action(F())).rejects.toThrow(/propriétaire/);
    aucuneEcriture();
  });

  it("sans AUTHORIZED_EMAIL configuré : personne n'est propriétaire", async () => {
    vi.stubEnv("AUTHORIZED_EMAIL", "");
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    await expect(action(F())).rejects.toThrow(/propriétaire/);
    aucuneEcriture();
  });

  it("propriétaire : migrations PUIS écriture, puis revalidation de /administration", async () => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
    await action(F());
    expect(moq.ordre).toEqual(["migrations", "ecriture"]);
    expect(moq.revalidatePath).toHaveBeenCalledWith("/administration");
  });
});

describe("champs transmis par le propriétaire", () => {
  beforeEach(() => {
    moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
  });

  it("ajouter : email et nom ; nom vide → null", async () => {
    await actionAjouterPersonne(formulaire({ email: "a@exemple.test", nom: "A" }));
    expect(moq.ajouterPersonne).toHaveBeenLastCalledWith("a@exemple.test", "A");
    await actionAjouterPersonne(formulaire({ email: "b@exemple.test" }));
    expect(moq.ajouterPersonne).toHaveBeenLastCalledWith("b@exemple.test", null);
  });

  it("supprimer : l'email", async () => {
    await actionSupprimerPersonne(formulaire({ email: "a@exemple.test" }));
    expect(moq.supprimerPersonne).toHaveBeenCalledWith("a@exemple.test");
  });

  it("définir actif : seul « true » active", async () => {
    await actionDefinirActif(formulaire({ email: "a@exemple.test", actif: "true" }));
    expect(moq.definirActif).toHaveBeenLastCalledWith("a@exemple.test", true);
    await actionDefinirActif(formulaire({ email: "a@exemple.test", actif: "oui" }));
    expect(moq.definirActif).toHaveBeenLastCalledWith("a@exemple.test", false);
  });

  it("accorder / retirer : email et appId", async () => {
    await actionAccorderAcces(formulaire({ email: "a@exemple.test", appId: "carai" }));
    expect(moq.accorderAcces).toHaveBeenCalledWith("a@exemple.test", "carai");
    await actionRetirerAcces(formulaire({ email: "a@exemple.test", appId: "carai" }));
    expect(moq.retirerAcces).toHaveBeenCalledWith("a@exemple.test", "carai");
  });

  it("un champ fichier (non texte) devient une chaîne vide, jamais un objet", async () => {
    const f = new FormData();
    f.set("email", new Blob(["x"]), "x.txt");
    await actionSupprimerPersonne(f);
    expect(moq.supprimerPersonne).toHaveBeenCalledWith("");
  });
});
