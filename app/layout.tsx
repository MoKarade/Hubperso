import type { Metadata, Viewport } from "next";
// Outfit (police commune de la refonte, référence §2) auto-hébergée via @fontsource : aucune requête externe.
import "@fontsource-variable/outfit";
import { ServiceWorker } from "@/components/ServiceWorker";
import { PaletteMontee } from "@/components/PaletteMontee";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hub perso",
  description: "Vue d’ensemble générique de mes apps (hubperso.com).",
  // Le manifeste (`app/manifest.ts`) rend le hub installable ; Next le sert sur
  // /manifest.webmanifest et pose le <link rel="manifest"> à partir d'ici.
  manifest: "/manifest.webmanifest",
  // iOS ignore le manifeste pour l'icône d'accueil : il lui faut celle-ci, opaque
  // (Safari ne gère pas la transparence et la remplacerait par du noir).
  appleWebApp: {
    capable: true,
    title: "Hub",
    // « default » garde la barre d'état lisible dans les deux thèmes ; « black-translucent »
    // ferait passer le contenu SOUS l'encoche.
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Thème sombre seul (Marc, 26/09) : une seule teinte de barre système, = `--bg` de
  // globals.css (testé dans tests/themeSombre.test.ts).
  themeColor: "#07090D",
  // Installée, l'app doit occuper l'écran jusque sous l'encoche.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>
        {children}
        {/* Gardée côté serveur : elle liste les apps, donc elle exige l'accès au hub — pas
            seulement une session. Voir components/PaletteMontee.tsx. */}
        <PaletteMontee />
        <ServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
