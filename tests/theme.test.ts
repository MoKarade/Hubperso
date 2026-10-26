// tests/theme.test.ts — verrou du socle visuel commun (tâche #161), version « sombre seul ».
//
// Les couleurs de l'interface vivent dans `app/globals.css`, en variables, et NULLE PART
// ailleurs. Même nom et même rôle que le verrou d'app-template (`tests/theme.test.ts`), adapté
// à la décision de Marc du 26/09 : le hub est en thème SOMBRE seul, sans bascule. Ce qui est
// déjà mesuré par `tests/themeSombre.test.ts` (contrastes, valeurs du fond, absence de mode
// clair) n'est pas redit ici : ce fichier ajoute le comptage des couleurs figées.
//
// Pourquoi une machine et pas une relecture : une couleur figée est parfaitement lisible dans
// le thème pour lequel on l'a écrite, aucune relecture ne la voit (incident BatchChef du
// 14/08/2026, 21 `bg-white` figés).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = process.cwd();

/** PÉRIMÈTRE POSITIF : les dossiers qui produisent du balisage ou des valeurs rendues. */
const DOSSIERS_RENDUS = ["app", "components", "lib"];

function fichiersDe(dossier: string): string[] {
  const absolu = join(RACINE, dossier);
  try {
    statSync(absolu);
  } catch {
    return [];
  }
  return readdirSync(absolu, { recursive: true, encoding: "utf8" })
    .map((f) => join(dossier, f).split("\\").join("/"))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}

const FICHIERS = DOSSIERS_RENDUS.flatMap(fichiersDe).sort();

function lire(chemin: string): string {
  return readFileSync(join(RACINE, chemin), "utf8");
}

/**
 * Retire les commentaires (`//` en début de ligne ou après une espace, et les commentaires de bloc) : une
 * couleur citée dans une explication n'est pas une couleur rendue. `https://` est conservé
 * (le `//` n'y est pas précédé d'une espace).
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

const MOTIF_COULEUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g;

/** Couleurs en dur d'un texte, une entrée `ligne — valeur` chacune. */
function couleursEnDur(source: string): string[] {
  const fautes: string[] = [];
  sansCommentaires(source)
    .split("\n")
    .forEach((ligne, i) => {
      for (const trouvee of ligne.match(MOTIF_COULEUR) ?? []) fautes.push(`${i + 1} — ${trouvee}`);
    });
  return fautes;
}

/**
 * Exceptions NOMMÉES, avec leur raison. Une valeur absente de la liste d'un fichier échoue :
 * l'exception ne s'élargit pas toute seule.
 */
const EXCEPTIONS: Record<string, { raison: string; valeurs: string[] }> = {
  "app/layout.tsx": {
    raison: "`themeColor` de la barre système, égale à --bg (verrou : themeSombre.test.ts)",
    valeurs: ["#07090D"],
  },
  "app/manifest.ts": {
    raison: "fond et thème du manifeste PWA, égaux à --bg (verrou : themeSombre.test.ts)",
    valeurs: ["#07090D"],
  },
  "lib/couleur.ts": {
    raison: "noir ou blanc posé sur la couleur d'accent d'une APP (champ du contrat)",
    valeurs: ["#000000", "#ffffff"],
  },
  "lib/sources.ts": {
    raison: "couleur de marque de chaque app, donnée du contrat (`couleur`), pas de l'interface",
    valeurs: ["#2DD4BF", "#60A5FA", "#FB923C", "#A3E635", "#F472B6", "#A78BFA"],
  },
};

const CSS = lire("app/globals.css");

/**
 * Classes posées dans le balisage SANS aucune règle dans `globals.css` au 16/10/2026 : l'élément
 * n'a aucun style propre et hérite de son parent. Relevées par ce verrou, pas corrigées ici
 * (aucun changement visible dans cette tâche). Une nouvelle classe sans règle échoue ; quand une
 * règle est écrite, la ligne se retire (le test suivant l'exige).
 */
const ACCROCHES_SANS_REGLE = [
  { classe: "page__sub", vu: "app/attention/page.tsx" },
  { classe: "couts__quota", vu: "app/couts/page.tsx, components/DetailCouts.tsx" },
];

describe("socle visuel — aucune couleur hors des jetons", () => {
  it("voit bien les fichiers de rendu (sinon le garde est vert à vide)", () => {
    expect(FICHIERS.length).toBeGreaterThan(20);
    expect(FICHIERS).toContain("app/page.tsx");
    expect(FICHIERS).toContain("lib/sources.ts");
  });

  it("le détecteur voit une couleur en dur et ignore les commentaires", () => {
    // Preuve que le scan n'est pas vert à vide.
    expect(couleursEnDur('const a = { color: "#fff" };')).toHaveLength(1);
    expect(couleursEnDur("const a = `rgba(0, 0, 0, .5)`;")).toHaveLength(1);
    expect(couleursEnDur("// ex. #ff0000\n/* #00ff00 */\nconst a = 1;")).toEqual([]);
    expect(couleursEnDur('const u = "https://x.test/#a1b2c3";')).toHaveLength(1);
  });

  it("aucune valeur de couleur dans le code rendu, hors exceptions nommées", () => {
    const fautes = FICHIERS.flatMap((f) => {
      const permises = (EXCEPTIONS[f]?.valeurs ?? []).map((v) => v.toLowerCase());
      return couleursEnDur(lire(f))
        .filter((x) => !permises.includes((x.split(" — ")[1] ?? "").toLowerCase()))
        .map((x) => `${f}:${x}`);
    });
    expect(fautes, `Couleurs en dur (déclare un jeton dans globals.css) :\n${fautes.join("\n")}`)
      .toEqual([]);
  });

  it("chaque exception sert encore (sinon on la retire)", () => {
    for (const [fichier, { valeurs }] of Object.entries(EXCEPTIONS)) {
      expect(FICHIERS, `${fichier} n'existe plus`).toContain(fichier);
      const presentes = couleursEnDur(lire(fichier)).map((x) => (x.split(" — ")[1] ?? "").toLowerCase());
      for (const v of valeurs) {
        expect(presentes, `${fichier} : exception ${v} inutilisée`).toContain(v.toLowerCase());
      }
    }
  });

  it("chaque `var(--jeton)` cité est défini dans globals.css", () => {
    // Un nom mal orthographié ne lève rien : la propriété devient invalide et la couleur est
    // simplement héritée. Silencieux.
    const definis = new Set([...CSS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));
    // Un `var(--x, repli)` avec repli explicite est facultatif par construction (jeton posé en
    // ligne par un composant, ou absent) : seule la citation SANS repli doit être définie.
    const sansRepli = /var\(\s*(--[a-z0-9-]+)\s*\)/g;
    const citations = [
      ...FICHIERS.flatMap((f) => [...lire(f).matchAll(sansRepli)].map((m) => [f, m[1] ?? ""] as const)),
      ...[...CSS.matchAll(sansRepli)].map((m) => ["app/globals.css", m[1] ?? ""] as const),
    ];
    expect(citations.length, "aucune citation lue, le garde serait vide").toBeGreaterThan(20);
    const fautes = citations.filter(([, nom]) => !definis.has(nom));
    expect(fautes.map(([f, n]) => `${f} — ${n}`), "Jetons inexistants").toEqual([]);
  });

  it("chaque classe statique utilisée dans le balisage est définie dans globals.css", () => {
    // Une classe sans règle laisse l'élément sans style, et rien ne le dit.
    const definies = new Set([...CSS.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((m) => m[1]));
    const fautes: string[] = [];
    const connues = ACCROCHES_SANS_REGLE.map((a) => a.classe);
    for (const fichier of FICHIERS.filter((f) => f.endsWith(".tsx"))) {
      lire(fichier)
        .split("\n")
        .forEach((ligne, i) => {
          for (const m of ligne.matchAll(/className="([^"]+)"/g)) {
            for (const classe of (m[1] ?? "").split(/\s+/).filter(Boolean)) {
              if (!definies.has(classe) && !connues.includes(classe)) fautes.push(`${fichier}:${i + 1} — ${classe}`);
            }
          }
        });
    }
    expect(fautes, `Classes sans règle (ajoute-la ou retire-la) :\n${fautes.join("\n")}`).toEqual([]);
  });
});

describe("socle visuel — accroches sans règle", () => {
  it("chaque accroche nommée est encore utilisée et toujours sans règle", () => {
    const definies = new Set([...CSS.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((m) => m[1]));
    for (const { classe, vu } of ACCROCHES_SANS_REGLE) {
      expect(definies.has(classe), `.${classe} a maintenant une règle : retire-la de la liste`).toBe(false);
      for (const fichier of vu.split(", ")) {
        expect(lire(fichier), `${fichier} n'utilise plus ${classe} : retire-la de la liste`).toContain(classe);
      }
    }
  });
});

describe("socle visuel — cibles tactiles et champs", () => {
  it("`--cible` vaut au moins 44 px (48 px en pointeur grossier est permis)", () => {
    const valeurs = [...CSS.matchAll(/--cible:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(valeurs.length).toBeGreaterThan(0);
    for (const v of valeurs) expect(v).toBeGreaterThanOrEqual(44);
  });

  it("aucun champ de saisie visible n'a une police sous 16 px", () => {
    // Classes des <input> visibles (hors type="hidden"), lues dans le balisage.
    const classes = new Set<string>();
    for (const f of FICHIERS.filter((x) => x.endsWith(".tsx"))) {
      for (const balise of lire(f).match(/<input\b[^>]*>/g) ?? []) {
        if (/type="hidden"/.test(balise)) continue;
        for (const c of /className="([^"]+)"/.exec(balise)?.[1]?.split(/\s+/) ?? []) classes.add(c);
      }
    }
    expect(classes.size, "aucun champ lu, le garde serait vide").toBeGreaterThan(0);
    const fautes: string[] = [];
    for (const classe of classes) {
      const regles = [...CSS.matchAll(new RegExp(`(?:^|\\n)\\s*\\.${classe}\\s*\\{([^}]*)\\}`, "g"))];
      expect(regles.length, `.${classe} : aucune règle`).toBeGreaterThan(0);
      for (const r of regles) {
        for (const t of (r[1] ?? "").matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
          const px = Number(t[1]) * (t[2] === "rem" ? 16 : 1);
          if (px < 16) fautes.push(`.${classe} : font-size ${t[1]}${t[2]} (${px} px)`);
        }
      }
    }
    expect(fautes, "Champs sous 16 px (iOS zoome tout seul)").toEqual([]);
    // `font: inherit` suit le corps du document : il ne doit pas descendre sous 16 px.
    const corps = /(?:^|\n)(?:html|body)\s*\{([^}]*)\}/g;
    for (const r of CSS.matchAll(corps)) {
      for (const t of (r[1] ?? "").matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
        expect(Number(t[1]) * (t[2] === "rem" ? 16 : 1)).toBeGreaterThanOrEqual(16);
      }
    }
  });
});
