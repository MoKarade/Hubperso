// app/login/page.tsx
//
// Porte d'entrée du hub. Un seul moyen de connexion : Google. Le filtre d'accès (une
// seule adresse) vit dans le callback signIn (auth.ts) — ici on ne fait qu'offrir le
// bouton et afficher un message honnête quand un compte est refusé (?error=AccessDenied).
// Déjà connecté → on renvoie vers le hub.

import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

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
  if (session) redirect("/");

  const { error, callbackUrl } = await searchParams;
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
