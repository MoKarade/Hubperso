// app/demandes/loading.tsx — affiché pendant que la page interroge MemoryAI (jusqu'à 8 s). Aucune donnée ici.

export default function Chargement() {
  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Demandes</h1>
        </div>
      </header>
      <p className="page__meta" role="status">
        Chargement…
      </p>
    </main>
  );
}
