// app/chantier/page.tsx — la page de suivi du chantier (accueil, à toi, Gantt, coûts), dans le hub.
//
// RÉSERVÉE AU PROPRIÉTAIRE (`exigerProprietaire`) : le relevé contient l'activité du PC de Marc et les
// titres de tâches privés (FinanceAI, DriveAI).
//
// Cette page ne lit RIEN en base et n'affiche rien elle-même : le cadre isolé (`components/ChantierCadre.tsx`)
// vit dans la mise en page du hub (`components/ChantierPersistant.tsx`), pour ne pas se recharger quand on
// change de page ; il charge le document `/api/chantier/cadre`, puis relit le relevé par
// `/api/chantier/releve` (304 tant que le PC n'a rien envoyé de neuf). La page ne fait donc que GARDER
// l'accès (propriétaire seul) ; le hub peut se rafraîchir sans jamais toucher à la base pour elle.
//
// Les coûts et quotas des apps (ce que montrait la page `/couts`, retirée) arrivent au cadre par
// `/api/chantier/couts`, lue par le composant avec la session du propriétaire.
//
// NO FAKE DATA : sans relevé, la page le dit (« Aucun relevé reçu pour l'instant ») ; elle n'invente
// ni heure ni chiffre.

import { exigerProprietaire } from "@/lib/gardeHub";

export const metadata = {
  title: "Chantier — Hub perso",
};

export const dynamic = "force-dynamic";

export default async function ChantierPage() {
  await exigerProprietaire();
  return null;
}
