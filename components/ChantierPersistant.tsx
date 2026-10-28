"use client";

// components/ChantierPersistant.tsx — le cadre du Chantier, monté dans la mise en page du hub.
//
// Une page qu'on quitte est détruite, et son `<iframe>` avec elle : y revenir rechargeait le document, le
// relevé, et remettait le Gantt à zéro (le cadre isolé n'a pas de stockage). Ici le cadre appartient à la
// mise en page (`Cadre`, `components/Navigation.tsx`), qui ne se démonte pas d'une page à l'autre : hors de
// `/chantier` il reste en place, caché, et ne lit plus rien ; on y revient à l'état où on l'a laissé.
//
// Monté à la PREMIÈRE visite de `/chantier` seulement : les autres pages du hub ne paient ni le document
// ni le relevé. Le propriétaire seul le reçoit (`Cadre` ne le rend que s'il a l'entrée « Chantier ») ;
// la route du cadre et celles du relevé se gardent d'elles-mêmes.

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChantierCadre } from "@/components/ChantierCadre";
import { ongletDe } from "@/lib/chantierCadre";

export function ChantierPersistant() {
  const chemin = usePathname();
  const onglet = ongletDe(useSearchParams().get("onglet"));
  const actif = chemin === "/chantier";
  const [visite, setVisite] = useState(actif);
  // Ajusté pendant le rendu (et non dans un effet) : le cadre est monté dès l'arrivée sur /chantier.
  if (actif && !visite) setVisite(true);
  if (!visite) return null;
  return <ChantierCadre actif={actif} onglet={onglet} />;
}
