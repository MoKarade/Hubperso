"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Lia } from "@mokarade/lia-ui/react";
import { CLE_LIA_HUB, ENTREES_LIA } from "@/lib/lia";
import { poserQuestion } from "@/lib/liaClient";

// LIA dans la colonne de gauche de l'accueil (maquette validée par Marc, 22/10/2026).
//
// Composant partagé `@mokarade/lia-ui` (épinglé par tag) : il dessine et relaie, le cerveau est
// dans MemoryAI. `ask` appelle `POST /api/lia/ask` (le hub relaie à MemoryAI, `lib/liaClient.ts`) ;
// tout échec fait dire à LIA qu'elle est indisponible, jamais une réponse inventée. Le menu ne mène
// qu'à des pages du hub, qui se gardent toutes seules.
export function LiaHub() {
  const router = useRouter();
  const page = usePathname();
  // `container` n'est lu qu'au montage : on attend donc que la colonne existe avant de monter LIA.
  const [colonne, setColonne] = useState<HTMLDivElement | null>(null);
  const actions = useMemo(
    () => ENTREES_LIA.map((e) => ({ id: e.id, label: e.label, run: () => router.push(e.href) })),
    [router],
  );
  const ask = useCallback(
    (question: string, signal: AbortSignal) => poserQuestion(question, signal, page),
    [page],
  );
  return (
    <div ref={setColonne} className="lia-colonne" role="region" aria-label="LIA, l’assistante">
      {colonne && <Lia container={colonne} cle={CLE_LIA_HUB} actions={actions} ask={ask} />}
    </div>
  );
}
