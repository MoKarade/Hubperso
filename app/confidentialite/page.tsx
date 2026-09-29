// app/confidentialite/page.tsx — politique de confidentialité, publique, sans session.
//
// Exigée par la vérification Google OAuth (Test → Production) : Google (et son robot de
// revue) doit pouvoir la lire sans se connecter. Voir lib/authGuard.ts (isPublicPath) —
// AUCUNE exclusion ajoutée au matcher de middleware.ts (CLAUDE.local.md).
//
// Tout ce qui suit est vérifié dans le code, pas déduit : les portées Google dans
// lib/jetonsGoogle.ts, la stratégie de session dans auth.ts (`strategy: "jwt"`, aucune
// table `sessions`/`accounts` dans lib/db/schema.ts), Vercel Analytics dans
// app/layout.tsx. tests/pagesPubliques.test.ts verrouille cette page contre la dérive du
// premier de ces faits. Aucune adresse de contact n'est inventée : aucune variable
// SUPPORT_EMAIL/CONTACT_EMAIL n'existe dans ce dépôt (grep fait avant d'écrire).

import { PagePublique } from "@/components/PagePublique";

export const metadata = {
  title: "Confidentialité — Hub perso",
  description: "Quelles données ce site lit auprès de Google, et ce qu'il en fait.",
};

export default function ConfidentialitePage() {
  return (
    <PagePublique titre="Confidentialité" maj="28 septembre 2026">
      <p>
        Ce site (hubperso.com) est un tableau de bord à <strong>usage strictement
        personnel</strong>. Il n&apos;a qu&apos;un seul utilisateur — la personne qui l&apos;a
        créé — et n&apos;accepte aucune inscription publique. S&apos;il t&apos;arrive d&apos;y
        atterrir sans y être invité, la connexion Google refusera ton compte.
      </p>

      <h2>Ce que ce site lit auprès de Google</h2>
      <p>
        La connexion se fait exclusivement par Google. En te connectant, ce site demande deux
        choses :
      </p>
      <ul>
        <li>
          <strong>Ton identité</strong> (nom, adresse courriel, photo de profil) — pour
          vérifier qu&apos;il s&apos;agit bien du seul compte autorisé.
        </li>
        <li>
          <strong>L&apos;accès à Google Tasks</strong> — pour cocher des articles dans une
          liste de courses, une fonction d&apos;une autre application personnelle du même
          écosystème (BatchChef). Cette autorisation est demandée ici aussi parce que la
          connexion est partagée entre plusieurs applications personnelles sur le même
          domaine : se connecter une fois doit valoir pour toutes, sans redemander
          l&apos;autorisation Google à chaque fois. Ce site lui-même ne lit ni n&apos;écrit
          aucune tâche.
        </li>
      </ul>
      <p>
        Rien de plus : ni Google Drive, ni l&apos;agenda, ni les feuilles de calcul, ni la
        messagerie ne sont demandés par ce site.
      </p>

      <h2>Ce que ce site conserve</h2>
      <p>
        La session est un cookie chiffré (aucune base de données ne stocke les identifiants
        de session ni les jetons Google — ils ne vivent que dans ce cookie, le temps de la
        connexion).
      </p>
      <p>
        Une base de données conserve, en tout et pour tout : la liste des adresses courriel
        autorisées à entrer et à quelles applications chacune a accès, ainsi qu&apos;un
        historique des indicateurs déjà publiés par ces applications (des chiffres de suivi,
        jamais le contenu d&apos;une tâche, d&apos;un fichier ou d&apos;un courriel).
      </p>

      <h2>Ce que ce site partage</h2>
      <p>
        Rien n&apos;est vendu ni partagé avec un tiers. Ce site utilise Vercel Analytics pour
        compter les visites de page de façon agrégée et anonymisée (sans témoin de suivi
        publicitaire) ; c&apos;est la seule collecte tierce active.
      </p>

      <h2>Révoquer l&apos;accès</h2>
      <p>
        Tu peux retirer à tout moment l&apos;autorisation donnée à ce site depuis ton propre
        compte Google :{" "}
        <a href="https://myaccount.google.com/permissions">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2>Contact</h2>
      <p>
        Aucune adresse de contact publique n&apos;est configurée pour ce site : il
        n&apos;a pas d&apos;utilisateurs autres que son propriétaire, qui gère
        l&apos;accès directement.
      </p>

      <p>
        Voir aussi les <a href="/conditions">conditions d&apos;utilisation</a>.
      </p>
    </PagePublique>
  );
}
