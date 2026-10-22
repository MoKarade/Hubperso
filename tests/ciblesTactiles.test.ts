// tests/ciblesTactiles.test.ts — tout ce qui se touche fait au moins `--cible` de haut.
//
// ══ POURQUOI CE TEST EXISTE ══════════════════════════════════════════════════════════
//
// Le 15/09, Marc : « tous les boutons sont trop petits ». J'ai agrandi `.widget__detail`,
// `.action` et `.btn` — ceux que j'avais sous les yeux. Le 16/09, il revient : « les
// boutons sont toujours difficilement utilisable sur tel ». Un recensement a alors trouvé
// NEUF classes cliquables dans le JSX, dont QUATRE encore à ~26 px : `.refresh`,
// `.signout`, `.page__retour`, `.alert__link`.
//
// J'avais donc corrigé un tiers du problème en croyant l'avoir réglé. Rien ne pouvait me
// contredire : un bouton trop petit s'affiche parfaitement.
//
// C'est la leçon n° 6 du `CLAUDE.md`, appliquée au CSS : **un contrôle d'exhaustivité ne
// couvre que la forme qu'on lui a apprise**, et ma « forme » était « les classes dont je me
// souviens ». Ce test-ci part de la SOURCE — les `className` posés sur un `<button>`, un
// `<a>` ou un `<Link>` — et exige que chacune porte `var(--cible)`. Une dixième classe
// cliquable ajoutée demain échoue ici avant d'arriver sur le téléphone de Marc.
//
// ⚠️ CE QU'IL NE PROUVE PAS. Il ne juge aucune apparence : ni la couleur, ni l'espacement,
// ni la lisibilité. Il vérifie UNE propriété mécanique, celle qui décide si un pouce
// atteint sa cible. Le reste se juge à l'écran, et ce dépôt n'a pas d'infrastructure de
// rendu — dit franchement plutôt que suggéré par la présence d'un test.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(__dirname, "..");
const CSS = readFileSync(join(RACINE, "app", "globals.css"), "utf8");

/** Tous les `.tsx` de `app/` et `components/`, en descendant les sous-dossiers. */
function fichiersTsx(depuis: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(depuis)) {
    const chemin = join(depuis, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersTsx(chemin));
    else if (entree.endsWith(".tsx")) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Les classes posées sur un élément cliquable.
 *
 * ⚠️ On lit la BALISE, pas un nom qui ressemble à un bouton : `.costs__eyebrow` contient
 * « costs » sans être cliquable, et `.admin__vide` ne l'est pas non plus. Partir de
 * `<button`, `<a` ou `<Link` est le seul critère qui ne se discute pas.
 */
function classesCliquables(): Set<string> {
  const vues = new Set<string>();
  const sources = [
    ...fichiersTsx(join(RACINE, "app")),
    ...fichiersTsx(join(RACINE, "components")),
  ];
  for (const fichier of sources) {
    const code = readFileSync(fichier, "utf8");
    // La balise, puis n'importe quels attributs (y compris sur plusieurs lignes), puis
    // le `className` littéral. Les `className={…}` calculés sont ignorés : leur valeur
    // n'est pas lisible ici, et l'anti-vacuité plus bas garde le test honnête.
    for (const m of code.matchAll(/<(?:button|a|Link)\b[^>]*?className="([^"]+)"/gs)) {
      for (const classe of m[1]!.split(/\s+/)) {
        if (classe) vues.add(classe);
      }
    }
  }
  return vues;
}

/**
 * Classes cliquables DÉLIBÉRÉMENT sans `--cible`, avec leur raison.
 *
 * ⚠️ Toute entrée ajoutée ici doit porter sa justification. C'est la porte de sortie du
 * test, et une liste d'exceptions sans raison la transforme en passoire.
 */
const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    "admin__btn-danger",
    "Posée EN PLUS de `btn` dans le JSX (`className=\"btn admin__btn-danger\"`) : elle ne " +
      "fait que teinter le survol en rouge, la hauteur vient de `.btn`.",
  ],
  [
    "attention__app",
    "Porte déjà `min-height: var(--cible)` dans la même déclaration groupée que " +
      "`.attention__lien` — le test la trouve par ce chemin.",
  ],
  [
    "action--trigger",
    "Posée EN PLUS de `action` dans le JSX (`className=\"action action--trigger\"`) : elle " +
      "ne fait que passer le cadre en pointillés pour distinguer une MUTATION d'un simple " +
      "lien. La hauteur vient de `.action`.",
  ],
]);

/** La règle CSS de cette classe mentionne-t-elle `--cible` ? */
function porteLaCible(classe: string): boolean {
  // Chaque bloc dont le sélecteur contient `.<classe>` (seule ou groupée par virgules),
  // puis on cherche `--cible` dans le corps. Une déclaration groupée
  // (`.attention__app,\n.attention__lien { min-height: var(--cible) }`) compte pour les deux.
  const motif = new RegExp(
    `(^|[^-\\w])\\.${classe}(?![-\\w])[^{}]*\\{([^}]*)\\}`,
    "g",
  );
  for (const m of CSS.matchAll(motif)) {
    if (m[2]!.includes("var(--cible)")) return true;
  }
  return false;
}

describe("le recensement lui-même", () => {
  // ── ANTI-VACUITÉ ────────────────────────────────────────────────────────────────────
  // Sans ces noms ÉCRITS ICI, une expression régulière qui ne trouve plus rien rendrait
  // tout le fichier vert en ne vérifiant RIEN — le mode de panne exact qu'on corrige.
  it("retrouve les classes cliquables connues du hub", () => {
    const vues = classesCliquables();
    for (const attendue of [
      "widget__detail",
      "action",
      "btn",
      "refresh",
      "signout",
      "page__retour",
      "alert__link",
      "login__button",
    ]) {
      expect(vues, `le JSX devrait poser .${attendue} sur un élément cliquable`).toContain(
        attendue,
      );
    }
    expect(vues.size).toBeGreaterThanOrEqual(9);
  });

  it("le jeton `--cible` existe, et vaut plus sur téléphone", () => {
    expect(CSS).toMatch(/--cible:\s*44px/);
    // La bascule à 48 px (minimum Material) sous 560 px, le seuil où la grille passe
    // déjà à une colonne unique.
    expect(CSS).toMatch(/@media\s*\(max-width:\s*560px\)[\s\S]*--cible:\s*48px/);
  });
});

describe("chaque classe cliquable atteint la cible tactile", () => {
  it("aucune n'est laissée à sa hauteur de texte", () => {
    const manquantes = [...classesCliquables()]
      .filter((c) => !EXCEPTIONS.has(c))
      .filter((c) => !porteLaCible(c))
      .sort();
    expect(
      manquantes,
      "ces classes sont posées sur un <button>/<a>/<Link> mais ne déclarent pas " +
        "`min-height: var(--cible)` : sur téléphone, elles se ratent au doigt.",
    ).toEqual([]);
  });

  it("aucune exception sans raison écrite", () => {
    for (const [nom, raison] of EXCEPTIONS) {
      expect(raison.trim().length, `l'exception .${nom} doit porter sa raison`).toBeGreaterThan(
        40,
      );
    }
  });
});

describe("sur téléphone, les boutons prennent la largeur", () => {
  // Une cible de 48 × 100 px se rate LATÉRALEMENT : le pouce est large et arrive de biais.
  // C'est ce qui restait cassé après le premier passage, alors que la hauteur était bonne.
  it("le bouton principal de la carte s'étire d'un bord à l'autre", () => {
    expect(CSS).toMatch(
      /@media\s*\(max-width:\s*560px\)[\s\S]*\.widget__detail\s*\{[^}]*align-self:\s*stretch/,
    );
  });

  it("les actions s'empilent au lieu de se partager une ligne", () => {
    expect(CSS).toMatch(
      /@media\s*\(max-width:\s*560px\)[\s\S]*\.actions\s*\{[^}]*flex-direction:\s*column/,
    );
  });
});
