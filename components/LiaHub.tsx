"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Lia } from "@mokarade/lia-ui/react";
import { CLE_LIA_HUB, ENTREES_LIA } from "@/lib/lia";

// LIA dans la colonne de gauche de l'accueil (maquette validée par Marc, 22/10/2026).
//
// Composant partagé `@mokarade/lia-ui` (épinglé par tag) : il dessine et relaie, le cerveau est
// dans MemoryAI. ⚠️ AUCUN `ask` ici tant que MemoryAI n'expose pas de point d'entrée pour le hub :
// sans `ask`, LIA dit qu'elle est indisponible (échec fermé du paquet) au lieu d'inventer une
// réponse. Le brancher = passer `ask` à `<Lia>`, rien d'autre à changer. Le menu ne mène qu'à des
// pages du hub, qui se gardent toutes seules.
export function LiaHub() {
  const router = useRouter();
  // `container` n'est lu qu'au montage : on attend donc que la colonne existe avant de monter LIA.
  const [colonne, setColonne] = useState<HTMLDivElement | null>(null);
  const actions = useMemo(
    () => ENTREES_LIA.map((e) => ({ id: e.id, label: e.label, run: () => router.push(e.href) })),
    [router],
  );
  return (
    <div ref={setColonne} className="lia-colonne" role="region" aria-label="LIA, l’assistante">
      {colonne && <Lia container={colonne} cle={CLE_LIA_HUB} actions={actions} />}
    </div>
  );
}
