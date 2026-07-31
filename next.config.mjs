/** @type {import('next').NextConfig} */

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
  // Aucun appel réseau depuis le navigateur : le hub fetch les apps côté serveur.
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
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
