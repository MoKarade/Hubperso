// tests/cspSentry.test.ts — la CSP du hub reste fermée tant que Sentry n'est pas branché (#162).
//
// Le navigateur ne doit appeler que le hub lui-même (`connect-src 'self'`). Avec un `SENTRY_DSN`
// défini au build, l'hôte EXACT d'ingestion de ce DSN s'ajoute, jamais un joker `*.sentry.io`
// (il laisserait envoyer vers n'importe quel projet Sentry).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Valeur de `connect-src` servie par `next.config.mjs` pour un environnement donné. */
async function connectSrc(env: Record<string, string | undefined>): Promise<string> {
  vi.resetModules();
  for (const nom of ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]) vi.stubEnv(nom, env[nom] ?? "");
  const { default: config } = (await import("../next.config.mjs")) as {
    default: { headers: () => Promise<{ headers: { key: string; value: string }[] }[]> };
  };
  const regles = await config.headers();
  const csp = regles[0]?.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
  const directive = csp.split("; ").find((d) => d.startsWith("connect-src "));
  if (!directive) throw new Error("connect-src absent de la CSP");
  return directive;
}

describe("CSP et Sentry", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("sans DSN, le navigateur n'appelle que le hub", async () => {
    expect(await connectSrc({})).toBe("connect-src 'self'");
  });

  it("avec un DSN, ajoute l'hôte exact d'ingestion et rien d'autre", async () => {
    const dsn = "https://cle@o123456.ingest.us.sentry.io/789";
    const directive = await connectSrc({ SENTRY_DSN: dsn });
    expect(directive).toBe("connect-src 'self' https://o123456.ingest.us.sentry.io");
    expect(directive).not.toContain("*");
    expect(directive).not.toContain("cle@");
  });

  it("lit aussi NEXT_PUBLIC_SENTRY_DSN (même valeur côté navigateur)", async () => {
    const directive = await connectSrc({ NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.us.sentry.io/2" });
    expect(directive).toBe("connect-src 'self' https://o1.ingest.us.sentry.io");
  });

  it("un DSN illisible ou non https laisse la CSP fermée", async () => {
    for (const dsn of ["pas une url", "http://cle@exemple.invalid/1", "   "]) {
      expect(await connectSrc({ SENTRY_DSN: dsn }), `dsn = ${JSON.stringify(dsn)}`).toBe(
        "connect-src 'self'",
      );
    }
  });
});
