import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hub perso",
  description: "Vue d’ensemble générique de mes apps (hubperso.com).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>{children}</body>
    </html>
  );
}
