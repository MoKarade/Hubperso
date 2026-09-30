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
  "confidentialite/page.tsx":
    "page légale publique exigée par la vérification Google OAuth (Test → Production) : le robot de revue de Google n'a pas de session — voir lib/authGuard.ts (isPublicPath)",
  "conditions/page.tsx":
    "même raison que confidentialite/page.tsx : page légale publique, sans session",
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

// ── LES ROUTE HANDLERS SONT UNE TROISIÈME FORME DE FICHIER ──────────────────────────
//
// La leçon n°3 du CLAUDE.md dit qu'un test d'exhaustivité ne couvre que la forme de fichier
// qu'on lui a apprise. Elle a été écrite le 20/08 après avoir découvert que ce test
// n'énumérait pas les `actions.ts`. Elle restait vraie : `app/**/route.ts` est une TROISIÈME
// forme, et elle n'était pas énumérée non plus — alors que `app/api/acces/route.ts` expose
// une lecture du modèle d'accès depuis le 14/08.
//
// Un route handler n'a pas de session à exiger quand il est appelé par une machine : les
// exceptions sont donc légitimes. Mais une exception ne veut pas dire « rien à prouver » —
// on exige la PREUVE d'une authentification de remplacement, c'est-à-dire une comparaison
// de secret à temps constant. Sans cette exigence, la liste d'exceptions deviendrait une
// porte de sortie : il suffirait d'y ajouter une ligne pour qu'une route n'ait plus rien à
// démontrer, ce qui est exactement le contournement que ce fichier existe pour empêcher.
describe("tout route handler est gardé, ou authentifié autrement et le prouve", () => {
  /** Routes appelées par une MACHINE (pas de cookie de session), et leur auth de remplacement. */
  const ROUTES_A_JETON: Record<string, string> = {
    "api/acces/route.ts":
      "serveur à serveur : une app demande si une adresse a accès chez elle, identifiée par son HUB_TOKEN",
    "api/cron/releve/route.ts":
      "l'horloge du hub, appelée par un workflow GitHub Actions et authentifiée par CRON_SECRET",
  };

  /**
   * Routes qui SONT le mécanisme d'authentification — troisième catégorie, et elle ne
   * prouve rien d'autre qu'elle-même : exiger une session pour se connecter serait une
   * boucle, et exiger une comparaison de secret n'aurait pas de sens (Auth.js gère son
   * propre état). Elle est nommée séparément pour qu'on ne puisse pas y glisser une route
   * ordinaire en profitant de la dispense.
   */
  const ROUTES_D_AUTH: Record<string, string> = {
    "api/auth/[...nextauth]/route.ts":
      "le handler d'Auth.js : c'est le flux de connexion lui-même, il ne peut pas exiger d'être déjà connecté",
  };

  /**
   * Routes PUBLIQUES SANS AUCUNE authentification — quatrième catégorie, la plus étroite.
   * Elles n'ont ni session ni secret, donc leur seule protection est de n'avoir RIEN à
   * donner : la preuve exigée plus bas est qu'elles n'importent aucun module qui porte une
   * donnée personnelle, un jeton d'app ou la liste des personnes.
   */
  const ROUTES_PUBLIQUES_MUETTES: Record<string, string> = {
    "api/sante/route.ts":
      "sonde de santé de la vigie de l'Atelier : ne rend que { ok, cause }, jamais une donnée ni un nom de variable",
  };

  const routes = fichiersDeApp(RACINE_APP, "route.ts").map((p) => ({
    relatif: relative(RACINE_APP, p).replace(/\\/g, "/"),
    source: readFileSync(p, "utf8"),
  }));

  it("trouve bien les route handlers (sinon ce test ne prouverait rien)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(2);
    expect(routes.map((r) => r.relatif)).toContain("api/acces/route.ts");
  });

  it("chacun exige l'accès au hub, ou figure dans la liste à jeton", () => {
    for (const route of routes) {
      if (
        ROUTES_A_JETON[route.relatif] ||
        ROUTES_D_AUTH[route.relatif] ||
        ROUTES_PUBLIQUES_MUETTES[route.relatif]
      ) {
        continue;
      }
      const gardee =
        route.source.includes("exigerAccesHub()") ||
        route.source.includes("exigerProprietaire()") ||
        route.source.includes("auth()");
      expect(
        gardee,
        `${route.relatif} n'est ni gardé ni déclaré comme route à jeton (voir ROUTES_A_JETON)`,
      ).toBe(true);
    }
  });

  it("les routes d'authentification déclarées existent vraiment", () => {
    const relatifs = routes.map((r) => r.relatif);
    for (const [exception, raison] of Object.entries(ROUTES_D_AUTH)) {
      expect(relatifs, `exception morte : ${exception} (${raison})`).toContain(exception);
    }
  });

  it("une route à jeton PROUVE sa comparaison de secret à temps constant", () => {
    // `===` sur un secret s'arrête au premier octet différent, ce qui laisse mesurer sa
    // progression et deviner le jeton octet par octet. `memeJeton` (lib/jetonApp.ts) est la
    // seule forme admise dans ce dépôt, et l'exiger ici empêche qu'une future route à jeton
    // reparte d'une comparaison naïve.
    for (const [relatif, raison] of Object.entries(ROUTES_A_JETON)) {
      const route = routes.find((r) => r.relatif === relatif);
      expect(route, `exception morte : ${relatif} (${raison})`).toBeDefined();
      expect(
        route!.source.includes("memeJeton") || route!.source.includes("appDuJeton"),
        `${relatif} est déclaré à jeton mais ne compare aucun secret à temps constant`,
      ).toBe(true);
    }
  });

  it("chaque route à jeton est aussi laissée passer par isPublicPath, et réciproquement", () => {
    // Le couplage qui se périme en silence : une route à jeton que `isPublicPath` ne laisse
    // pas passer renvoie une redirection HTML vers /login au lieu de son JSON (c'était le
    // défaut n°1 du squelette d'app du 27/07). Et une route laissée passer par
    // `isPublicPath` sans figurer ici serait une route publique que personne n'a voulue.
    const source = readFileSync(resolve(process.cwd(), "lib/authGuard.ts"), "utf8");
    const declaresDansLeGarde = [...source.matchAll(/pathname === "(\/api\/[^"]+)"/g)].map(
      (m) => m[1]!,
    );
    const attendus = [
      ...Object.keys(ROUTES_A_JETON),
      ...Object.keys(ROUTES_PUBLIQUES_MUETTES),
    ].map((relatif) => `/${relatif.replace(/\/route\.ts$/, "")}`);
    expect([...declaresDansLeGarde].sort()).toEqual([...attendus].sort());
  });

  it("une route publique muette PROUVE qu'elle n'a rien à donner", () => {
    // Sans session ni secret, la seule défense est l'absence de donnée. Importer l'un de
    // ces modules suffirait à rendre possible la fuite d'une personne, d'un historique,
    // d'un résumé d'app ou d'un jeton — c'est donc l'import lui-même qui est interdit.
    const INTERDITS = [
      "@/lib/personnes",
      "@/lib/historiqueDb",
      "@/lib/administration",
      "@/lib/sources",
      "@/lib/fetchSummary",
      "@/lib/jetonApp",
      "@/auth",
    ];
    for (const [relatif, raison] of Object.entries(ROUTES_PUBLIQUES_MUETTES)) {
      const route = routes.find((r) => r.relatif === relatif);
      expect(route, `exception morte : ${relatif} (${raison})`).toBeDefined();
      for (const interdit of INTERDITS) {
        expect(route!.source, `${relatif} importe ${interdit}`).not.toContain(`"${interdit}"`);
      }
      expect(route!.source, `${relatif} doit interdire le cache`).toContain("no-store");
    }
  });
});
