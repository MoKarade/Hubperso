// app/chantier/page.tsx — suivi de l'heure du dernier relevé Gantt.
//
// RÉSERVÉE AU PROPRIÉTAIRE (`exigerProprietaire`) : un relevé Gantt contient l'activité
// du PC de Marc.
//
// NO FAKE DATA :
// - Sans ligne en base : « Aucun relevé reçu pour l'instant », jamais une date inventée.
// - Base injoignable : « Le relevé est indisponible : <détail> », jamais une fausse absence.
// - La page n'affiche PAS le contenu du relevé (titres de tâches privés), seulement les deux heures.

import Link from "next/link";
import { exigerProprietaire } from "@/lib/gardeHub";
import { baseConfiguree } from "@/lib/db";
import { lireGantt } from "@/lib/ganttDb";
import { etatChantier, type EtatChantier } from "@/lib/chantier";

export const metadata = {
  title: "Chantier — Hub perso",
};

export const dynamic = "force-dynamic";

export default async function ChantierPage() {
  await exigerProprietaire();

  let etat: EtatChantier;

  if (!baseConfiguree()) {
    etat = etatChantier(null, new Error("DATABASE_URL absente"));
  } else {
    try {
      const releve = await lireGantt();
      etat = etatChantier(releve);
    } catch (erreur) {
      console.error("[chantier] lecture du relevé Gantt impossible :", erreur);
      etat = etatChantier(null, erreur);
    }
  }

  return (
    <main className="page">
      <header className="page__head">
        <div>
          <p className="page__eyebrow">hubperso.com</p>
          <h1 className="page__title">Chantier</h1>
        </div>
        <Link href="/" className="btn">
          ← Hub
        </Link>
      </header>

      {etat.type === "indisponible" ? (
        <p className="admin__vide" role="alert">
          {etat.message}
        </p>
      ) : etat.type === "aucun" ? (
        <p className="attention__vide">{etat.message}</p>
      ) : (
        <div className="attention__vide">
          <p className="page__sub">{etat.recuTexte}</p>
          <p className="page__meta">{etat.envoyeTexte}</p>
        </div>
      )}
    </main>
  );
}
