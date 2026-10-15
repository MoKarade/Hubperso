// app/not-found.tsx — page affichée quand une adresse n'existe pas (par exemple /app/xyz
// pour une app absente de lib/sources.ts, via notFound() dans app/app/[id]/page.tsx).
//
// Sans ce fichier Next affiche son écran anglais par défaut.
// Aucune donnée d'app ici : un message et un retour vers le tableau de bord.

import Link from "next/link";

export const metadata = {
  title: "Page introuvable — Hub perso",
};

export default function NotFound() {
  return (
    <main className="login">
      <section className="login__card" aria-labelledby="introuvable-title">
        <p className="page__eyebrow">hubperso.com</p>
        <h1 id="introuvable-title" className="login__title">
          Page introuvable
        </h1>
        <p className="login__lede">
          Cette adresse ne mène à rien : l’app demandée n’existe pas dans le hub, ou le
          lien est incomplet.
        </p>
        <Link className="btn" href="/">
          Retour au hub
        </Link>
      </section>
    </main>
  );
}
