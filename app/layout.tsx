import type { Metadata } from "next";
// Geist est embarquée dans le paquet npm (aucune requête externe au build ni au runtime).
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hub perso",
  description: "Vue d’ensemble générique de mes apps (hubperso.com).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
