// tests/bilans.test.ts — ce qu'est un bilan pour le hub (lib/bilans.ts) : le nom fait foi, rien n'est deviné.
// Données FICTIVES seulement : le dépôt est public.

import { describe, expect, it } from "vitest";
import {
  bilanDepuisFichier,
  CSP_BILAN,
  classerBilans,
  fichiersDeListeDrive,
  GARDES,
  idDriveValide,
  SANDBOX_BILAN,
} from "@/lib/bilans";

const ID = "1AbCdEfGhIjKlMnOp";
const fichier = (name: string, extra: Record<string, unknown> = {}) => ({ id: ID, name, mimeType: "text/html", ...extra });

describe("bilanDepuisFichier", () => {
  it("lit le genre et la date dans le nom, pas dans l'heure de dépôt", () => {
    expect(bilanDepuisFichier(fichier("bilan-jour-2026-10-28.html", { modifiedTime: "2020-01-01T00:00:00Z" }))).toEqual({
      id: ID,
      genre: "jour",
      date: "2026-10-28",
      nom: "bilan-jour-2026-10-28.html",
    });
    expect(bilanDepuisFichier(fichier("bilan-semaine-2026-11-01.html"))?.genre).toBe("semaine");
  });

  it("refuse ce qui sort de la convention : nom, date impossible, type, identifiant", () => {
    for (const nom of ["brief.html", "bilan-jour-2026-10-28.html.exe", "bilan-mois-2026-10-28.html", "bilan-jour-2026-02-30.html", "Bilan-jour-2026-10-28.html"]) {
      expect(bilanDepuisFichier(fichier(nom)), nom).toBeNull();
    }
    expect(bilanDepuisFichier(fichier("bilan-jour-2026-10-28.html", { mimeType: "application/pdf" }))).toBeNull();
    expect(bilanDepuisFichier(fichier("bilan-jour-2026-10-28.html", { id: "../x" }))).toBeNull();
    expect(bilanDepuisFichier(null)).toBeNull();
    expect(bilanDepuisFichier("bilan-jour-2026-10-28.html")).toBeNull();
  });
});

describe("classerBilans", () => {
  const f = (name: string, id: string) => fichier(name, { id });

  it("les plus récents d'abord, un seul par genre et par date", () => {
    const bilans = classerBilans([
      f("bilan-jour-2026-10-26.html", "aaaaaaaaaa1"),
      f("bilan-jour-2026-10-28.html", "aaaaaaaaaa2"),
      f("bilan-jour-2026-10-28.html", "aaaaaaaaaa3"),
      f("bilan-semaine-2026-10-25.html", "aaaaaaaaaa4"),
      f("n-importe-quoi.html", "aaaaaaaaaa5"),
    ]);
    // Par date décroissante (28/10, 26/10, puis la semaine du 25/10), doublon écarté.
    expect(bilans.map((b) => b.id)).toEqual(["aaaaaaaaaa2", "aaaaaaaaaa1", "aaaaaaaaaa4"]);
  });

  it("garde 60 jours et 12 semaines, sans toucher à l'historique de Drive", () => {
    const iso = (debut: number, pas: number) => (i: number) => new Date(debut + i * pas * 86_400_000).toISOString().slice(0, 10);
    const jour = iso(Date.UTC(2026, 0, 1), 1);
    const semaine = iso(Date.UTC(2025, 0, 5), 7);
    const jours = Array.from({ length: 70 }, (_, i) => f(`bilan-jour-${jour(i)}.html`, `jj${String(i).padStart(9, "0")}`));
    const semaines = Array.from({ length: 20 }, (_, i) => f(`bilan-semaine-${semaine(i)}.html`, `ss${String(i).padStart(9, "0")}`));
    const bilans = classerBilans([...jours, ...semaines]);
    expect(bilans.filter((b) => b.genre === "jour")).toHaveLength(GARDES.jour);
    expect(bilans.filter((b) => b.genre === "semaine")).toHaveLength(GARDES.semaine);
    // Ce sont les plus récents qui restent.
    expect(bilans.find((b) => b.genre === "jour")?.date).toBe(jour(69));
  });

  it("aucun bilan : liste vide, jamais un bilan inventé", () => {
    expect(classerBilans([])).toEqual([]);
  });
});

describe("liste Drive et identifiants", () => {
  it("une réponse hors forme n'est pas réparée", () => {
    expect(fichiersDeListeDrive({ files: [] })).toEqual([]);
    expect(fichiersDeListeDrive({ files: "x" })).toBeNull();
    expect(fichiersDeListeDrive(null)).toBeNull();
    expect(fichiersDeListeDrive([])).toBeNull();
  });

  it("un identifiant Drive ne porte que ses caractères", () => {
    expect(idDriveValide(ID)).toBe(true);
    for (const mauvais of ["", "court", "a b c d e f g h i j k", "x' or '1'='1 aaaa", "../../etc/passwd", 42, undefined]) {
      expect(idDriveValide(mauvais), String(mauvais)).toBe(false);
    }
  });
});

describe("isolement du document d'un bilan", () => {
  it("origine opaque, aucun réseau, seul le hub le met en cadre", () => {
    expect(SANDBOX_BILAN).not.toContain("allow-same-origin");
    expect(SANDBOX_BILAN).not.toContain("allow-top-navigation");
    expect(CSP_BILAN).toContain("connect-src 'none'");
    expect(CSP_BILAN).toContain("default-src 'none'");
    expect(CSP_BILAN).toContain("frame-ancestors 'self'");
    expect(CSP_BILAN).toContain("img-src data:");
    expect(CSP_BILAN).not.toMatch(/https?:/);
  });
});
