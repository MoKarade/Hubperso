import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/authConfigured";
import { getSources } from "@/lib/sources";
import { fetchAllSummaries } from "@/lib/fetchSummary";
import { formatDateTime } from "@/lib/format";
import { AppWidget } from "@/components/AppWidget";
import { SignOutButton } from "@/components/SignOutButton";

// Un summary est un instantané : toujours frais, jamais mis en cache statiquement.
export const dynamic = "force-dynamic";

export default async function Page() {
  // Fail-closed : sans config d'auth complète, Auth.js peut « échouer ouvert »
  // (MissingSecret loggé mais requête servie, constaté sur Vercel). On refuse de
  // rendre la moindre donnée tant que l'auth n'est pas configurée.
  if (!isAuthConfigured()) {
    return (
      <main className="login">
        <section className="login__card">
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="login__title">Hub indisponible</h1>
          <p className="login__error" role="alert">
            Authentification non configurée (AUTH_SECRET / AUTHORIZED_EMAIL manquants
            dans l&apos;environnement). Aucune donnée n&apos;est servie tant que ce
            n&apos;est pas corrigé.
          </p>
        </section>
      </main>
    );
  }

  // Défense en profondeur : cette page porte les jetons x-hub-token des apps (le fetch
  // part d'ici). Même si la middleware garde déjà tout, on revérifie la session côté
  // serveur avant tout fetch — sans session, aucune donnée n'est récupérée ni rendue.
  const session = await auth();
  if (!session) redirect("/login");

  const results = await fetchAllSummaries(getSources());
  const online = results.filter((r) => r.state === "ok").length;
  const refreshedAt = formatDateTime(new Date().toISOString());

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Hub</h1>
        </div>
        <div className="page__aside">
          <p className="page__meta">
            {online}/{results.length} en ligne · rafraîchi {refreshedAt}
          </p>
          <SignOutButton />
        </div>
      </header>

      <section className="bento" aria-label="Widgets des apps">
        {results.map((result) => (
          <AppWidget key={result.source.id} result={result} />
        ))}
      </section>
    </main>
  );
}
