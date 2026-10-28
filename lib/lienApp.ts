// lib/lienApp.ts — un lien du hub vers une APP du parc s'ouvre en place, pas dans un onglet.
//
// Sur Android, une PWA installée se déclare gestionnaire des URL de son `scope` (WebAPK), mais Chrome ne
// peut lui passer la main que sur une navigation de PREMIER NIVEAU : `target="_blank"` crée un onglet de
// navigateur et court-circuite la bascule (`tests/pwaLiens.test.ts`, [PWA-ANDROID]). Les liens venus du
// contrat (alertes, actions, recommandations) peuvent pointer n'importe où : seuls ceux qui visent une app
// du parc (`<nom>.hubperso.com`) perdent le `_blank` ; tout le reste (GitHub, un site tiers) garde l'onglet,
// pour ne pas quitter le hub à chaque clic.
//
// CE QUE ÇA NE PROUVE PAS : que Chrome bascule vers l'app. C'est la condition nécessaire, côté hub ; la
// bascule elle-même se lit sur le téléphone de Marc.

import { safeHttpUrl } from "./url";

const DOMAINE = "hubperso.com";

/** Hôtes du parc qui ne sont PAS une app installable (le hub lui-même, sous ses deux noms). */
const HOTES_HUB = new Set([DOMAINE, `www.${DOMAINE}`]);

/** Vrai quand l'URL vise une app du parc : `https://<nom>.hubperso.com/…`, hors le hub. */
export function viseUneApp(raw: string | null | undefined): boolean {
  const sure = safeHttpUrl(raw);
  if (!sure) return false;
  const { protocol, hostname } = new URL(sure);
  return protocol === "https:" && hostname.endsWith(`.${DOMAINE}`) && !HOTES_HUB.has(hostname);
}

/** Les attributs `target` et `rel` d'un lien du contrat : en place vers une app du parc, nouvel onglet sinon. */
export function attributsLien(raw: string | null | undefined): { target?: "_blank"; rel: string } {
  return viseUneApp(raw) ? { rel: "noopener" } : { target: "_blank", rel: "noreferrer noopener" };
}
