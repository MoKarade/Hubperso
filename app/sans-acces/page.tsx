// app/sans-acces/page.tsx
//
// Où atterrit quelqu'un CONNECTÉ mais sans accès au tableau de bord du hub. C'est le cas
// normal d'une personne invitée sur une seule app : sa session est valide — elle en a
// besoin pour entrer dans son app — mais le hub affiche les données des cinq, alors elle
// n'y entre pas.
//
// POURQUOI UNE PAGE ET PAS UNE REDIRECTION VERS /login
// Renvoyer vers /login enverrait vers une connexion qui RÉUSSIRAIT aussitôt (la session est
// valide) pour aboutir au même refus : une boucle qui ressemble à une panne réseau. Un
// message honnête vaut mieux qu'un aller-retour infini — c'est le même raisonnement que
// l'anti-boucle des apps qui renvoient vers le hub (cf. lib/connexionHub.ts côté apps).
//
// Cette page n'affiche AUCUNE donnée d'app : ni la liste des apps existantes, ni leurs
// états. Elle dit ce qu'il faut pour comprendre, et rien de plus.

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { effacerSessionSignee } from "@/lib/effacerSessionSignee";

export const metadata = {
  title: "Accès refusé — Hub perso",
};

export const dynamic = "force-dynamic";

export default async function SansAccesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const email = session.user?.email ?? null;

  return (
    <main className="login">
      <section className="login__card" aria-labelledby="sans-acces-title">
        <p className="page__eyebrow">hubperso.com</p>
        <h1 id="sans-acces-title" className="login__title">
          Pas d’accès à ce tableau de bord
        </h1>
        <p className="login__lede">
          {email ? (
            <>
              Tu es bien connecté avec <strong>{email}</strong>, mais ce compte n’a pas
              accès au tableau de bord du hub.
            </>
          ) : (
            <>Ce compte n’a pas accès au tableau de bord du hub.</>
          )}
        </p>
        <p className="login__lede">
          Ta connexion reste valable pour les apps auxquelles tu as accès : rouvre
          simplement le lien qu’on t’a transmis. Si tu penses qu’il manque un accès,
          demande-le à Marc.
        </p>

        <form
          action={async () => {
            "use server";
            await effacerSessionSignee();
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="login__button">
            Se déconnecter
          </button>
        </form>
        <p className="login__lede">
          {/* Conséquence du cookie partagé : la déconnexion vaut pour TOUTES les apps du
              hub. Le dire ici évite la surprise d'être éjecté d'une app qu'on utilisait. */}
          La déconnexion vaut pour toutes les apps du hub.
        </p>
      </section>
    </main>
  );
}
