// tests/gardePages.test.ts — la garde qu'on oublie de mettre.
//
// Chaque page de `app/` qui affiche des données doit passer par `exigerAccesHub()` — ou
// par `exigerProprietaire()`, qui l'appelle en premier et resserre ensuite sur le seul
// propriétaire (lib/gardeHub.ts) : une garde plus stricte satisfait la même exigence. Une
// page ajoutée sans aucune des deux s'afficherait pour toute personne CONNECTÉE — donc,
// depuis que le hub accepte des invités, pour quelqu'un qui n'a accès qu'à BatchChef.
//
// Rien dans le code ne rend cet oubli visible : la page marche, elle marche même très bien,
// simplement pour trop de monde. Ce test énumère les fichiers réels plutôt que de faire
// confiance à une liste tenue à la main — c'est le même principe que `envExample.test.ts`.
//
// Les exceptions sont NOMMÉES ci-dessous, avec leur raison. Ajouter une page à cette liste
// doit être un geste conscient, pas un contournement de test.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE_APP = resolve(process.cwd(), "app");

/** Pages qui ne DOIVENT PAS exiger l'accès au hub, et pourquoi. */
const EXCEPTIONS: Record<string, string> = {
  "login/page.tsx":
    "la page de connexion : exiger une session pour se connecter serait une boucle",
  "sans-acces/page.tsx":
    "elle s'adresse précisément à qui est connecté SANS accès au hub — l'y renvoyer serait une boucle",
};

function fichiersDeApp(dossier: string, nom: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersDeApp(chemin, nom));
    } else if (entree === nom) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

const pagesDeApp = (dossier: string) => fichiersDeApp(dossier, "page.tsx");
const actionsDeApp = (dossier: string) => fichiersDeApp(dossier, "actions.ts");

describe("toute page du hub est gardée", () => {
  const pages = pagesDeApp(RACINE_APP).map((p) => ({
    chemin: p,
    relatif: relative(RACINE_APP, p).replace(/\\/g, "/"),
    source: readFileSync(p, "utf8"),
  }));

  it("trouve bien les pages (sinon ce test ne prouverait rien)", () => {
    // Sans cette vérification, un chemin de racine devenu faux ferait passer le test avec
    // zéro page examinée — vert, et parfaitement inutile.
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.map((p) => p.relatif)).toContain("page.tsx");
  });

  it("chaque page appelle exigerAccesHub ou exigerProprietaire, sauf les exceptions nommées", () => {
    for (const page of pages) {
      const raison = EXCEPTIONS[page.relatif];
      if (raison) {
        expect(page.source, `${page.relatif} — exception : ${raison}`).not.toContain(
          "exigerAccesHub",
        );
        expect(page.source, `${page.relatif} — exception : ${raison}`).not.toContain(
          "exigerProprietaire",
        );
        continue;
      }
      const gardee =
        page.source.includes("exigerAccesHub()") ||
        page.source.includes("exigerProprietaire()");
      expect(
        gardee,
        `${page.relatif} n'appelle ni exigerAccesHub() ni exigerProprietaire()`,
      ).toBe(true);
    }
  });

  it("les exceptions déclarées existent vraiment", () => {
    // Une exception qui ne correspond à aucun fichier est une garde qu'on croit levée
    // quelque part, et qui ne l'est nulle part : le jour où la page revient, elle revient
    // non gardée.
    const relatifs = pages.map((p) => p.relatif);
    for (const exception of Object.keys(EXCEPTIONS)) {
      expect(relatifs, `exception morte : ${exception}`).toContain(exception);
    }
  });
});

// ── LES SERVER ACTIONS SONT DES POINTS D'ENTRÉE, PAS DES DÉTAILS DE PAGE ────────────
//
// Le bloc ci-dessus n'énumère que les `page.tsx`. Or un fichier `"use server"` expose des
// fonctions appelables en POST **sans passer par la page qui affiche le bouton** : cacher
// le bouton ne garde rien. Le trou est plus discret que celui d'une page non gardée —
// il n'y a même pas d'URL à visiter pour s'en apercevoir.
//
// On n'exige pas `exigerAccesHub()` ici : cette fonction `redirect()`, ce qui a du sens
// pour une page et pas pour une action, qui doit RENDRE une erreur. On exige donc la
// preuve minimale qu'une décision d'autorisation est prise : lire la session ET la
// confronter au modèle d'accès.
describe("toute Server Action revérifie l'autorisation", () => {
  const actions = actionsDeApp(RACINE_APP).map((p) => ({
    relatif: relative(RACINE_APP, p).replace(/\\/g, "/"),
    source: readFileSync(p, "utf8"),
  }));

  it("trouve bien les fichiers d'actions (sinon ce test ne prouverait rien)", () => {
    expect(actions.length).toBeGreaterThanOrEqual(1);
  });

  it("chacun lit la session et interroge le modèle d'accès", () => {
    for (const action of actions) {
      expect(action.source, `${action.relatif} ne déclare pas "use server"`).toContain(
        '"use server"',
      );
      expect(action.source, `${action.relatif} n'appelle pas auth()`).toContain("auth()");
      const decide =
        action.source.includes("aAcces(") || action.source.includes("estProprietaire(");
      expect(
        decide,
        `${action.relatif} lit la session mais n'en tire aucune décision (ni aAcces ni estProprietaire)`,
      ).toBe(true);
    }
  });
});
