// tests/variablesAttendues.test.ts — la liste des variables d'environnement attendues (F7).
//
// Trois choses à prouver :
//   1. la liste suit le CODE (chaque `process.env.X` lu par l'app y figure, et les deux
//      variables de chaque app viennent de `SOURCE_DEFS`, jamais d'une copie à la main) ;
//   2. le contrôle de présence ne rend que des BOOLÉENS et des NOMS — jamais une valeur ;
//   3. `isAuthConfigured` et ce module disent la même chose (une seule définition de
//      « présente » : non vide après `trim`).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VARIABLES_ATTENDUES,
  estPresente,
  presenceVariables,
  requisesManquantes,
} from "../lib/variablesAttendues";
import { SOURCE_DEFS } from "../lib/sources";
import { isAuthConfigured } from "../lib/authConfigured";

const noms = VARIABLES_ATTENDUES.map((v) => v.nom);
const requises = VARIABLES_ATTENDUES.filter((v) => v.exigence === "requise").map((v) => v.nom);

/** Un environnement où TOUTES les variables sont posées, avec une valeur reconnaissable. */
function envComplet(valeur: string): Record<string, string> {
  return Object.fromEntries(noms.map((n) => [n, valeur]));
}

describe("VARIABLES_ATTENDUES", () => {
  it("les requises sont exactement l'auth, Google et la base", () => {
    expect([...requises].sort()).toEqual(
      ["AUTHORIZED_EMAIL", "AUTH_SECRET", "DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].sort(),
    );
  });

  it("contient les optionnelles fixes", () => {
    for (const nom of ["CRON_SECRET", "AUTH_COOKIE_DOMAIN"]) {
      expect(noms).toContain(nom);
      expect(VARIABLES_ATTENDUES.find((v) => v.nom === nom)?.exigence).toBe("optionnelle");
    }
  });

  it("dérive le jeton et l'URL de CHAQUE app de SOURCE_DEFS, en optionnelles", () => {
    expect(SOURCE_DEFS.length).toBeGreaterThanOrEqual(6);
    for (const def of SOURCE_DEFS) {
      for (const nom of [def.tokenEnv, def.urlEnv]) {
        const v = VARIABLES_ATTENDUES.find((x) => x.nom === nom);
        expect(v, `${nom} absente de la liste`).toBeDefined();
        expect(v!.exigence).toBe("optionnelle");
      }
    }
  });

  it("aucun doublon, et chaque entrée dit ce que son absence provoque", () => {
    expect(new Set(noms).size).toBe(noms.length);
    for (const v of VARIABLES_ATTENDUES) {
      expect(v.nom).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(v.siAbsente.trim().length, `${v.nom} : conséquence vide`).toBeGreaterThan(0);
    }
  });

  it("inclut HUB_SESSION_PRIVATE_JWK en optionnelle (le hub n'émet le cookie signé que si elle est posée)", () => {
    const v = VARIABLES_ATTENDUES.find((x) => x.nom === "HUB_SESSION_PRIVATE_JWK");
    expect(v?.exigence).toBe("optionnelle");
  });

  // Le garde-fou qui empêche la liste de se périmer : toute variable LUE par le code de
  // l'app (app/, lib/, auth.ts, middleware.ts) doit y figurer. Les scripts de CI
  // (modeles/, scripts/) lisent des variables de GitHub Actions, pas de l'app : exclus.
  it("couvre chaque process.env.X lu par le code de l'app", () => {
    const racine = process.cwd();
    const fichiers: string[] = [
      resolve(racine, "auth.ts"),
      resolve(racine, "middleware.ts"),
    ];
    const parcourir = (dossier: string) => {
      for (const entree of readdirSync(dossier)) {
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|tsx)$/.test(entree)) fichiers.push(chemin);
      }
    };
    parcourir(resolve(racine, "app"));
    parcourir(resolve(racine, "lib"));

    const lues = new Set<string>();
    for (const f of fichiers) {
      const source = readFileSync(f, "utf8");
      for (const m of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) lues.add(m[1]!);
      for (const m of source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) lues.add(m[1]!);
    }
    // Sans ce plancher, un chemin devenu faux ferait passer le test sur zéro fichier.
    expect(lues.size).toBeGreaterThanOrEqual(5);
    const manquantes = [...lues].filter((n) => !noms.includes(n));
    expect(manquantes).toEqual([]);
  });
});

describe("estPresente", () => {
  it("refuse l'absence, le vide et le blanc ; accepte une valeur non blanche", () => {
    expect(estPresente({}, "X")).toBe(false);
    expect(estPresente({ X: "" }, "X")).toBe(false);
    expect(estPresente({ X: "   " }, "X")).toBe(false);
    expect(estPresente({ X: "a" }, "X")).toBe(true);
  });
});

describe("presenceVariables", () => {
  it("rend un booléen par nom attendu, et rien d'autre", () => {
    const presence = presenceVariables({ AUTH_SECRET: "x", VARIABLE_INCONNUE: "y" });
    expect(Object.keys(presence).sort()).toEqual([...noms].sort());
    expect(presence.AUTH_SECRET).toBe(true);
    expect(presence.DATABASE_URL).toBe(false);
    for (const valeur of Object.values(presence)) expect(typeof valeur).toBe("boolean");
  });

  it("ne laisse fuiter AUCUNE valeur, même sérialisé", () => {
    const temoin = "VALEUR-TEMOIN-NE-DOIT-PAS-SORTIR";
    const serialise = JSON.stringify(presenceVariables(envComplet(temoin)));
    expect(serialise).not.toContain(temoin);
    expect(Object.values(presenceVariables(envComplet(temoin))).every((v) => v === true)).toBe(true);
  });
});

describe("requisesManquantes", () => {
  it("liste les NOMS des requises absentes, jamais d'optionnelle", () => {
    expect(requisesManquantes({}).sort()).toEqual([...requises].sort());
    const env = envComplet("x");
    delete env.GOOGLE_CLIENT_SECRET;
    delete env.CRON_SECRET;
    expect(requisesManquantes(env)).toEqual(["GOOGLE_CLIENT_SECRET"]);
  });

  it("vide quand toutes les requises sont là, même sans aucune optionnelle", () => {
    const env = Object.fromEntries(requises.map((n) => [n, "x"]));
    expect(requisesManquantes(env)).toEqual([]);
  });

  it("ne rend jamais une valeur", () => {
    const temoin = "VALEUR-TEMOIN-NE-DOIT-PAS-SORTIR";
    const env = envComplet(temoin);
    delete env.AUTH_SECRET;
    expect(JSON.stringify(requisesManquantes(env))).not.toContain(temoin);
  });
});

describe("isAuthConfigured suit la même définition de « présente »", () => {
  it("concorde avec estPresente sur AUTH_SECRET et AUTHORIZED_EMAIL", () => {
    for (const env of [
      {},
      { AUTH_SECRET: "s", AUTHORIZED_EMAIL: "  " },
      { AUTH_SECRET: " ", AUTHORIZED_EMAIL: "m" },
      { AUTH_SECRET: "s", AUTHORIZED_EMAIL: "m" },
    ] as Record<string, string>[]) {
      expect(isAuthConfigured(env)).toBe(
        estPresente(env, "AUTH_SECRET") && estPresente(env, "AUTHORIZED_EMAIL"),
      );
    }
  });
});
