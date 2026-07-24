// /couts — détail des coûts & quotas par app. Derrière l'auth (middleware + revérif session
// côté serveur, défense en profondeur : cette page déclenche le fetch porteur des jetons).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/authConfigured";
import { getSources } from "@/lib/sources";
import { fetchAllSummaries } from "@/lib/fetchSummary";
import { aggregateUsage, quotaRatio, toCad } from "@/lib/usage";
import { formatCad } from "@/lib/format";

export const dynamic = "force-dynamic";

const PERIOD_LABEL: Record<"total" | "mois" | "jour", string> = {
  total: "cumulé",
  mois: "ce mois-ci",
  jour: "aujourd’hui",
};

export default async function CoutsPage() {
  if (!isAuthConfigured()) redirect("/");
  const session = await auth();
  if (!session) redirect("/login");

  const results = await fetchAllSummaries(getSources());
  const digest = aggregateUsage(results);

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Coûts &amp; quotas</h1>
        </div>
        <div className="page__aside">
          <p className="page__meta">
            {digest.trackedCount}/{digest.apps.length} app(s) suivie(s) · total ≈ {formatCad(digest.totalCad)}
          </p>
          <Link href="/" className="btn">← Hub</Link>
        </div>
      </header>

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
