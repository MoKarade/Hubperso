// auth.ts
//
// Configuration Auth.js (NextAuth v5). Le hub affiche des données financières réelles :
// il est PRIVÉ. Obtiennent une session le PROPRIÉTAIRE (`AUTHORIZED_EMAIL`, qui n'a besoin
// d'aucune base) et les personnes actives ayant au moins un accès en base ; tout autre
// compte est refusé au callback signIn — aucune session créée.
//
// Attention à ne pas lire ça comme « qui a accès au hub » : la connexion est UNIQUE pour
// toutes les apps du hub, alors que les accès sont PAR APP. Voir `lib/gardeHub.ts` et
// `docs/ACCES-PAR-APP.md`.
//
// La session reste stockée en JWT (la base ne contient que les personnes et leurs accès).
// Le secret et les identifiants OAuth viennent tous de l'environnement, jamais du code
// (voir README / .env.example).

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { peutSeConnecter } from "@/lib/personnes";
import { cookiesSessionPartagee } from "@/lib/sessionPartagee";
import { PARAMS_AUTORISATION, majJetonsGoogle } from "@/lib/jetonsGoogle";
import { destinationApresConnexion } from "@/lib/retour";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      // ⚠️ Les variables Vercel sont figées PAR DÉPLOIEMENT : changer GOOGLE_CLIENT_ID / _SECRET
      // dans Vercel ne suffit pas. Tant qu'un nouveau déploiement n'a pas été construit, le callback
      // rend `invalid_client` (constaté le 23/10/2026). Il faut un commit de code (Hubperso#389).
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // ── PORTÉES IDENTIQUES DANS LES QUATRE APPS ────────────────────────────────
      // Le hub ne lit que Drive (les bilans, Hubperso#543) ; il demande quand même la portée Tasks
      // parce que le cookie de session est PARTAGÉ : c'est la dernière app où l'on
      // s'est connecté qui décide du contenu du jeton. Si seul BatchChef demandait
      // Tasks, se connecter par le hub la laisserait connectée mais sans droit
      // d'écriture. Voir `lib/jetonsGoogle.ts`.
      authorization: { params: PARAMS_AUTORISATION },
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
  //
  // ⚠️ SUR VERCEL SEULEMENT : c'est la plateforme qui fixe l'en-tête Host (audit sécurité du
  // 26/09/2026, F4). Héberger le hub AILLEURS, derrière un proxy qui laisse passer un Host forgé,
  // en ferait un risque d'hôte forgé : il faudrait alors une liste d'hôtes attendus. Voir
  // docs/SECURITE.md.
  trustHost: true,
  pages: {
    signIn: "/login",
    // Une erreur (dont le refus d'un compte non autorisé) est rendue par /login, qui
    // lit ?error= pour afficher un message honnête plutôt qu'une page d'erreur brute.
    error: "/login",
  },
  callbacks: {
    // Qui obtient une session : le PROPRIÉTAIRE, ou une personne active ayant au moins un
    // accès en base. Sinon on retourne false : Auth.js refuse la connexion et redirige vers
    // /login?error=AccessDenied.
    //
    // « Au moins un accès » et pas « inscrite » : une session qui n'ouvre aucune app
    // n'aurait aucune utilité et vaut mieux ne pas exister. Obtenir une session ne dit
    // d'ailleurs rien de ce qu'on peut VOIR — le tableau de bord du hub, qui affiche les
    // données des cinq apps, exige `aAcces(…, APP_HUB)` (lib/gardeHub.ts).
    async signIn({ user }) {
      return await peutSeConnecter(user?.email);
    },
    // ── RETOUR VERS L'APP D'ORIGINE APRÈS CONNEXION ──────────────────────────────
    //
    // Le hub devient la porte d'entrée unique (ADR 0001) : quelqu'un qui ouvre JobAI
    // sans session arrive ici, et doit repartir sur JobAI une fois connecté.
    //
    // Auth.js refuse par défaut toute destination hors de sa propre origine, et il a
    // raison — c'est ce qui empêche `?callbackUrl=https://evil.com` de transformer le
    // hub en tremplin d'hameçonnage : la victime atterrit sur un site tiers APRÈS une
    // connexion réussie, donc en confiance.
    //
    // On ne supprime donc pas cette garde, on la remplace par une liste blanche de
    // DOMAINES (`lib/retour.ts`, 13 tests dont les pièges classiques : userinfo
    // `@evil.com`, suffixe `evil-hubperso.com`, préfixe `hubperso.com.evil.com`,
    // URL protocol-relative `//evil.com`). Une destination refusée ramène au hub sans
    // erreur — échec fermé.
    redirect({ url, baseUrl }) {
      return destinationApresConnexion(url, baseUrl);
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
    //
    // C'est aussi ici que se joue la RÉVOCATION : retirer le dernier accès de quelqu'un
    // en base invalide sa session à la lecture suivante, sans qu'il ait à se déconnecter.
    // `peutSeConnecter` mémorise une minute les réponses positives (jamais les négatives)
    // pour ne pas faire une requête à la base à chaque affichage — le délai annoncé pour
    // une révocation est donc « moins d'une minute », pas « immédiat ».
    async jwt({ token, user, account }) {
      // À la connexion seulement : on fixe l'adresse dans le jeton. Aux lectures
      // suivantes, `user` est absent et c'est `token.email` qui fait foi.
      if (user?.email) token.email = user.email;
      if (!(await peutSeConnecter(token.email))) return null;
      // Capture des jetons Google à la connexion, renouvellement ensuite. Le hub ne
      // s'en sert pas ; il les transporte pour les apps qui, elles, en ont besoin.
      // Le contrôle d'adresse passe AVANT : on ne rafraîchit pas un jeton pour une
      // session qu'on s'apprête à refuser.
      return await majJetonsGoogle(token, account);
    },
  },
});
