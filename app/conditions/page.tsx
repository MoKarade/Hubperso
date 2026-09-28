// app/conditions/page.tsx — conditions d'utilisation, publiques, sans session.
//
// Exigée par la vérification Google OAuth (Test → Production), au même titre que
// /confidentialite. Voir lib/authGuard.ts (isPublicPath) — AUCUNE exclusion ajoutée au
// matcher de middleware.ts (CLAUDE.local.md).

import { PagePublique } from "@/components/PagePublique";

export const metadata = {
  title: "Conditions d’utilisation — Hub perso",
  description: "À qui s'adresse ce site, et dans quel cadre.",
};

export default function ConditionsPage() {
  return (
    <PagePublique titre="Conditions d’utilisation" maj="28 septembre 2026">
      <p>
        Ce site (hubperso.com) est un tableau de bord à <strong>usage strictement
        personnel</strong>, développé et exploité par son propriétaire pour son propre
        usage. Il n&apos;est ni un produit, ni un service public, ni ouvert à
        l&apos;inscription : l&apos;accès est accordé un par un, à la main, par son
        propriétaire.
      </p>

      <h2>Ce que fait ce site</h2>
      <p>
        Il rassemble, sur une seule page, l&apos;état de plusieurs applications
        personnelles — des indicateurs déjà publiés par ces applications elles-mêmes,
        affichés au même endroit plutôt que répartis sur plusieurs sites.
      </p>

      <h2>Aucune garantie</h2>
      <p>
        Ce site est fourni tel quel, sans garantie de disponibilité, d&apos;exactitude ou
        de continuité. Il peut changer, se déconnecter d&apos;une application, ou cesser
        de fonctionner sans préavis.
      </p>

      <h2>Accès et révocation</h2>
      <p>
        L&apos;accès à ce site est accordé individuellement par son propriétaire, et peut
        être retiré à tout moment de la même façon. Voir la{" "}
        <a href="/confidentialite">politique de confidentialité</a> pour ce que ce site lit
        auprès de Google et comment retirer cette autorisation directement depuis ton compte
        Google.
      </p>

      <h2>Contact</h2>
      <p>
        Aucune adresse de contact publique n&apos;est configurée pour ce site : il
        n&apos;a pas d&apos;utilisateurs autres que son propriétaire.
      </p>
    </PagePublique>
  );
}
