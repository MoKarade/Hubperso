"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { MotifMonde } from "@mokarade/lia-ui";
import { demarrerLia } from "@mokarade/lia-ui/boot";
import { etatHttp } from "@mokarade/lia-ui/etat-http";
import { CLE_LIA_HUB, ENTREES_LIA, EVENEMENT_LIA_VOIR } from "@/lib/lia";
import { poserQuestion } from "@/lib/liaClient";
import { visiterCarte } from "@/lib/liaVisite";
import { entreesMonde, faitDepuisDataset, instantDernierAppel, parleMonde, parleSeule, type FaitLia, type MotifLia } from "@/lib/liaParole";

// LIA sur TOUT le hub (Marc, 23/10/2026 : « présente tout le temps, même si quelque chose charge, même si une
// page bug »). Une seule, dans la FENÊTRE ENTIÈRE, comme dans les apps. Aucun `container` : elle ne réserve aucun
// espace sur la page (sur téléphone, une colonne lui prenait trop de place) et suit le défilement.
//
// ⚠️ ELLE SE MONTE AU CHARGEMENT DE CE MODULE, PAS DANS UN EFFET NI DANS UN COMPOSANT. `demarrerLia`
// (`@mokarade/lia-ui/boot`) la pose dans `document.body`, hors de l'arbre React : un `loading.tsx`, un `error.tsx`,
// un `not-found.tsx` ou un `global-error.tsx` qui remplace le contenu ne l'emporte donc pas avec lui. Le layout
// racine importe ce module, donc il est chargé sur toutes les pages. Le composant exporté ne rend rien : il confie
// seulement le routeur à LIA (sans lui, ses entrées de menu rechargent la page, ce qui marche aussi).
//
// Composant partagé `@mokarade/lia-ui` (épinglé par tag) : il dessine et relaie, le cerveau est dans MemoryAI.
// `ask` appelle `POST /api/lia/ask` (le hub relaie à MemoryAI, `lib/liaClient.ts`) ; tout échec fait dire à LIA
// qu'elle est indisponible, jamais une réponse inventée. Le menu ne mène qu'à des pages du hub, qui se gardent
// toutes seules.
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

/** Le routeur de Next, confié par le composant tant que l'arbre React vit ; sinon la page se recharge. */
let routeur: { push: (href: string) => void } | null = null;

function aller(href: string): void {
  if (routeur) routeur.push(href);
  else window.location.assign(href);
}

// Ce que le hub a de vrai à lui faire dire sur le monde : un problème affiché, ou le constat de la
// carte que Marc fixe. Le texte vient des cartes (lib/liaParole.ts), jamais d'une liste écrite d'avance.
function monde(motif: MotifMonde, element?: Element) {
  const carte = element instanceof HTMLElement ? faitDepuisDataset(element.dataset) : null;
  const dernierAppel = instantDernierAppel(demarrage.poignee()?.journal() ?? []);
  const parole = parleMonde(motif, lireFaits(), carte, dernierAppel, Date.now());
  if (!parole) return null;
  const cible =
    element ?? (parole.appId ? document.querySelector(`[data-lia-app="${CSS.escape(parole.appId)}"]`) : null);
  return { text: parole.text, element: cible };
}

/** « Analyser » (résumé) : LIA va se coller à la carte de l'app et en dit l'état. */
function voir(e: Event): void {
  const appId = (e as CustomEvent<{ appId?: unknown }>).detail?.appId;
  const handle = demarrage.poignee();
  if (typeof appId !== "string" || !handle) return;
  const carte = [...document.querySelectorAll<HTMLElement>("[data-lia-app]")].find((el) => el.dataset.liaApp === appId);
  const fait = carte ? faitDepuisDataset(carte.dataset) : null;
  if (!carte || !fait) return;
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let attente = 0;
  if (!carteVisible(carte)) {
    carte.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "center" });
    attente = reduit ? 0 : 700;
  }
  window.setTimeout(() => {
    // Elle parle même si elle ne peut pas bouger (`lib/liaVisite.ts`).
    visiterCarte(handle, carte, fait.dit, (action, delai) => {
      window.setTimeout(action, delai);
    });
  }, attente);
}

const demarrage = demarrerLia({
  cle: CLE_LIA_HUB,
  // UNE seule LIA : son état (envies, journal, humeur, monde intérieur) est celui de MemoryAI, lu et écrit par la
  // route du hub (`app/api/lia/etat/route.ts`, session du hub, jeton jamais côté client). Si la route échoue, LIA
  // garde son état local et vit quand même.
  etat: etatHttp("/api/lia/etat"),
  actions: ENTREES_LIA.map((e) => ({ id: e.id, label: e.label, run: () => aller(e.href) })),
  ask: (question, signal, etat) => poserQuestion(question, signal, window.location.pathname, undefined, etat),
  onSpontane: (motif: MotifLia) => parleSeule(motif, lireFaits(), new Date().getHours()),
  // Le réseau d'humeurs de LIA se nourrit de l'état réel des cartes affichées (lib/liaParole.ts).
  entrees: () => entreesMonde(lireFaits()),
  monde,
});

if (typeof window !== "undefined") {
  /**
   * L'état de LIA, en LECTURE SEULE, sous `window.__liaEtat()` : ce qu'elle a fait (`journal`), ce qu'elle
   * ressent, ses envies, et les faits qu'elle lit sur les cartes. Sans lui, personne ne pouvait dire en
   * production pourquoi elle se taisait (le PC ne trouvait aucun `window.lia`, 23/10/2026). Ce n'est pas la
   * poignée : on ne peut ni la faire parler ni la déplacer d'ici. Lu à l'appel, donc valable même si elle s'est
   * montée après le chargement de la page ; `null` tant qu'elle n'est pas là.
   */
  (window as unknown as { __liaEtat?: () => unknown }).__liaEtat = () => {
    const h = demarrage.poignee();
    return h ? { journal: h.journal(), ressent: h.ressent(), envies: h.envies(), faits: lireFaits() } : null;
  };
  // Un seul écouteur, même si le module est évalué deux fois (rechargement à chaud) : `voir` est la même
  // fonction tant que le module est le même, et `addEventListener` ignore un doublon identique.
  window.addEventListener(EVENEMENT_LIA_VOIR, voir);
}

/** Confie le routeur à LIA ; ne rend rien. Elle, elle est déjà là (voir `demarrage` plus haut). */
export function LiaBoot(): null {
  const router = useRouter();
  useEffect(() => {
    routeur = router;
    return () => {
      if (routeur === router) routeur = null;
    };
  }, [router]);
  return null;
}
