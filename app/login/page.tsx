// app/login/page.tsx
//
// Porte d'entrée du hub. Un seul moyen de connexion : Google. Le filtre d'accès (une
// seule adresse) vit dans le callback signIn (auth.ts) — ici on ne fait qu'offrir le
// bouton et afficher un message honnête quand un compte est refusé (?error=AccessDenied).
// Déjà connecté → on repart vers l'app d'origine si elle est légitime, sinon vers le hub.

import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { destinationApresConnexion } from "@/lib/retour";

export const metadata = {
  title: "Connexion — Hub perso",
};

function errorMessage(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "AccessDenied") {
    return "Accès non autorisé — ce hub est privé.";
  }
  return "Échec de la connexion. Réessaie.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  const { error, callbackUrl } = await searchParams;

  // Déjà connecté ⇒ on repart aussitôt, et vers l'app D'OÙ L'ON VIENT si elle est
  // légitime. Sans ça, quelqu'un que JobAI envoie ici alors qu'il a déjà une session
  // valide atterrirait sur le hub sans comprendre pourquoi — le partage de session
  // rendrait la connexion invisible ET le retour impossible. `destinationApresConnexion`
  // ramène au hub si la destination n'est pas une app du hub (cf. lib/retour.ts).
  if (session) redirect(destinationApresConnexion(callbackUrl, "/"));

  const message = errorMessage(error);

  return (
    <main className="login">
      <section className="login__card" aria-labelledby="login-title">
        <p className="page__eyebrow">hubperso.com</p>
        <h1 id="login-title" className="login__title">
          Hub privé
        </h1>
        <p className="login__lede">
          Ce tableau de bord affiche des données personnelles. Connecte-toi pour y
          accéder.
        </p>

        {message && (
          <p className="login__error" role="alert">
            {message}
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl || "/" });
          }}
        >
          <button type="submit" className="login__button">
            Se connecter avec Google
          </button>
        </form>
      </section>
    </main>
  );
}
