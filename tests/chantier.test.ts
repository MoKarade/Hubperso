// tests/chantier.test.ts — tests de la page Chantier et de sa logique d'affichage.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { etatChantier } from "../lib/chantier";
import { formatDateTime } from "../lib/format";

// Hissage des mocks pour la page
const stateMock = vi.hoisted(() => ({
  proprietaireValide: true,
  baseConfiguree: true,
  releve: null as { recuLe: Date; envoyeLe: Date; donneesGzB64: string } | null,
  erreurDb: null as Error | null,
}));

vi.mock("../lib/gardeHub", () => ({
  exigerProprietaire: async () => {
    if (!stateMock.proprietaireValide) {
      const err = new Error("NEXT_REDIRECT");
      (err as { digest?: string }).digest = "NEXT_REDIRECT;=/";
      throw err;
    }
    return { user: { email: "marc@exemple.com" } };
  },
}));

vi.mock("../lib/db", () => ({
  baseConfiguree: () => stateMock.baseConfiguree,
}));

vi.mock("../lib/ganttDb", () => ({
  lireGantt: async () => {
    if (stateMock.erreurDb) throw stateMock.erreurDb;
    return stateMock.releve;
  },
}));

const ChantierPage = (await import("../app/chantier/page")).default;

describe("lib/chantier — etatChantier (fonctions pures)", () => {
  it("sans relevé (null) : rend « Aucun relevé reçu pour l'instant »", () => {
    const res = etatChantier(null);
    expect(res).toEqual({
      type: "aucun",
      message: "Aucun relevé reçu pour l'instant",
    });
  });

  it("avec une erreur : rend « Le relevé est indisponible : … » avec le détail", () => {
    const res = etatChantier(null, new Error("Connexion refusée"));
    expect(res).toEqual({
      type: "indisponible",
      message: "Le relevé est indisponible : Connexion refusée",
    });
  });

  it("avec une erreur non-Error : convertit en texte", () => {
    const res = etatChantier(null, "Echec reseau");
    expect(res).toEqual({
      type: "indisponible",
      message: "Le relevé est indisponible : Echec reseau",
    });
  });

  it("avec un relevé : formate l'heure de réception et l'heure d'envoi du PC avec formatDateTime", () => {
    const recuIso = "2026-10-24T14:05:00.000Z";
    const envoyeIso = "2026-10-24T14:00:00.000Z";

    const res = etatChantier({
      recuLe: new Date(recuIso),
      envoyeLe: new Date(envoyeIso),
    });

    expect(res.type).toBe("ok");
    if (res.type === "ok") {
      expect(res.recuTexte).toBe(`Dernier relevé reçu à ${formatDateTime(recuIso)}`);
      expect(res.envoyeTexte).toBe(`Envoyé par le PC le ${formatDateTime(envoyeIso)}`);
    }
  });

  it("ne divulgue ni ne traite aucune donnée privée ou tâche du relevé", () => {
    const releve = {
      recuLe: new Date("2026-10-24T14:05:00.000Z"),
      envoyeLe: new Date("2026-10-24T14:00:00.000Z"),
      // Contenu privé simulant un relevé Gantt complet
      donneesGzB64: "H4sIAAAA",
      etat: { tachePrivee: "Projet Secret" },
    };

    const res = etatChantier(releve);
    const chaineResultat = JSON.stringify(res);
    expect(chaineResultat).not.toContain("tachePrivee");
    expect(chaineResultat).not.toContain("Projet Secret");
    expect(chaineResultat).not.toContain("H4sIAAAA");
  });
});

describe("app/chantier/page.tsx", () => {
  beforeEach(() => {
    stateMock.proprietaireValide = true;
    stateMock.baseConfiguree = true;
    stateMock.releve = null;
    stateMock.erreurDb = null;
  });

  it("exige d'être propriétaire (redirige si non propriétaire)", async () => {
    stateMock.proprietaireValide = false;
    await expect(ChantierPage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("affiche le message indisponible quand la base n'est pas configurée", async () => {
    stateMock.baseConfiguree = false;
    const jsx = await ChantierPage();
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Le relevé est indisponible : DATABASE_URL absente");
  });

  it("affiche le message 'Aucun relevé reçu pour l'instant' quand la base n'a aucun relevé", async () => {
    const jsx = await ChantierPage();
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Aucun relevé reçu pour l&#x27;instant");
  });

  it("affiche les deux heures quand la base contient un relevé", async () => {
    const recuIso = "2026-10-24T14:05:00.000Z";
    const envoyeIso = "2026-10-24T14:00:00.000Z";
    stateMock.releve = {
      recuLe: new Date(recuIso),
      envoyeLe: new Date(envoyeIso),
      donneesGzB64: "H4sI...",
    };

    const jsx = await ChantierPage();
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain(`Dernier relevé reçu à ${formatDateTime(recuIso)}`);
    expect(html).toContain(`Envoyé par le PC le ${formatDateTime(envoyeIso)}`);
  });

  it("affiche le message indisponible avec le détail si la base lève une erreur", async () => {
    stateMock.erreurDb = new Error("Base inaccessible");
    const jsx = await ChantierPage();
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("Le relevé est indisponible : Base inaccessible");
  });
});
