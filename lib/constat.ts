// lib/constat.ts — le cadre « Dernière analyse » d'une carte. PUR, hors le seul `poserConstat`, qui ne touche que
// l'élément qu'on lui passe.
//
// Maquette validée (22/10/2026) : quand LIA a regardé une carte, elle y laisse son constat, dans un cadre en
// pointillés teintés de la couleur de l'app, daté. La carte porte un emplacement VIDE et caché
// (`components/AppWidget.tsx`, `data-constat`) : le serveur n'y écrit jamais rien, c'est le navigateur qui le remplit
// quand LIA s'est réellement rendue à la carte (`components/LiaBoot.tsx`). Pas de visite, pas de cadre : jamais un
// constat qui n'a pas eu lieu, jamais d'heure inventée. Le texte est celui que LIA vient de dire, tiré de l'état réel
// de la carte (`ditCarte`, `lib/liaParole.ts`).

import { FUSEAU } from "./fuseau";

/** « Dernière analyse · 22 h 41 », à l'heure du Québec (`FUSEAU`, jamais celle du navigateur). */
export function libelleDerniereAnalyse(instantMs: number): string {
  const parties = new Intl.DateTimeFormat("fr-CA", {
    timeZone: FUSEAU,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const heure = parties.find((p) => p.type === "hour")?.value ?? "";
  const minute = parties.find((p) => p.type === "minute")?.value ?? "";
  return `Dernière analyse · ${Number(heure)} h ${minute}`;
}

/** Ce que `poserConstat` touche sur l'emplacement : un texte et un drapeau, rien d'autre (jamais du HTML). */
interface Emplacement {
  hidden: boolean;
  querySelector(sel: string): { textContent: string | null } | null;
}

/**
 * Remplit l'emplacement du constat de `carte` et le montre. Rend `false` (et ne fait rien) si la carte n'en a pas
 * ou si la phrase est vide : un cadre vide ne s'affiche jamais. `textContent`, jamais `innerHTML` : la phrase vient
 * d'une app, c'est une donnée.
 */
export function poserConstat(carte: { querySelector(sel: string): unknown }, phrase: string, instantMs: number): boolean {
  const texte = phrase.trim();
  const emplacement = carte.querySelector("[data-constat]") as Emplacement | null;
  if (!emplacement || texte === "") return false;
  const titre = emplacement.querySelector("[data-constat-titre]");
  const corps = emplacement.querySelector("[data-constat-texte]");
  if (!titre || !corps) return false;
  titre.textContent = libelleDerniereAnalyse(instantMs);
  corps.textContent = texte;
  emplacement.hidden = false;
  return true;
}
