"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Lia } from "@mokarade/lia-ui/react";
import { CLE_LIA_HUB, ENTREES_LIA } from "@/lib/lia";
import { poserQuestion } from "@/lib/liaClient";

// LIA sur l'accueil (Marc, 22/10/2026) : une seule, dans la FENÊTRE ENTIÈRE, comme dans les apps.
// Aucun `container` : elle ne réserve aucun espace sur la page (sur téléphone, une colonne lui
// prenait trop de place) et suit le défilement. Le composant ne rend rien dans la page même.
//
// Composant partagé `@mokarade/lia-ui` (épinglé par tag) : il dessine et relaie, le cerveau est
// dans MemoryAI. `ask` appelle `POST /api/lia/ask` (le hub relaie à MemoryAI, `lib/liaClient.ts`) ;
// tout échec fait dire à LIA qu'elle est indisponible, jamais une réponse inventée. Le menu ne mène
// qu'à des pages du hub, qui se gardent toutes seules.
export function LiaHub() {
  const router = useRouter();
  const page = usePathname();
  const actions = useMemo(
    () => ENTREES_LIA.map((e) => ({ id: e.id, label: e.label, run: () => router.push(e.href) })),
    [router],
  );
  const ask = useCallback(
    (question: string, signal: AbortSignal) => poserQuestion(question, signal, page),
    [page],
  );
  return <Lia cle={CLE_LIA_HUB} actions={actions} ask={ask} />;
}
