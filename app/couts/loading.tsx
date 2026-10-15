// app/couts/loading.tsx — affiché par Next pendant que la page interroge les apps (jusqu'à
// 9 s si une app est lente). Aucune donnée ici : seulement le titre et un message.

export default function Chargement() {
  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Coûts \&amp; quotas</h1>
        </div>
      </header>
      <p className="page__meta" role="status">
        Chargement…
      </p>
    </main>
  );
}
