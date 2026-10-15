// components/DetailCouts.tsx — le bloc « Coûts & quotas » de la page de détail (/app/[id]).
//
// Sorti de `app/app/[id]/page.tsx` (refactor sans changement de rendu).
// « Non suivi » et non « 0 $ » quand l'app ne publie pas de bloc `usage` : on ne sait rien,
// et afficher un zéro affirmerait un suivi qui n'existe pas.

import type { HubQuota, HubUsage } from "@mokarade/hub-contract";
import { barreQuota, libelleQuota } from "@/lib/carte";
import { quotaRatio, toCad } from "@/lib/usage";
import { formatCad, formatDateTime } from "@/lib/format";
import { Sparkline } from "@/components/Sparkline";
import { serieCout, type Releve } from "@/lib/historique";

function QuotaDetaille({ quota }: { quota: HubQuota }) {
  const ratio = quotaRatio(quota.used, quota.limit);
  const barre = ratio !== null ? barreQuota(ratio) : null;
  return (
    <div className="couts__quota">
      <span>{libelleQuota(quota)}</span>
      {barre && (
        <div className="couts__bar">
          <span
            className={`couts__barfill${barre.alerte ? " couts__barfill--warn" : ""}`}
            style={{ width: barre.largeur }}
          />
        </div>
      )}
      {quota.resetAt && (
        <p className="couts__nolimit">Remise à zéro : {formatDateTime(quota.resetAt)}</p>
      )}
    </div>
  );
}

function CoutPeriode({ cost }: { cost: NonNullable<HubUsage["cost"]> }) {
  return (
    <p className="detail__cout">
      {formatCad(toCad(cost.amount, cost.currency))}{" "}
      <span className="detail__periode">
        ({cost.period}
        {cost.currency === "USD" && " — converti depuis USD"})
      </span>
    </p>
  );
}

// La courbe du coût : UNE période et UNE devise, celles affichées juste au-dessus (jamais de
// mélange total/mois/jour). Moins de deux relevés comparables : on le dit, on ne trace rien.
function CourbeCout({
  cost,
  historique,
}: {
  cost: NonNullable<HubUsage["cost"]>;
  historique: Releve[];
}) {
  const points = serieCout(historique, cost.period, cost.currency);
  if (points.length < 2) return <p className="detail__attente">pas encore d’historique</p>;
  return (
    <div className="detail__metrique">
      <div className="detail__metrique-courbe">
        <Sparkline points={points} label={`coût (${cost.period}, ${cost.currency})`} />
      </div>
      <p className="detail__metrique-note">
        Évolution du coût ({cost.period}, {cost.currency}) : {points.length} relevés
      </p>
    </div>
  );
}

export function DetailCouts({
  usage,
  historique = [],
}: {
  usage: HubUsage | undefined;
  historique?: Releve[];
}) {
  return (
    <section className="detail__bloc" aria-label="Coûts et quotas">
      <h2 className="detail__titre">Coûts &amp; quotas</h2>
      {!usage ? (
        <p className="detail__vide">Non suivi par cette app.</p>
      ) : (
        <>
          {usage.cost && <CoutPeriode cost={usage.cost} />}
          {usage.cost && <CourbeCout cost={usage.cost} historique={historique} />}
          {usage.quotas?.map((q, i) => (
            <QuotaDetaille key={`${q.label}-${i}`} quota={q} />
          ))}
        </>
      )}
    </section>
  );
}
