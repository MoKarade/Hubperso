// components/DetailCouts.tsx — le bloc « Coûts & quotas » de la page de détail (/app/[id]).
//
// Sorti de `app/app/[id]/page.tsx` (refactor sans changement de rendu).
// « Non suivi » et non « 0 $ » quand l'app ne publie pas de bloc `usage` : on ne sait rien,
// et afficher un zéro affirmerait un suivi qui n'existe pas.

import type { HubQuota, HubUsage } from "@mokarade/hub-contract";
import { barreQuota, libelleQuota } from "@/lib/carte";
import { PERIOD_LABEL, quotaRatio, toCad } from "@/lib/usage";
import { formatCad, formatDateTime } from "@/lib/format";

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
        ({PERIOD_LABEL[cost.period]}
        {cost.currency === "USD" && " — converti depuis USD"})
      </span>
    </p>
  );
}

export function DetailCouts({ usage }: { usage: HubUsage | undefined }) {
  return (
    <section className="detail__bloc" aria-label="Coûts et quotas">
      <h2 className="detail__titre">Coûts &amp; quotas</h2>
      {!usage ? (
        <p className="detail__vide">Non suivi par cette app.</p>
      ) : (
        <>
          {usage.cost && <CoutPeriode cost={usage.cost} />}
          {usage.quotas?.map((q, i) => (
            <QuotaDetaille key={`${q.label}-${i}`} quota={q} />
          ))}
        </>
      )}
    </section>
  );
}
