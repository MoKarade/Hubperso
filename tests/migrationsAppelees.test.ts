// tests/migrationsAppelees.test.ts — l'horloge ne savait pas créer sa propre table.
//
// ── CE QUE CE TEST AURAIT ATTRAPÉ ────────────────────────────────────────────────────
//
// Le 15/09/2026, `DATABASE_URL` venait d'être posée et redéployée. Le workflow `Relevé`
// répondait `HTTP 200`, « aucun relevé écrit — le dernier date de moins de l'espacement
// minimal », run vert. En réalité les CINQ insertions échouaient sur
// `relation "releves" does not exist` : aucune table n'existait.
//
// Cause : `app/api/cron/releve/route.ts` n'appelait pas `assurerMigrations()`. Tous les
// autres points d'entrée le font — `lib/gardeHub.ts` pour chaque page, `app/api/acces` pour
// les apps. Le regroupement des requêtes Vercel l'a prouvé : depuis le déploiement, une
// SEULE route avait été servie, `/api/cron/releve`. Aucune page chargée, donc aucune
// migration jouée.
//
// C'est la leçon n°5 du `CLAUDE.md` un étage plus bas — « l'observateur était requis pour
// l'observation » — appliquée non plus aux données mais au SCHÉMA. La route bâtie pour
// tourner sans personne devant était la seule à dépendre d'un humain pour démarrer.
//
// ── POURQUOI CETTE RÈGLE, ET PAS « la route cron appelle assurerMigrations » ─────────
//
// Une assertion sur un fichier nommé ne couvrirait que le trou déjà bouché. La règle est :
// TOUT point d'entrée de `app/` qui touche la base doit s'assurer du schéma. C'est la leçon
// n°3 prise au sérieux — un test d'exhaustivité ne couvre que la forme qu'on lui a apprise,
// alors on lui apprend l'invariant plutôt que le cas.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE_APP = resolve(process.cwd(), "app");

/** Les modules qui PARLENT à la base. Y toucher implique d'avoir assuré le schéma. */
const MODULES_BASE = ["@/lib/historiqueDb", "@/lib/personnes", "@/lib/administration"];

/**
 * Ce qui atteste que le schéma est assuré. `exigerAccesHub` et `exigerProprietaire`
 * comptent : elles appellent `assurerMigrations()` en premier (`lib/gardeHub.ts`), et
 * l'exiger DEUX fois sur une page n'ajouterait rien qu'un appel.
 */
const PREUVES = ["assurerMigrations", "exigerAccesHub", "exigerProprietaire"];

/**
 * Retire commentaires et chaînes avant toute recherche.
 *
 * ⚠️ SANS ÇA, CE TEST EST UN FIGURANT — mesuré par mutation le 15/09/2026. La première
 * version cherchait le simple mot « assurerMigrations » dans le fichier : commenter l'appel
 * laissait l'import ET le commentaire explicatif, donc le mot restait présent et le test
 * restait VERT. Un test d'exhaustivité qui se satisfait d'une mention dans un commentaire ne
 * garde rien du tout — il garde l'intention écrite, pas le code exécuté.
 */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/**
 * L'appel, pas la mention : `nom(` dans du code sans commentaires NI chaînes.
 *
 * Les chaînes ne sont retirées qu'ICI, jamais pour détecter les modules touchés : un
 * `import … from "@/lib/personnes"` vit précisément dans une chaîne. Les avoir retirées des
 * deux côtés a rendu la liste des fichiers concernés VIDE au premier essai — le garde-fou
 * d'anti-vacuité l'a attrapé immédiatement, ce qui est exactement son rôle.
 */
function appelle(source: string, nom: string): boolean {
  const sansChaines = codeSeul(source).replace(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g, '""');
  return new RegExp(`\\b${nom}\\s*\\(`).test(sansChaines);
}

const NOMS_ENTREE = ["page.tsx", "route.ts", "actions.ts"];

function entreesDeApp(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...entreesDeApp(chemin));
    else if (NOMS_ENTREE.includes(entree)) trouves.push(chemin);
  }
  return trouves;
}

describe("tout point d'entrée qui touche la base assure le schéma", () => {
  const entrees = entreesDeApp(RACINE_APP).map((p) => ({
    relatif: relative(RACINE_APP, p).replace(/\\/g, "/"),
    source: readFileSync(p, "utf8"),
  }));

  const concernees = entrees.filter((e) =>
    MODULES_BASE.some((m) => codeSeul(e.source).includes(m)),
  );

  it("trouve bien des points d'entrée qui touchent la base (anti-vacuité)", () => {
    // Sans ce garde-fou, renommer un module de base rendrait la liste VIDE et le test
    // suivant passerait en n'affirmant plus rien — vert, et aveugle.
    expect(concernees.length).toBeGreaterThanOrEqual(3);
  });

  it("énumère les trois formes de point d'entrée de Next (anti-vacuité)", () => {
    // La leçon n°3, et n°6 : le test des gardes a raté `actions.ts` en août puis `route.ts`
    // en septembre, chaque fois parce qu'il ne connaissait pas la forme.
    //
    // ⚠️ LES TROIS NOMS SONT ÉCRITS EN DUR ICI, PAS LUS DANS `NOMS_ENTREE` — mesuré par
    // mutation. Une boucle `for (const nom of NOMS_ENTREE)` ne prouve rien : retirer
    // « route.ts » de la constante retirait aussi son propre contrôle, et la suite passait
    // au vert avec trois tests EN MOINS. Un garde-fou qui lit la valeur qu'il garde n'est
    // pas un garde-fou.
    expect(NOMS_ENTREE).toEqual(["page.tsx", "route.ts", "actions.ts"]);
    for (const nom of ["page.tsx", "route.ts", "actions.ts"]) {
      expect(entrees.some((e) => e.relatif.endsWith(nom))).toBe(true);
    }
  });

  it.each(
    entreesDeApp(RACINE_APP).map((p) => relative(RACINE_APP, p).replace(/\\/g, "/")),
  )("%s — s'il touche la base, il assure le schéma", (relatif) => {
    const source = readFileSync(join(RACINE_APP, relatif), "utf8");
    if (!MODULES_BASE.some((m) => codeSeul(source).includes(m))) return;
    expect(
      PREUVES.some((preuve) => appelle(source, preuve)),
      `${relatif} lit ou écrit la base sans APPELER aucune de ces fonctions : ${PREUVES.join(", ")}. ` +
        "Une route atteinte avant toute page trouverait des tables inexistantes.",
    ).toBe(true);
  });
});
