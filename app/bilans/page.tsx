// app/bilans/page.tsx — les bilans du jour et de la semaine, dans le hub (Hubperso#543).
//
// RÉSERVÉE AU PROPRIÉTAIRE (`exigerProprietaire`) : un bilan est personnel. La page ne lit rien en base ni dans
// Drive : le composant client relit `/api/bilans` avec la session, et chaque bilan s'affiche dans un cadre isolé.

import { BilansVue } from "@/components/BilansVue";
import { exigerProprietaire } from "@/lib/gardeHub";

export const metadata = {
  title: "Bilans — Hub perso",
};

export const dynamic = "force-dynamic";

export default async function BilansPage() {
  await exigerProprietaire();
  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Bilans</h1>
        </div>
      </header>
      <BilansVue />
    </main>
  );
}
