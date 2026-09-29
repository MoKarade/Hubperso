// components/DetailContenu.tsx — ce que l'app PUBLIE au-delà des métriques, rendu en entier
// sur la page de détail (/app/[id]) : sa recommandation et ses sections `details`.
//
// Sorti de `app/app/[id]/page.tsx` (refactor sans changement de rendu).

import type { HubSummary } from "@mokarade/hub-contract";
import { lienRecoRefuse, type Recommandation as Reco, type SectionDetail } from "@/lib/carte";
import { Recommandation } from "./Recommandation";
import { Icone } from "./Icone";
import { LignesDetail } from "./LignesDetail";

/**
 * LA RECOMMANDATION AVANT LES MÉTRIQUES, sur cette page seulement.
 * Sur la carte elle vient APRÈS les chiffres, parce qu'on y arrive par un coup d'œil. Sur la
 * page de détail on arrive par une question — « qu'est-ce que je fais de cette app ? » — et
 * la réponse doit être la première chose lue. Ce n'est pas une incohérence : c'est le même
 * contenu placé selon ce qu'on est venu chercher. Le « pourquoi » n'est rendu qu'ICI
 * (`compact` absent) : la place existe.
 */
export function DetailRecommandation({ reco, summary }: { reco: Reco; summary: HubSummary }) {
  return (
    <section className="detail__bloc" aria-label="Recommandation">
      <h2 className="detail__titre">Recommandation</h2>
      <Recommandation reco={reco} />
      {lienRecoRefuse(reco, summary) && (
        // Refus VISIBLE, jamais silencieux : l'app a publié un lien que `safeHttpUrl` a
        // écarté (autre chose que http/https). Le taire donnerait un conseil qui semble
        // simplement ne pas être cliquable, et personne n'irait corriger l'app.
        <p className="detail__note">
          ⚠️ Le lien publié avec cette recommandation a été refusé (ni <code>http</code>
          {" "}ni <code>https</code>). Le texte reste affiché, le lien non.
        </p>
      )}
    </section>
  );
}

/**
 * LES BLOCS `details` DE L'APP — ce que les 6 métriques ne peuvent pas porter.
 *
 * Le plafond de `metrics` est SIX, et il est volontaire : une carte qui en affiche vingt n'en
 * affiche aucune. Mais une app a souvent des lignes qui méritent d'être lues sans mériter la
 * carte — les campagnes de rangement de DriveAI, les placements par compte de FinanceAI, la
 * dernière passe de veille de JobAI. Le contrat v1.3 leur donne `details` : jusqu'à 6 sections
 * de 8 lignes, chacune titrée par l'app.
 *
 * ⚠️ Ce bloc a été dit « rendu ICI et nulle part ailleurs » JUSQU'AU 23/09/2026. C'est devenu
 * faux ce jour-là : la carte du héros en montre un APERÇU borné (2 sections × 4 lignes, cf.
 * `bornerDetails` dans `lib/carte.ts`). La raison d'alors — « 48 lignes sur une carte bento
 * casseraient la grille » — reste vraie POUR 48 LIGNES, et c'est pourquoi l'aperçu est borné
 * et réservé à la carte qui a 2×2 cases. ICI, et seulement ici, elles sont rendues TOUTES :
 * la carte est un aperçu, cette page est la source.
 *
 * GÉNÉRIQUE, comme tout le reste : le hub ne connaît aucun de ces titres, il rend ce qu'on
 * lui publie. Aucune section n'est réordonnée ni fusionnée — l'ordre est celui de l'app, qui
 * seule sait ce qui compte le plus chez elle.
 */
export function DetailSections({ details }: { details: SectionDetail[] | undefined }) {
  return (
    <>
      {details?.map((section, s) => (
        <section className="detail__bloc" aria-label={section.title} key={`${section.title}-${s}`}>
          <h2 className="detail__titre">
            <Icone nom="section" />
            {section.title}
          </h2>
          {/* ⚠️ MÊME COMPOSANT QUE LA CARTE (`LignesDetail`), et c'est délibéré : depuis le
              23/09 ces lignes sont rendues à DEUX endroits. Deux copies se lisent très bien
              chacune de son côté — une duplication n'existe qu'à l'échelle du diff (leçon
              n° 11) — et divergeraient au premier ajustement de `hint`. */}
          <LignesDetail items={section.items} />
        </section>
      ))}
    </>
  );
}
