// /couts — détail des coûts & quotas par app. Derrière l'auth (middleware + revérif session
// côté serveur, défense en profondeur : cette page déclenche le fetch porteur des jetons).
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerAccesHub } from "@/lib/gardeHub";
import { isAuthConfigured } from "@/lib/authConfigured";
import { getSources } from "@/lib/sources";
import { fetchAllSummaries } from "@/lib/fetchSummary";
import {
  PERIOD_LABEL,
  aggregateUsage,
  pourquoiPasDeTotalUnique,
  quotaRatio,
  toCad,
} from "@/lib/usage";
import { formatCad } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CoutsPage() {
  if (!isAuthConfigured()) redirect("/");
  // Session ET accès au hub : cette page affiche les coûts des cinq apps (lib/gardeHub.ts).
  await exigerAccesHub();

  const results = await fetchAllSummaries(getSources());
  const digest = aggregateUsage(results);
  const note = pourquoiPasDeTotalUnique(digest.totalsByPeriod);

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Coûts &amp; quotas</h1>
        </div>
        <div className="page__aside">
          <p className="page__meta">
            {digest.trackedCount}/{digest.apps.length} app(s) suivie(s)
          </p>
          <Link href="/" className="btn">← Hub</Link>
        </div>
      </header>

      {/* LE TOTAL, EN ÉVIDENCE. Il était relégué dans la ligne grise de l'en-tête, sur une
          page qui ne parle que de ça. Un montant PAR PÉRIODE (jamais fusionné, cf.
          lib/usage.ts) — et, quand il y en a plusieurs, la RAISON écrite à côté : deux
          nombres côte à côte sans explication invitent à les additionner de tête, ce qui
          refait précisément l'erreur que le code évite. */}
      {digest.totalsByPeriod.length > 0 && (
        <section className="totaux" aria-label="Totaux des coûts">
          <div className="totaux__liste">
            {digest.totalsByPeriod.map((t) => (
              <div key={t.period} className="totaux__bloc">
                <p className="totaux__montant">≈ {formatCad(t.cad)}</p>
                <p className="totaux__periode">{PERIOD_LABEL[t.period]}</p>
                <p className="totaux__apps">
                  {t.appCount} app{t.appCount > 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
          {note && <p className="totaux__note">{note}</p>}
        </section>
      )}

      <section className="couts" aria-label="Coûts et quotas par application">
        {digest.apps.map((a) => (
          <article key={a.id} className="couts__app">
            <header className="couts__apphead">
              <span className="couts__dot" style={a.color ? { background: a.color } : undefined} aria-hidden />
              <h2 className="couts__appname">{a.name}</h2>
              {!a.online && <span className="couts__off">hors ligne</span>}
            </header>

            {!a.tracked ? (
              <p className="couts__empty">
                {a.online ? "Cette app ne publie pas encore de coûts ni de quotas." : "État indisponible."}
              </p>
            ) : (
              <>
                {a.cost && (
                  <p className="couts__cost">
                    ≈ {formatCad(Math.round(toCad(a.cost.amount, a.cost.currency) * 100) / 100)}
                    <span className="couts__costraw">
                      {" "}
                      ({a.cost.amount.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} {a.cost.currency}) ·{" "}
                      {PERIOD_LABEL[a.cost.period]}
                    </span>
                  </p>
                )}
                {a.quotas.length > 0 && (
                  <ul className="couts__quotas">
                    {a.quotas.map((q, i) => {
                      const ratio = quotaRatio(q.used, q.limit);
                      const pct = ratio === null ? null : Math.min(100, Math.round(ratio * 100));
                      const warn = ratio !== null && ratio >= 0.8;
                      return (
                        <li key={i} className="couts__quota">
                          <div className="couts__quotatop">
                            <span>{q.label}</span>
                            <span className={warn ? "couts__quotawarn" : undefined}>
                              {q.used.toLocaleString("fr-CA")}
                              {q.limit !== null ? ` / ${q.limit.toLocaleString("fr-CA")}` : ""}
                              {q.unit ? ` ${q.unit}` : ""}
                            </span>
                          </div>
                          {pct !== null ? (
                            <div className="couts__bar">
                              <span className={`couts__barfill${warn ? " couts__barfill--warn" : ""}`} style={{ width: `${pct}%` }} />
                            </div>
                          ) : (
                            <p className="couts__nolimit">Pas de plafond connu.</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </article>
        ))}
      </section>

      <p className="couts__note">
        Les coûts sont convertis en CAD à un taux approximatif (les API LLM facturent en USD).
        Chaque montant vient de l’app elle-même — jamais estimé par le hub.
      </p>
    </main>
  );
}
