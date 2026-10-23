"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LiaHandle, MotifMonde } from "@mokarade/lia-ui";
import { Lia } from "@mokarade/lia-ui/react";
import { CLE_LIA_HUB, ENTREES_LIA, EVENEMENT_LIA_VOIR } from "@/lib/lia";
import { poserQuestion } from "@/lib/liaClient";
import { visiterCarte } from "@/lib/liaVisite";
import { entreesMonde, faitDepuisDataset, instantDernierAppel, parleMonde, parleSeule, type FaitLia, type MotifLia } from "@/lib/liaParole";

// LIA sur l'accueil (Marc, 22/10/2026) : une seule, dans la FENÊTRE ENTIÈRE, comme dans les apps.
// Aucun `container` : elle ne réserve aucun espace sur la page (sur téléphone, une colonne lui
// prenait trop de place) et suit le défilement. Le composant ne rend rien dans la page même.
//
// Composant partagé `@mokarade/lia-ui` (épinglé par tag) : il dessine et relaie, le cerveau est
// dans MemoryAI. `ask` appelle `POST /api/lia/ask` (le hub relaie à MemoryAI, `lib/liaClient.ts`) ;
// tout échec fait dire à LIA qu'elle est indisponible, jamais une réponse inventée. Le menu ne mène
// qu'à des pages du hub, qui se gardent toutes seules.
//
// Elle VIT sur la page (Marc, 23/10/2026, « manque sa parole, ses mouvements ») : les cartes portent
// `data-lia-cible` et `data-lia-dit` (leur état réel, `lib/liaParole.ts`), elle va s'y coller d'elle-même
// ou quand Marc touche « Analyser », et ne parle seule que d'après ces mêmes cartes : une page pas
// encore chargée, ou sans rien à signaler, la laisse muette. Aucun appel au modèle, aucun coût.

/** Ce que les cartes affichées disent de leur app, lu à l'instant où LIA veut parler. */
function lireFaits(): FaitLia[] {
  const faits: FaitLia[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("[data-lia-app]")) {
    const fait = faitDepuisDataset(el.dataset);
    if (fait) faits.push(fait);
  }
  return faits;
}

/** Montre la carte à Marc s'il l'a demandé (geste explicite) : seul LIA ne fait jamais défiler. */
function carteVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
}

export function LiaHub() {
  const router = useRouter();
  const page = usePathname();
  const lia = useRef<LiaHandle | null>(null);
  const actions = useMemo(
    () => ENTREES_LIA.map((e) => ({ id: e.id, label: e.label, run: () => router.push(e.href) })),
    [router],
  );
  const ask = useCallback(
    (question: string, signal: AbortSignal) => poserQuestion(question, signal, page),
    [page],
  );
  const onSpontane = useCallback(
    (motif: MotifLia) => parleSeule(motif, lireFaits(), new Date().getHours()),
    [],
  );

  // Le réseau d'humeurs de LIA se nourrit de l'état réel des cartes affichées (lib/liaParole.ts).
  const entrees = useCallback(() => entreesMonde(lireFaits()), []);

  // Ce que le hub a de vrai à lui faire dire sur le monde : un problème affiché, ou le constat de la
  // carte que Marc fixe. Le texte vient des cartes (lib/liaParole.ts), jamais d'une liste écrite d'avance.
  const monde = useCallback((motif: MotifMonde, element?: Element) => {
    const carte =
      element instanceof HTMLElement ? faitDepuisDataset(element.dataset) : null;
    const dernierAppel = instantDernierAppel(lia.current?.journal() ?? []);
    const parole = parleMonde(motif, lireFaits(), carte, dernierAppel, Date.now());
    if (!parole) return null;
    const cible =
      element ?? (parole.appId ? document.querySelector(`[data-lia-app="${CSS.escape(parole.appId)}"]`) : null);
    return { text: parole.text, element: cible };
  }, []);

  // « Analyser » (résumé) : LIA va se coller à la carte de l'app et en dit l'état.
  useEffect(() => {
    const minuteries: number[] = [];
    const voir = (e: Event) => {
      const appId = (e as CustomEvent<{ appId?: unknown }>).detail?.appId;
      const handle = lia.current;
      if (typeof appId !== "string" || !handle) return;
      const carte = [...document.querySelectorAll<HTMLElement>("[data-lia-app]")].find(
        (el) => el.dataset.liaApp === appId,
      );
      const fait = carte ? faitDepuisDataset(carte.dataset) : null;
      if (!carte || !fait) return;
      const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let attente = 0;
      if (!carteVisible(carte)) {
        carte.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "center" });
        attente = reduit ? 0 : 700;
      }
      minuteries.push(
        window.setTimeout(() => {
          // Elle parle même si elle ne peut pas bouger (`lib/liaVisite.ts`).
          visiterCarte(handle, carte, fait.dit, (action, delai) => {
            minuteries.push(window.setTimeout(action, delai));
          });
        }, attente),
      );
    };
    window.addEventListener(EVENEMENT_LIA_VOIR, voir);
    return () => {
      window.removeEventListener(EVENEMENT_LIA_VOIR, voir);
      minuteries.forEach((m) => window.clearTimeout(m));
    };
  }, []);

  return (
    <Lia
      cle={CLE_LIA_HUB}
      actions={actions}
      ask={ask}
      onSpontane={onSpontane}
      entrees={entrees}
      monde={monde}
      onPret={(h) => {
        lia.current = h;
      }}
    />
  );
}
