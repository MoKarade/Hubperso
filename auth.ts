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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
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
  },
});
