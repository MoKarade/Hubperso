// Carte « Coûts & quotas » : synthèse cross-app en tête du dashboard, cliquable vers le
// détail (/couts). Générique — agrège le bloc `usage` publié par les apps, rien de spécifique.

import Link from "next/link";
import { formatCad } from "@/lib/format";
import { PERIOD_LABEL, type UsageDigest } from "@/lib/usage";

export function CostsCard({ digest }: { digest: UsageDigest }) {
  const { totalsByPeriod, trackedCount, quotaWarnings, apps } = digest;
  const tracked = apps.filter((a) => a.tracked && a.costCad !== null);

  return (
    <Link href="/couts" className="costs" aria-label="Voir le détail des coûts et quotas">
      <div className="costs__head">
        <p className="costs__eyebrow">Coûts &amp; quotas</p>
        {quotaWarnings > 0 && (
          <span className="costs__warn">
            {quotaWarnings} quota{quotaWarnings > 1 ? "s" : ""} à surveiller
          </span>
        )}
      </div>

      {trackedCount === 0 ? (
        <p className="costs__empty">
          Aucune app ne publie encore ses coûts. Rien inventé.
        </p>
      ) : (
        <>
          {/* Un total PAR période : les apps ne déclarent pas la même (cf. lib/usage.ts).
              Les fusionner donnerait un montant qui n'existe pas. */}
          {totalsByPeriod.map((t) => (
            <p key={t.period} className="costs__total">
              ≈ {formatCad(t.cad)}
              <span className="costs__period"> · {PERIOD_LABEL[t.period]}</span>
            </p>
          ))}
          <ul className="costs__apps">
            {tracked.map((a) => (
              <li key={a.id}>
                <span className="costs__dot" style={a.color ? { background: a.color } : undefined} aria-hidden />
                <span className="costs__name">{a.name}</span>
                <span className="costs__amount">
                  {formatCad(a.costCad ?? 0)}
                  {a.cost && (
                    <span className="costs__period"> · {PERIOD_LABEL[a.cost.period]}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <span className="costs__more">Voir le détail →</span>
    </Link>
  );
}
