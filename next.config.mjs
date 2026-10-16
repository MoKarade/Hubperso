/** @type {import('next').NextConfig} */

/**
 * Hôte d'ingestion de Sentry, lu dans le DSN (`https://<clé>@<hôte>/<projet>`), ou `undefined`.
 *
 * Seul appel réseau du navigateur : l'envoi des erreurs à Sentry (tâche #162). L'hôte exact est
 * ajouté à `connect-src` et SEULEMENT quand `SENTRY_DSN` est défini au build : sans DSN la CSP
 * reste celle d'avant (`'self'` seul). Pas de joker `*.sentry.io` : il laisserait envoyer vers
 * n'importe quel projet Sentry. Un DSN illisible ou non https donne `undefined` (CSP inchangée) ;
 * le SDK, lui, signale le DSN invalide dans la console.
 */
function hoteSentry(dsn) {
  if (!dsn?.trim()) return undefined;
  try {
    const url = new URL(dsn.trim());
    return url.protocol === "https:" ? url.host : undefined;
  } catch {
    return undefined;
  }
}

const hoteIngestion = hoteSentry(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

/**
 * CSP du hub — ENFORCÉE (pas Report-Only), parce qu'elle est sûre ici : le hub ne charge
 * AUCUNE ressource externe côté navigateur. Vérifié le 2026-07-31 : aucun `<img>` distant,
 * aucun `<script>` tiers, aucune police web (`app/globals.css` n'a ni `@import` ni `url()`).
 * Tout le réseau sortant du hub est SERVER-SIDE (fetch des summaries, porteur des jetons) —
 * et le server-side n'est pas soumis à la CSP, donc la resserrer ne casse pas les widgets.
 *
 * `'unsafe-inline'` sur script-src et style-src : Next.js App Router injecte le script
 * d'hydratation et les styles en ligne, et les composants utilisent `style={{ background:
 * app.color }}` (la couleur vient du contrat). Un nonce serait plus strict mais demanderait
 * un middleware qui réécrit chaque réponse — disproportionné ici. Même avec 'unsafe-inline',
 * la CSP bloque l'essentiel : chargement d'un script DISTANT, exfiltration vers un domaine
 * tiers (`connect-src 'self'`), et mise en cadre (`frame-ancestors 'none'`).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Le hub fetch les apps côté serveur : le navigateur n'appelle que lui-même, et Sentry quand un
  // DSN est défini (hôte exact, voir `hoteSentry`).
  hoteIngestion ? `connect-src 'self' https://${hoteIngestion}` : "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  // Sans cela Next empaquette le SDK Sentry côté serveur et son chargeur de crochets échoue avec
  // « Cannot find package '@sentry/server-runtime-injection' » (constaté dans app-template).
  serverExternalPackages: ["@sentry/server-runtime-injection"],
  // Un seul réglage pour Sentry : `SENTRY_DSN` (serveur) est aussi donné au navigateur, car un DSN
  // n'est pas un secret. Vide = Sentry éteint (voir lib/sentryConfig.ts).
  env: {
    // `||` et non `??` : une variable définie mais VIDE ne doit pas masquer `SENTRY_DSN`.
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "",
  },
  // En-têtes de sécurité pour toute exposition Internet.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // HSTS : le hub est 100 % HTTPS (Vercel). 1 an, sous-domaines inclus — les apps
          // vivent sur *.hubperso.com, elles en bénéficient donc aussi.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
