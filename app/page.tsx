import { getSources } from "@/lib/sources";
import { fetchAllSummaries } from "@/lib/fetchSummary";
import { formatDateTime } from "@/lib/format";
import { AppWidget } from "@/components/AppWidget";

// Un summary est un instantané : toujours frais, jamais mis en cache statiquement.
export const dynamic = "force-dynamic";

export default async function Page() {
  const results = await fetchAllSummaries(getSources());
  const online = results.filter((r) => r.state === "ok").length;
  const refreshedAt = formatDateTime(new Date().toISOString());

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Hub</h1>
        </div>
        <p className="page__meta">
          {online}/{results.length} en ligne · rafraîchi {refreshedAt}
        </p>
      </header>

      <section className="bento" aria-label="Widgets des apps">
        {results.map((result) => (
          <AppWidget key={result.source.id} result={result} />
        ))}
      </section>
    </main>
  );
}
