// app/bilans/loading.tsx — affiché par Next.js pendant la garde de la page.

export default function ChargementBilans() {
  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Bilans</h1>
        </div>
      </header>
      <p className="page__meta" role="status">
        Chargement…
      </p>
    </main>
  );
}
