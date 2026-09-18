import type { MetadataRoute } from "next";

/**
 * Manifeste d'application web — c'est lui qui rend le hub INSTALLABLE (téléphone et PC).
 *
 * Servi par Next sur `/manifest.webmanifest`. Aucune requête externe : les icônes sont
 * dans `public/`, générées depuis `app/icon.svg` (le motif bento du hub).
 *
 * ⚠️ CSP : le hub applique une CSP ENFORCÉE (`next.config.mjs`). `manifest-src` n'y est pas
 * déclaré, il retombe donc sur `default-src 'self'` — le manifeste et les icônes sont
 * same-origin, tout passe. Ne pas déplacer les icônes vers un CDN sans ouvrir la CSP.
 *
 * `display: standalone` : lancé depuis l'écran d'accueil, le hub s'ouvre sans barre
 * d'URL, comme une app native. `start_url: "/"` renvoie vers `/login` si la session a
 * expiré — c'est voulu, le hub reste privé (la middleware garde tout).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // [PWA-ANDROID] `id` FIXE l'identité de l'installation. Sans lui, l'identité EST le
    // `start_url` : le jour où il change (« ouvrir sur /attention plutôt que sur / »),
    // Android ne met pas à jour l'app installée — il en installe une DEUXIÈME, et la
    // première reste sur l'écran d'accueil sans jamais se mettre à jour. La valeur est
    // celle du `start_url` ACTUEL, donc le changement est un no-op aujourd'hui : c'est
    // exactement le but, épingler ce qui était implicite.
    id: "/",
    // [PWA-ANDROID] Un lien venu d'ailleurs (le hub, une notification) RÉUTILISE la fenêtre
    // déjà ouverte au lieu d'en empiler une seconde. `navigate-existing` navigue dans la
    // fenêtre existante ; `focus-existing` la ramènerait au premier plan SANS naviguer, donc
    // en ignorant l'URL demandée — ce n'est pas ce qu'on veut pour un lien profond.
    launch_handler: { client_mode: "navigate-existing" },
    name: "Hub perso",
    short_name: "Hub",
    description: "Vue d’ensemble générique de mes apps (hubperso.com).",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // `background_color` (écran de démarrage) et `theme_color` du manifeste sont des
    // valeurs UNIQUES : le format ne connaît pas `prefers-color-scheme`. Or le hub
    // n'impose aucun mode (cf. CLAUDE.md) et son thème PAR DÉFAUT est le clair — on
    // aligne donc sur `--bg` clair, converti depuis l'OKLCH de `globals.css`.
    // La teinte de la barre système, elle, SUIT le thème : elle est déclarée en
    // `<meta name="theme-color" media="...">` dans `app/layout.tsx`, qui a le dernier
    // mot sur cette valeur-ci.
    background_color: "#f7f5ef",
    theme_color: "#f7f5ef",
    lang: "fr-CA",
    dir: "ltr",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Variante MASKABLE : Android rogne l'icône selon la forme du lanceur (cercle,
      // goutte…). Sans elle, les coins du motif bento sont mangés. Celle-ci garde le
      // motif dans la zone sûre centrale, sur fond plein.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
