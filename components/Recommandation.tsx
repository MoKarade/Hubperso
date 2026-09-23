// components/Recommandation.tsx — ce qu'il y a de MIEUX à faire, pas ce qui va mal.
//
// ── POURQUOI CE N'EST PAS UNE ALERTE, ET POURQUOI ÇA COMPTE ─────────────────────────
//
// Avant le contrat v1.3, une app qui voulait conseiller quelque chose passait par une
// `alert` de sévérité `info` : son conseil arrivait donc rangé avec les problèmes, dans la
// liste qu'on lit quand quelque chose ne va pas. Deux issues, mauvaises toutes les deux —
// un bon conseil mis en forme comme un incident, ou une liste d'incidents diluée qu'on
// apprend à ne plus lire (ADR/BACKLOG [H-12]).
//
// D'où un rendu VOLONTAIREMENT distinct des bandeaux d'alerte : pas de code de gravité, pas
// de rouge ni d'orange, une flèche plutôt qu'un pictogramme d'avertissement. On doit pouvoir
// dire d'un coup d'œil « ça, c'est une suggestion » sans lire le texte.
//
// ── SINGULIER, ET C'EST LE CONTRAT QUI LE TIENT ─────────────────────────────────────
//
// Le champ est un objet, pas un tableau. Un tableau se serait rempli de cinq conseils par
// app, et un tableau de bord qui affiche vingt-cinq conseils n'en affiche aucun.
//
// ── LE LIEN EST DÉJÀ JUGÉ QUAND IL ARRIVE ICI ───────────────────────────────────────
//
// `href` a traversé `safeHttpUrl` dans `lib/carte.ts`. Ce composant ne revalide rien et ne
// doit RIEN revalider : deux endroits qui jugent la même URL finissent par en juger
// différemment. Un `href` à `null` signifie « affiche le texte, sans lien » — jamais
// « n'affiche rien » : le conseil reste lisible quand son lien est refusé.

import type { Recommandation as Reco } from "@/lib/carte";
import { Icone } from "./Icone";

export function Recommandation({ reco, compact = false }: { reco: Reco; compact?: boolean }) {
  return (
    <div className="reco" data-compact={compact ? "" : undefined}>
      {/* ⚠️ UNE AMPOULE, PAS UN TRIANGLE D'ALERTE — et c'est la raison d'être de ce
          composant : un conseil n'est pas un problème. Le vocabulaire visuel des alertes lui
          est INTERDIT, sinon il se range dans la liste des incidents et se fait ignorer avec
          eux. C'était la flèche « → », un caractère ; le dessin tient le même rôle en
          disant mieux « suggestion » que « étape suivante ». */}
      <Icone nom="conseil" className="reco__icone" />
      <div className="reco__texte">
        <p className="reco__label">
          {reco.href ? (
            // `noreferrer noopener` comme partout ailleurs dans le hub : la cible est une
            // URL publiée par une app, donc pas quelque chose qu'on contrôle.
            <a href={reco.href} target="_blank" rel="noreferrer noopener">
              {reco.label}
            </a>
          ) : (
            reco.label
          )}
        </p>
        {/* Le « pourquoi » est masqué sur la carte (compact) et rendu en entier dans la vue
            détaillée. Ce n'est pas une troncature : c'est le même texte, montré là où il y a
            la place de le lire. */}
        {!compact && reco.pourquoi && <p className="reco__pourquoi">{reco.pourquoi}</p>}
      </div>
    </div>
  );
}
