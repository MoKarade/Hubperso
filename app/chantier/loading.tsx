// app/chantier/loading.tsx — affiché par Next.js pendant la lecture en base.

export default function ChargementChantier() {
  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Chantier</h1>
        </div>
      </header>
      <p className="page__meta" role="status">
        Chargement…
      </p>
    </main>
  );
}
