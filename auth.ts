// auth.ts
//
// Configuration Auth.js (NextAuth v5). Le hub affiche des données financières réelles :
// il est PRIVÉ. Un seul compte Google est admis (AUTHORIZED_EMAIL) ; tout autre compte
// est refusé au callback signIn (aucune session créée). Pas de base de données → session
// stockée en JWT. Le secret et les identifiants OAuth viennent tous de l'environnement,
// jamais du code (voir README / .env.example).

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAuthorizedEmail } from "@/lib/authorized";
import { cookiesSessionPartagee } from "@/lib/sessionPartagee";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  // ── CONNEXION UNIQUE ENTRE LES APPS DU HUB ───────────────────────────────────────
  // Avec `AUTH_COOKIE_DOMAIN=.hubperso.com`, le cookie de session est déclaré sur le
  // domaine parent : le navigateur l'envoie à TOUS les sous-domaines. Combiné à un
  // `AUTH_SECRET` IDENTIQUE dans chaque app (le JWT est chiffré avec — sans le même
  // secret, l'app reçoit le cookie mais n'en tire rien), se connecter à une app vaut
  // pour toutes. Corollaire assumé : une DÉCONNEXION vaut aussi pour toutes.
  //
  // Variable non définie (local, préversions) ⇒ comportement natif, cookie limité à
  // l'hôte. Voir `lib/sessionPartagee.ts` et `docs/CONNEXION-UNIQUE.md`.
  cookies: cookiesSessionPartagee(process.env.AUTH_COOKIE_DOMAIN),
  // Fait confiance au host de la requête pour construire les URLs de callback. Requis
  // en self-hosted / local (sinon Auth.js lève UntrustedHost/Invalid URL) ; sans risque
  // ici car les redirect URIs OAuth sont verrouillés côté Google (un host forgé ne
  // matcherait aucun callback autorisé). Sur Vercel c'est de toute façon le comportement.
  trustHost: true,
  pages: {
    signIn: "/login",
    // Une erreur (dont le refus d'un compte non autorisé) est rendue par /login, qui
    // lit ?error= pour afficher un message honnête plutôt qu'une page d'erreur brute.
    error: "/login",
  },
  callbacks: {
    // Seule l'adresse autorisée obtient une session. Sinon on retourne false : Auth.js
    // refuse la connexion et redirige vers /login?error=AccessDenied.
    signIn({ user }) {
      return isAuthorizedEmail(user?.email, process.env.AUTHORIZED_EMAIL);
    },
    // ⚠️ REVÉRIFICATION À CHAQUE LECTURE — c'est la contrepartie du cookie partagé.
    //
    // `signIn` ne tourne qu'à la CONNEXION. Le cookie étant désormais lisible par tous
    // les sous-domaines, cette app accepterait sans broncher une session fabriquée par
    // une autre app du hub. Aujourd'hui c'est cohérent — les apps partagent la même
    // AUTHORIZED_EMAIL — mais ça ne l'est que par coïncidence de configuration.
    //
    // `jwt` tourne à chaque lecture de session, pas seulement à la connexion : c'est
    // donc ici que le contrôle a du sens. Renvoyer `null` INVALIDE la session (Auth.js
    // v5) — la middleware redirige vers /login, aucune donnée n'est rendue. Le jour où
    // une app aurait une autre adresse autorisée, sa session serait refusée au lieu
    // d'être acceptée en silence.
    jwt({ token, user }) {
      // À la connexion seulement : on fixe l'adresse dans le jeton. Aux lectures
      // suivantes, `user` est absent et c'est `token.email` qui fait foi.
      if (user?.email) token.email = user.email;
      if (!isAuthorizedEmail(token.email, process.env.AUTHORIZED_EMAIL)) return null;
      return token;
    },
  },
});
