// lib/chantierCouts.ts — les coûts et quotas des apps, mis en forme pour l'onglet Coûts de la page Chantier.
//
// Ce que montrait la page `/couts` (retirée, décision de Marc du 26/10/2026) vit désormais dans l'onglet
// Coûts du Chantier : les totaux PAR période, le coût et les quotas de chaque app. PUR : aucune I/O, la
// route `app/api/chantier/couts/route.ts` fait les lectures et le composant `ChantierCadre` poste le
// résultat au cadre (le cadre n'a pas de réseau, voir `lib/chantierCadre.ts`).
//
// MÊMES RÈGLES QUE L'ANCIENNE PAGE, au mot près :
//  - un total PAR période, jamais fusionnés ; la raison est écrite à côté quand il y en a plusieurs ;
//  - une app sans coût est nommée, jamais comptée pour 0 ; hors ligne, elle le dit ;
//  - un quota sans plafond publié n'a pas de jauge (`pct: null`), jamais un plafond deviné ;
//  - chaque montant vient de l'app elle-même, jamais estimé par le hub (seule la conversion USD -> CAD l'est).

import {
  PERIOD_LABEL,
  pourquoiPasDeTotalUnique,
  quotaRatio,
  remiseAZero,
  toCad,
  type UsageDigest,
} from "./usage";

interface QuotaCadre {
  label: string;
  used: number;
  limit: number | null;
  unit: string | null;
  /** Part du plafond en %, plafonnée à 100 ; `null` quand le plafond n'est pas publié. */
  pct: number | null;
  /** ≥ 80 % du plafond connu. */
  alerte: boolean;
  /** « se remet à zéro dans 9 j », ou `null` quand l'app ne le dit pas. */
  remise: string | null;
}

interface AppCoutCadre {
  nom: string;
  enLigne: boolean;
  /** L'app publie un coût ou des quotas. */
  suivie: boolean;
  cout: { cad: number; brut: number; devise: "USD" | "CAD"; periode: string } | null;
  quotas: QuotaCadre[];
}

export interface CoutsCadre {
  suivies: number;
  apps: number;
  alertes: number;
  totaux: { periode: string; cad: number; apps: number }[];
  /** Pourquoi il n'y a pas un seul total (plusieurs périodes), ou `null`. */
  note: string | null;
  detail: AppCoutCadre[];
}

/** Le texte que le cadre affiche sous les montants : le taux est approximatif, les API LLM facturent en USD. */
export const NOTE_CONVERSION =
  "Les coûts sont convertis en dollars canadiens à un taux approximatif (les API LLM facturent en USD). " +
  "Chaque montant vient de l’app elle-même, jamais estimé par le hub.";

export function coutsPourCadre(digest: UsageDigest, maintenant: number): CoutsCadre {
  return {
    suivies: digest.trackedCount,
    apps: digest.apps.length,
    alertes: digest.quotaWarnings,
    totaux: digest.totalsByPeriod.map((t) => ({ periode: PERIOD_LABEL[t.period], cad: t.cad, apps: t.appCount })),
    note: pourquoiPasDeTotalUnique(digest.totalsByPeriod),
    detail: digest.apps.map((a) => ({
      nom: a.name,
      enLigne: a.online,
      suivie: a.tracked,
      cout: a.cost
        ? {
            cad: Math.round(toCad(a.cost.amount, a.cost.currency) * 100) / 100,
            brut: a.cost.amount,
            devise: a.cost.currency,
            periode: PERIOD_LABEL[a.cost.period],
          }
        : null,
      quotas: a.quotas.map((q) => {
        const ratio = quotaRatio(q.used, q.limit);
        return {
          label: q.label,
          used: q.used,
          limit: q.limit,
          unit: q.unit ?? null,
          pct: ratio === null ? null : Math.min(100, Math.round(ratio * 100)),
          alerte: ratio !== null && ratio >= 0.8,
          remise: remiseAZero(q.resetAt, maintenant),
        };
      }),
    })),
  };
}
