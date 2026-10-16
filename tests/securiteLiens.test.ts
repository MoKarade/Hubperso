// tests/securiteLiens.test.ts — aucun lien d'app n'est affiché sans contrôle safeHttpUrl.
//
// ══ POURQUOI CE TEST EXISTE ══════════════════════════════════════════════════════════
//
// Le contrat valide `z.string().url()`, qui accepte aussi des schémas dangereux tels que
// `javascript:`, `data:` ou `file:`. Le hub affiche ces `href` sous forme de liens
// cliquables dans les composants UI.
//
// Pour éviter qu'un composant présent ou futur oublie de passer un `href` ou une `url`
// d'app par `safeHttpUrl` (lib/url.ts), ce test inspecte le code source de `components/` et
// `app/`. Il garantit que tout `href` issu d'un résumé d'app (action.href, alert.href,
// summary.app.url, etc.) est systématiquement assaini par `safeHttpUrl` avant d'être
// rendu dans une balise `<a href=...>`.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(__dirname, "..");
const lire = (...p: string[]) => readFileSync(join(RACINE, ...p), "utf8");

/** Tous les fichiers .tsx et .ts dans un dossier donné. */
function listerFichiersCode(dossier: string): string[] {
  const resultat: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    const stat = statSync(chemin);
    if (stat.isDirectory()) {
      resultat.push(...listerFichiersCode(chemin));
    } else if (entree.endsWith(".tsx") || entree.endsWith(".ts")) {
      resultat.push(chemin);
    }
  }
  return resultat;
}

/** Propriétés de summary/contrat qui portent des URL d'apps et doivent passer par safeHttpUrl. */
const MOTIFS_PROPRIETES_RESUME = [
  "action.href",
  "alert.href",
  "alerte.href",
  "summary.app.url",
  "app.url",
  "result.summary.app.url",
  "summary.recommendation.href",
  "brute.href",
] as const;

/** Composants et vues répertoriés qui affichent des liens issus du summary d'une app. */
const COMPOSANTS_SECURISES_ATTENDUS = [
  "components/ActionList.tsx",
  "components/AlertBanner.tsx",
  "components/AlertList.tsx",
  "components/AppWidget.tsx",
  "components/DetailAlertes.tsx",
  "app/app/[id]/page.tsx",
] as const;

/** Nettoie le code source de ses commentaires (mono-ligne et multi-lignes). */
function nettoyerCommentaires(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
}

describe("Sécurité des liens d'app : filtrage obligatoire par safeHttpUrl", () => {
  it("les composants et pages répertoriés importent et utilisent safeHttpUrl", () => {
    for (const relPath of COMPOSANTS_SECURISES_ATTENDUS) {
      const contenu = lire(relPath);
      expect(
        contenu,
        `${relPath} doit importer ou utiliser safeHttpUrl`,
      ).toContain("safeHttpUrl");
    }
  });

  it("aucun fichier de components/ ou app/ ne rend une propriété de summary dans href sans safeHttpUrl", () => {
    const fichiers = [
      ...listerFichiersCode(join(RACINE, "components")),
      ...listerFichiersCode(join(RACINE, "app")),
    ];

    for (const fichier of fichiers) {
      const relPath = fichier.replace(`${RACINE}/`, "");
      const contenuBrut = readFileSync(fichier, "utf8");
      const codePropre = nettoyerCommentaires(contenuBrut);

      // 1. Détecter si une propriété du summary est directement rendue dans un <a ... href={...}>
      for (const prop of MOTIFS_PROPRIETES_RESUME) {
        const usageBrutA = new RegExp(`<a\\b[^>]*\\bhref=\\s*{\\s*${prop.replace(".", "\\.")}\\s*}`, "g");
        expect(
          usageBrutA.test(codePropre),
          `${relPath} rend ${prop} directement dans un <a href={...}> sans filtrage safeHttpUrl`,
        ).toBe(false);
      }

      // 2. Vérifier que pour chaque utilisation de propriété de summary (hors input hidden), safeHttpUrl est appliqué
      for (const statement of codePropre.split(";")) {
        const stmtSansEspaces = statement.replace(/\s+/g, " ").trim();
        if (!stmtSansEspaces) continue;

        for (const prop of MOTIFS_PROPRIETES_RESUME) {
          if (stmtSansEspaces.includes(prop)) {
            if (
              relPath === "components/BoutonTrigger.tsx" &&
              stmtSansEspaces.includes("type=\"hidden\"")
            ) {
              continue;
            }

            expect(
              stmtSansEspaces.includes("safeHttpUrl"),
              `${relPath} utilise ${prop} dans l'instruction "${stmtSansEspaces}" sans appeler safeHttpUrl`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("les fonctions d'aide (lib/carte.ts et lib/attention.ts) filtrent les liens par safeHttpUrl", () => {
    const carteCode = lire("lib", "carte.ts");
    expect(
      carteCode,
      "lib/carte.ts doit appliquer safeHttpUrl pour la recommandation",
    ).toContain("safeHttpUrl(brute.href)");

    const attentionCode = lire("lib", "attention.ts");
    expect(
      attentionCode,
      "lib/attention.ts doit appliquer safeHttpUrl pour les alertes",
    ).toContain("safeHttpUrl(alerte.href)");
  });
});
