// tests/sentryConfig.test.ts — verrou de la configuration Sentry (tâche #162, repris d'app-template#40).
//
// Deux promesses : sans DSN rien ne part (un fork non configuré construit et démarre sans
// bruit), et même avec un DSN aucune donnée personnelle ne part.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { optionsSentry, retirerDonneesPersonnelles } from "@/lib/sentryConfig";

describe("optionsSentry", () => {
  it("est éteint sans DSN (absent, vide ou en blancs)", () => {
    for (const dsn of [undefined, "", "   "]) {
      const options = optionsSentry(dsn);
      expect(options.enabled, `dsn = ${JSON.stringify(dsn)}`).toBe(false);
      expect(options.dsn).toBeUndefined();
    }
  });

  it("est allumé avec un DSN, sans traces ni donnée personnelle par défaut", () => {
    const options = optionsSentry("  https://cle@exemple.invalid/1  ");
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe("https://cle@exemple.invalid/1");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
  });
});

describe("retirerDonneesPersonnelles", () => {
  it("retire corps, cookies, en-têtes, chaîne de requête et utilisateur, garde le reste", () => {
    const evenement = retirerDonneesPersonnelles({
      message: "Erreur d'essai",
      request: {
        url: "https://exemple.invalid/page",
        data: { courriel: "fictif@exemple.invalid" },
        cookies: { session: "fictif" },
        headers: { authorization: "fictif", "x-forwarded-for": "203.0.113.7" },
        query_string: "jeton=fictif",
      } as Record<string, unknown>,
      user: { ip_address: "203.0.113.7", email: "fictif@exemple.invalid" },
    });
    expect(evenement.request).toEqual({ url: "https://exemple.invalid/page" });
    expect(evenement).not.toHaveProperty("user");
    expect(evenement.message).toBe("Erreur d'essai");
  });

  it("accepte un événement sans requête ni utilisateur", () => {
    expect(retirerDonneesPersonnelles({ message: "seul" })).toEqual({ message: "seul" });
  });

  it("est bien branché dans les options (beforeSend)", () => {
    const options = optionsSentry("https://cle@exemple.invalid/1");
    expect(options.beforeSend({ user: { email: "x" } })).not.toHaveProperty("user");
  });
});

describe("branchement", () => {
  const lire = (chemin: string): string => readFileSync(join(process.cwd(), chemin), "utf8");

  it("aucun fichier ne réactive l'envoi de données personnelles", () => {
    for (const chemin of [
      "instrumentation.ts",
      "lib/sentryConfig.ts",
    ]) {
      expect(lire(chemin), chemin).not.toMatch(/sendDefaultPii\s*:\s*true/);
    }
  });

  it("aucun fichier de l'app n'appelle Sentry.init hors des deux points d'entrée", () => {
    // Un `Sentry.init` libre contournerait le nettoyage des données personnelles.
    const fautes = ["app/error.tsx", "lib/sentryConfig.ts", "next.config.mjs"].filter(
      (chemin) => /Sentry\.init\(/.test(lire(chemin)),
    );
    expect(fautes).toEqual([]);
  });

  it("le serveur passe par optionsSentry, jamais par un Sentry.init libre", () => {
    expect(lire("instrumentation.ts")).toMatch(/Sentry\.init\(optionsSentry\(/);
  });

  it("aucune copie du DSN vers le navigateur (variable NEXT_PUBLIC_, CSP, fichier client)", () => {
    // Le DSN reste une variable serveur : le navigateur n'envoie rien à Sentry (choix du 18/10/2026).
    expect(existsSync(join(process.cwd(), "instrumentation-client.ts"))).toBe(false);
    for (const chemin of ["next.config.mjs", "app/error.tsx", "instrumentation.ts"]) {
      expect(lire(chemin), chemin).not.toMatch(/NEXT_PUBLIC_SENTRY/);
    }
  });
});
