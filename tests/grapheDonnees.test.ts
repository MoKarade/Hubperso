// tests/grapheDonnees.test.ts — lire les nœuds et les liens d'un graph.html pour la vue 3D.
//
// Le graph.html d'un dépôt est un contenu non fiable : on le lit comme du JSON (jamais exécuté),
// on borne les chaînes, et un format inattendu est un refus avec sa cause, pas un graphe inventé.

import { describe, expect, it } from "vitest";
import {
  DOSSIER_RACINE,
  MAX_LIENS,
  MAX_NOEUDS,
  dossierDe,
  extraireDonnees,
} from "../lib/grapheDonnees";

const noeud = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: id.toUpperCase(),
  source_file: `lib/${id}.ts`,
  file_type: "code",
  size: 14.2,
  degree: 2,
  ...extra,
});
const lien = (from: string, to: string, extra: Record<string, unknown> = {}) => ({
  from,
  to,
  label: "calls",
  confidence: "EXTRACTED",
  ...extra,
});
const page = (noeuds: unknown[], aretes: unknown[]) =>
  `<html><script>\nconst RAW_NODES = ${JSON.stringify(noeuds)};\nconst RAW_EDGES = ${JSON.stringify(aretes)};\nconst LEGEND = [];\n</script></html>`;

describe("extraireDonnees", () => {
  it("lit les nœuds et les liens, en indices", () => {
    const r = extraireDonnees(page([noeud("a"), noeud("b", { source_file: "app/b.tsx", file_type: "document" })], [lien("a", "b")]));
    expect(r).toEqual({
      ok: true,
      donnees: {
        noeuds: [
          { nom: "A", fichier: "lib/a.ts", dossier: "lib", type: "code", degre: 2, taille: 14.2 },
          { nom: "B", fichier: "app/b.tsx", dossier: "app", type: "document", degre: 2, taille: 14.2 },
        ],
        liens: [{ de: 0, vers: 1, relation: "calls", sur: true }],
        liensIgnores: 0,
      },
    });
  });

  it("un lien déduit (INFERRED) n'est pas marqué sûr", () => {
    const r = extraireDonnees(page([noeud("a"), noeud("b")], [lien("a", "b", { confidence: "INFERRED" })]));
    expect(r.ok && r.donnees.liens[0]!.sur).toBe(false);
  });

  it("écarte les liens dont une extrémité manque ou qui bouclent, et les compte", () => {
    const r = extraireDonnees(page([noeud("a"), noeud("b")], [lien("a", "zzz"), lien("a", "a"), lien("a", "b")]));
    expect(r.ok && r.donnees.liens).toHaveLength(1);
    expect(r.ok && r.donnees.liensIgnores).toBe(2);
  });

  it("ignore un identifiant en double plutôt que de fausser les indices", () => {
    const r = extraireDonnees(page([noeud("a"), noeud("a"), noeud("b")], [lien("a", "b")]));
    expect(r.ok && r.donnees.noeuds.map((n) => n.nom)).toEqual(["A", "B"]);
    expect(r.ok && r.donnees.liens[0]).toMatchObject({ de: 0, vers: 1 });
  });

  it("garde un texte hostile comme une simple chaîne, borné à 200 caractères", () => {
    const hostile = `</script><img src=x onerror=alert(1)>${"x".repeat(500)}`;
    const r = extraireDonnees(page([noeud("a", { label: hostile })], []));
    expect(r.ok && r.donnees.noeuds[0]!.nom).toBe(hostile.slice(0, 200));
  });

  it("recalcule le degré quand l'outil ne le publie pas, au lieu d'écrire « 0 lien »", () => {
    const sans = (id: string) => ({ ...noeud(id), degree: undefined });
    const r = extraireDonnees(page([sans("a"), sans("b"), sans("c")], [lien("a", "b"), lien("a", "c")]));
    expect(r.ok && r.donnees.noeuds.map((n) => n.degre)).toEqual([2, 1, 1]);
  });

  it("borne la taille et le type à des valeurs connues", () => {
    const r = extraireDonnees(page([noeud("a", { size: 9999, file_type: "<b>" }), noeud("b", { size: -3 })], []));
    expect(r.ok && r.donnees.noeuds.map((n) => [n.taille, n.type])).toEqual([[40, "autre"], [10, "code"]]);
  });
});

describe("extraireDonnees : refus honnêtes", () => {
  it("RAW_NODES absent", () => {
    expect(extraireDonnees("<html></html>")).toEqual({ ok: false, detail: "RAW_NODES introuvable dans graph.html" });
  });

  it("RAW_EDGES absent", () => {
    const html = `const RAW_NODES = ${JSON.stringify([noeud("a")])};`;
    expect(extraireDonnees(html)).toEqual({ ok: false, detail: "RAW_EDGES introuvable dans graph.html" });
  });

  it("JSON invalide (jamais exécuté pour autant)", () => {
    const html = "const RAW_NODES = [{id: 1}];\nconst RAW_EDGES = [];";
    expect(extraireDonnees(html)).toEqual({ ok: false, detail: "RAW_NODES illisible (JSON invalide)" });
  });

  it("graphe vide ou sans nœud lisible", () => {
    expect(extraireDonnees(page([], []))).toEqual({ ok: false, detail: "le graphe est vide" });
    expect(extraireDonnees(page([{ label: "sans id" }], []))).toEqual({ ok: false, detail: "aucun nœud lisible dans RAW_NODES" });
  });

  it("trop gros pour la 3D : le dit, avec les chiffres", () => {
    const beaucoup = Array.from({ length: MAX_NOEUDS + 1 }, (_, i) => noeud(`n${i}`));
    const r = extraireDonnees(page(beaucoup, []));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain(`limite ${MAX_NOEUDS} et ${MAX_LIENS}`);
  });

  it("n'exécute jamais le contenu : un littéral piégé reste une donnée ou un refus", () => {
    const html = 'const RAW_NODES = [process.exit(1)];\nconst RAW_EDGES = [];';
    expect(extraireDonnees(html).ok).toBe(false);
  });
});

describe("dossierDe", () => {
  it("premier segment du chemin, normalisé", () => {
    expect(dossierDe("lib/a/b.ts")).toBe("lib");
    expect(dossierDe("app\\page.tsx")).toBe("app");
    expect(dossierDe("./docs/x.md")).toBe("docs");
    expect(dossierDe("/scripts/x.sh")).toBe("scripts");
  });

  it("fichier à la racine : un dossier nommé, pas une chaîne vide", () => {
    expect(dossierDe("auth.ts")).toBe(DOSSIER_RACINE);
  });
});
