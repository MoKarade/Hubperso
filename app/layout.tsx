import type { Metadata, Viewport } from "next";
// Geist est embarquée dans le paquet npm (aucune requête externe au build ni au runtime).
import { GeistSans } from "geist/font/sans";
import { ServiceWorker } from "@/components/ServiceWorker";
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
  // Contrairement au manifeste (une seule couleur possible), la balise meta accepte des
  // media queries : la teinte de la barre système SUIT donc le thème, conformément au
  // principe « ne pas imposer le dark mode ». Les deux valeurs sont les `--bg` de
  // globals.css converties depuis l'OKLCH.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f16" },
  ],
  // Installée, l'app doit occuper l'écran jusque sous l'encoche.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA" className={GeistSans.variable}>
      <body>
        {children}
        <ServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
