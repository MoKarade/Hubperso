// tests/kitAutoMerge.test.ts — Hubperso adopte le kit auto-merge du modèle Atelier (modeles/auto-merge/).
//
// Ce que ce fichier verrouille, sans jamais toucher au réseau :
//   1. les copies du kit sont EXACTES (l'empreinte de COPIES.md = celle du fichier) ;
//   2. l'auto-merge.json de l'app reste cohérent avec les vrais noms de contrôles de la CI ;
//   3. les chemins sensibles propres à Hubperso (ancienne garde scripts/gardeChemins.mjs) ne sont pas perdus ;
//   4. le workflow garde ses déclencheurs et ses verrous (voir le gabarit du modèle).
// Les tests de la décision elle-même vivent dans l'Atelier (modeles/auto-merge/tests/).

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decision } from "../modeles/auto-merge/autoMerge.mjs";
import { empreinte, lireCopies } from "../modeles/auto-merge/verifier-copies.mjs";

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const config = JSON.parse(lire(".github/auto-merge.json")) as {
  controles_requis: string[];
  controles_non_bloquants: string[];
  chemins_interdits: string[];
  chemins_label_validation: string[];
  securite_login?: string;
};

describe("les copies du kit sont exactes (COPIES.md)", () => {
  const lignes = lireCopies(lire("COPIES.md"));

  it("COPIES.md liste des fichiers (anti-vacuité)", () => {
    // 16 en kit 1.13.0 (labels.mjs ajouté), profil `prive` : sans armement-auto-merge.yml
    // (pas d'auto-fusion native en dépôt privé Free, voir COPIES.md et
    // modeles/auto-merge/LISEZMOI.md).
    expect(lignes.length).toBeGreaterThanOrEqual(16);
    expect(lignes.map((l) => l.chemin)).toContain("modeles/auto-merge/labels.mjs");
    expect(lignes.map((l) => l.chemin)).not.toContain(".github/workflows/armement-auto-merge.yml");
  });

  it("le kit est au moins en 1.18.0 (INC-22 : 1.9.1 laissait la porte de commit sans PowerShell ; 1.15.0 installe son branchement ; 1.17.1 = lanceur qui trouve la porte de la copie isolée ; 1.18.0 = resynchro du 30/09)", () => {
    const [majeure, mineure] = (lignes[0]?.version ?? "0.0").split(".").map(Number);
    expect((majeure ?? 0) * 1000 + (mineure ?? 0)).toBeGreaterThanOrEqual(1018);
  });
});

describe(".claude/settings.json branche la porte de commit (kit 1.15.0, posé par resynchroniser-kit)", () => {
  // Pas dans COPIES.md : c'est une FUSION (le reste du réglage est conservé), contrôlée par verifier-copies côté Atelier.
  // Ici on verrouille l'essentiel sans dépendre de l'Atelier : chaque outil shell passe par la porte, par chemin absolu.
  type Entree = { matcher?: string; hooks?: { type?: string; command?: string; timeout?: number }[] };
  const reglage = JSON.parse(lire(".claude/settings.json").replace(/^﻿/, "")) as { hooks?: { PreToolUse?: Entree[] } };
  const portes = (reglage.hooks?.PreToolUse ?? []).filter((e) =>
    (e.hooks ?? []).some((h) => h.type === "command" && (h.command ?? "").includes("commit-gate.mjs")),
  );

  it("exactement une entrée PreToolUse lance scripts/hooks/commit-gate.mjs", () => {
    expect(portes).toHaveLength(1);
  });

  it("le matcher couvre Bash ET PowerShell (un git commit par PowerShell ne passe pas sans contrôle)", () => {
    expect(portes[0]?.matcher).toBe("Bash|PowerShell");
  });

  it("la commande est le lanceur 1.17+ : dépôt de la session (git rev-parse) d'abord, $CLAUDE_PROJECT_DIR en repli, jamais la variable seule (bug copie isolée)", () => {
    const h = portes[0]?.hooks?.find((x) => (x.command ?? "").includes("commit-gate.mjs"));
    const c = h?.command ?? "";
    expect(c.startsWith("node -e ")).toBe(true);
    expect(c).toContain("rev-parse");
    expect(c).toContain("--show-toplevel");
    expect(c).toContain("CLAUDE_PROJECT_DIR");
    expect(c.indexOf("rev-parse")).toBeLessThan(c.indexOf("CLAUDE_PROJECT_DIR"));
    expect(h?.timeout).toBeGreaterThanOrEqual(600);
  });
});

describe("COPIES.md (suite)", () => {
  const lignes = lireCopies(lire("COPIES.md"));

  it.each(lignes.map((l) => [l.chemin, l.sha256]))("%s a l'empreinte attestée", (chemin, sha) => {
    expect(empreinte(lire(chemin as string))).toBe(sha);
  });

  it("une seule version du modèle dans COPIES.md", () => {
    expect(new Set(lignes.map((l) => l.version)).size).toBe(1);
  });
});

describe(".github/auto-merge.json", () => {
  it("securite_login est le compte d'attestation dédié, au format GitHub App [bot]", () => {
    expect(config.securite_login).toMatch(/^[A-Za-z0-9-]+\[bot\]$/);
  });

  it("securite_user_id est un entier positif (id numérique du compte d'attestation)", () => {
    const cfg = config as unknown as { securite_user_id?: number };
    expect(Number.isInteger(cfg.securite_user_id) && (cfg.securite_user_id as number) > 0).toBe(true);
  });

  it("les contrôles requis sont de vrais noms de jobs des workflows CI (sinon la PR ne partirait jamais)", () => {
    const noms = new Set<string>();
    for (const f of readdirSync(".github/workflows")) {
      for (const m of lire(`.github/workflows/${f}`).matchAll(/^\s+name:\s*(.+?)\s*$/gm)) noms.add(m[1] as string);
    }
    for (const requis of config.controles_requis) expect(noms, requis).toContain(requis);
  });

  it("Vercel Agent Review est non bloquant, et jamais requis", () => {
    expect(config.controles_non_bloquants).toContain("Vercel Agent Review");
    expect(config.controles_requis).not.toContain("Vercel Agent Review");
  });

  it("les chemins sensibles propres à Hubperso sont tous portés (ancienne garde gardeChemins)", () => {
    const portes = [...config.chemins_interdits, ...config.chemins_label_validation];
    for (const c of [
      "auth.ts",
      "middleware.ts",
      "lib/authGuard.ts",
      "lib/gardeHub.ts",
      "lib/sessionPartagee.ts",
      "lib/jetonApp.ts",
      "lib/jetonsGoogle.ts",
      "app/api/**",
      "vercel.json",
      "next.config.mjs",
      "drizzle/**",
      "drizzle.config.ts",
      "scripts/build-necessaire.sh",
      "qualite/**",
      "tests/kitAutoMerge.test.ts",
      "**/settings*.json",
    ]) {
      expect(portes, c).toContain(c);
    }
  });
});

describe("la décision du kit, avec la configuration de Hubperso", () => {
  const SHA = "a".repeat(40);
  const checks = config.controles_requis.map((name) => ({
    name,
    status: "COMPLETED",
    conclusion: "SUCCESS",
    appId: 15368,
  }));
  const pr = (chemin: string) => ({
    state: "OPEN",
    isDraft: false,
    isCrossRepository: false,
    labels: [],
    mergeStateStatus: "CLEAN",
    baseRefName: "main",
    headRefOid: SHA,
    auteur: "MoKarade",
    dernierActeur: "MoKarade",
    creeLe: "2026-09-25T10:00:00Z",
    checks,
    fichiers: [{ path: chemin, status: "modified", patch: "@@\n-a\n+b" }],
  });
  const ctx = { shaAttendu: SHA, env: {}, maintenant: "2026-09-26T12:00:00Z", fusionsHeure: 0 };
  const cfg = { carence_dependabot_jours: 3, ...config };

  it("une PR ordinaire, contrôles verts, part", () => {
    const d = decision(pr("lib/format.ts"), cfg, ctx);
    expect(d.merger).toBe(true);
  });

  it.each(["tests/kitAutoMerge.test.ts", "config/settings.local.json", "auth.ts", "middleware.ts", "vercel.json", "app/api/acces/route.ts", "drizzle/0001.sql", "qualite/seuils.json", ".github/workflows/ci.yml"])(
    "un chemin sensible (%s) ne part pas seul",
    (chemin) => {
      expect(decision(pr(chemin), cfg, ctx).merger).toBe(false);
    },
  );

  it("sans attestation, le refus demande la validation (label)", () => {
    expect(decision(pr("auth.ts"), cfg, ctx).etiqueter).toEqual(["validation-marc"]);
  });
});

describe("le workflow auto-merge.yml", () => {
  const w = lire(".github/workflows/auto-merge.yml");

  it("garde tous ses déclencheurs", () => {
    expect(w).toMatch(/^ {2}workflow_run:$/m);
    expect(w).toMatch(/^ {2}status:$/m);
    expect(w).toMatch(/^ {2}check_run:$/m);
    expect(w).toMatch(/^ {2}pull_request_target:$/m);
    expect(w).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(w).toMatch(/^ {2}schedule:$/m);
    expect(w).toContain("github.event.state == 'success'");
    expect(w).toContain("github.event.check_run.app.slug != 'github-actions'");
  });

  it("écoute la CI ET « Doc à jour » (sinon une PR verte attendrait le cron)", () => {
    expect(w).toContain('workflows: ["CI", "Doc à jour"]');
  });

  it("jamais pull_request_review, jamais gh pr ready", () => {
    expect(w).not.toMatch(/^\s*pull_request_review/m);
    expect(w).not.toMatch(/^\s*[^#\s].*gh pr ready/m);
  });

  it("permissions vides au niveau global, écriture sur le seul job", () => {
    expect(w).toMatch(/^permissions: \{\}$/m);
  });

  it("sort sans checkout quand aucune PR n'est ouverte", () => {
    expect(w).toContain("steps.ouvertes.outputs.nombre != '0'");
  });

  it("lance le kit copié", () => {
    expect(w).toContain("node modeles/auto-merge/fusionner.mjs");
  });

  it("le cron reste quotidien (décision de Marc du 23/09)", () => {
    expect(w).toContain('cron: "23 9 * * *"');
  });
});

describe("les workflows du kit épinglent leurs actions par SHA (les autres : PR #87)", () => {
  // armement-auto-merge.yml retiré (profil `prive`) : plus de fichier à vérifier ici.
  for (const f of ["auto-merge.yml", "ci-reutilisable.yml"]) {
    it(f, () => {
      for (const m of lire(`.github/workflows/${f}`).matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
        const ref = m[1] as string;
        if (ref.startsWith("./")) continue;
        expect(ref, ref).toMatch(/@[0-9a-f]{40}$/);
      }
    });
  }
});
