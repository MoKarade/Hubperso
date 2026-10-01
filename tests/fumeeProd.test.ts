// tests/fumeeProd.test.ts — garde statique de .github/workflows/fumee-prod.yml (on ne peut pas
// exécuter GitHub Actions ici) + logique anti-boucle de scripts/fumee-decision.mjs.
// Pas de dépendance YAML : le fichier est lu comme texte, chaque règle est une vérification ciblée.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decider } from "../scripts/fumee-decision.mjs";

const yml = readFileSync(".github/workflows/fumee-prod.yml", "utf8");
const lignes = yml.split(/\r?\n/);

/** Contenu des blocs `run: |` (le texte exécuté par le shell), sans les commentaires YAML. */
function blocsRun(): string[] {
  const blocs: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = /^(\s*)run:\s*(.*)$/.exec(lignes[i] ?? "");
    if (!m) continue;
    const [, indent = "", valeur = ""] = m;
    if (valeur && valeur !== "|") {
      blocs.push(valeur);
      continue;
    }
    const retrait = indent.length;
    const corps: string[] = [];
    for (let j = i + 1; j < lignes.length; j++) {
      const l = lignes[j] ?? "";
      if (l.trim() !== "" && (/^\s*/.exec(l)?.[0].length ?? 0) <= retrait) break;
      corps.push(l);
    }
    blocs.push(corps.join("\n"));
  }
  return blocs;
}

describe("fumee-prod.yml : forme", () => {
  it("se déclenche sur deployment_status seulement", () => {
    expect(yml).toMatch(/^on:\s*\n\s+deployment_status:\s*$/m);
    expect(yml).not.toMatch(/pull_request|pull_request_target|workflow_run|push:/);
  });

  it("ne réagit qu'à un succès en Production", () => {
    expect(yml).toContain("github.event.deployment_status.state == 'success'");
    expect(yml).toContain("github.event.deployment_status.environment == 'Production'");
  });

  it("permissions minimales : aucun droit global, job en contents:read + issues:write", () => {
    expect(yml).toMatch(/^permissions:\s*\{\}\s*$/m);
    const droits = [...yml.matchAll(/^\s+([a-z-]+):\s+(read|write)\b/gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(droits.sort()).toEqual(["contents:read", "issues:write"]);
    expect(yml).not.toMatch(/(contents|pull-requests|actions|id-token): write/);
  });

  it("jamais deux fumées en même temps", () => {
    expect(yml).toMatch(/^concurrency:\s*\n\s+group: fumee-prod\s*\n\s+cancel-in-progress: false/m);
  });

  it("toutes les actions sont épinglées par un SHA de 40 caractères", () => {
    const usages = [...yml.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1]);
    expect(usages.length).toBeGreaterThan(0);
    for (const u of usages) expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it("n'extrait pas le code d'une PR et ne garde pas le jeton git", () => {
    expect(yml).toContain("persist-credentials: false");
    expect(yml).not.toMatch(/pull_request\.head|head_ref/);
  });
});

describe("fumee-prod.yml : injection et secrets", () => {
  it("aucune expression ${{ }} dans un run: (tout passe par env)", () => {
    for (const bloc of blocsRun()) expect(bloc).not.toContain("${{");
  });

  it("VERCEL_TOKEN n'apparaît que dans l'étape de retour arrière", () => {
    const occurrences = lignes.filter((l) => /VERCEL_TOKEN/.test(l) && !/^\s*#/.test(l));
    // une ligne d'env (secrets.VERCEL_TOKEN) + la ligne du run n'en cite pas : une seule ligne.
    expect(occurrences).toHaveLength(1);
    const debut = lignes.findIndex((l) => l.includes("- name: Retour arrière Vercel"));
    const fin = lignes.findIndex((l, i) => i > debut && /^\s+- name:/.test(l));
    const idx = lignes.findIndex((l) => /VERCEL_TOKEN:/.test(l));
    expect(debut).toBeGreaterThan(0);
    expect(idx).toBeGreaterThan(debut);
    expect(idx).toBeLessThan(fin);
    // ni au niveau du workflow ni du job : le bloc env: global ne le contient pas
    const envJob = yml.slice(yml.indexOf("    env:"), yml.indexOf("    steps:"));
    expect(envJob).not.toContain("VERCEL_TOKEN");
  });

  it("le retour arrière est exécuté pour de vrai (pas --essai), seulement sur décision", () => {
    expect(yml).toContain("node scripts/retour-arriere-vercel.mjs --executer");
    expect(yml).not.toContain("--essai");
    expect(yml).toContain("steps.decision.outputs.action == 'retour-arriere-et-alerte'");
  });

  it("l'issue d'alerte est étiquetée prod-rouge et son texte est fixe", () => {
    expect(yml).toContain("--label prod-rouge");
    const bloc = blocsRun().find((b) => b.includes("gh issue create"))!;
    expect(bloc).toMatch(/court=.*DEPLOY_SHA/);
    expect(bloc).not.toMatch(/curl|cat |\.json|response|body_text/i);
  });
});

describe("décision anti-boucle", () => {
  it("fumée verte : rien (un déploiement de rollback sain ne déclenche rien)", () => {
    expect(decider({ fumeeOk: true, issuesOuvertes: 0 }).action).toBe("rien");
    expect(decider({ fumeeOk: true, issuesOuvertes: 3 }).action).toBe("rien");
  });

  it("fumée rouge sans alerte ouverte : un retour arrière + une alerte", () => {
    expect(decider({ fumeeOk: false, issuesOuvertes: 0 }).action).toBe("retour-arriere-et-alerte");
  });

  it("fumée rouge avec alerte déjà ouverte : jamais un second retour arrière (pas de boucle)", () => {
    expect(decider({ fumeeOk: false, issuesOuvertes: 1 }).action).toBe("alerte-existante");
  });
});
