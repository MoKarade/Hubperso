// app/chantier/page.tsx — la page de suivi du chantier (accueil, à toi, Gantt, coûts), dans le hub.
//
// RÉSERVÉE AU PROPRIÉTAIRE (`exigerProprietaire`) : le relevé contient l'activité du PC de Marc et les
// titres de tâches privés (FinanceAI, DriveAI).
//
// Cette page ne lit RIEN en base : elle pose un cadre isolé (`components/ChantierCadre.tsx`) qui
// charge le document `/api/chantier/cadre`, puis relit le relevé par `/api/chantier/releve` (304
// tant que le PC n'a rien envoyé de neuf). Le hub peut donc se rafraîchir sans jamais toucher à
// la base pour elle.
//
// NO FAKE DATA : sans relevé, la page le dit (« Aucun relevé reçu pour l'instant ») ; elle n'invente
// ni heure ni chiffre.

import { exigerProprietaire } from "@/lib/gardeHub";
import { ChantierCadre } from "@/components/ChantierCadre";

export const metadata = {
  title: "Chantier — Hub perso",
};

export const dynamic = "force-dynamic";

export default async function ChantierPage() {
  await exigerProprietaire();
  return <ChantierCadre />;
}
