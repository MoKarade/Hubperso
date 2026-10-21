// lib/grapheHtml.ts — préparer le `graph.html` d'un dépôt avant de le servir.
//
// `graph.html` charge `vis-network` depuis unpkg. Le hub ne laisse AUCUN script tiers se charger
// (CSP `script-src 'self'`) : on remplace cette balise par la copie auto-hébergée
// (`public/vendor/vis-network-9.1.6.min.js`, même version, même empreinte — vérifiée par
// `tests/grapheHtml.test.ts`).
//
// ⚠️ PAS d'attribut `integrity` sur la balise réécrite : la page est servie en bac à sable (origine
// opaque), donc le script du hub y est « cross-origin » et SRI exigerait un en-tête CORS. Le
// garant est le test d'empreinte de la copie locale, pas le navigateur.
//
// ⚠️ UNE VERSION INCONNUE EST REFUSÉE, PAS LAISSÉE PASSER. Si l'outil de graphe change de version
// de `vis-network`, le test de la copie locale ne couvre plus ce fichier : on le dit
// (`version inattendue`) plutôt que de charger un script qu'on n'a pas relu.

export const VIS_VERSION = "9.1.6";
export const VIS_LOCAL = `/vendor/vis-network-${VIS_VERSION}.min.js`;
/** Empreinte SRI de la copie locale ET de la balise d'origine (contrôlée par les tests). */
export const VIS_SRI = "sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1";

const BALISE = /<script\b[^>]*\bsrc="https:\/\/unpkg\.com\/vis-network@([^/"]+)\/standalone\/umd\/vis-network\.min\.js"[^>]*><\/script>/i;

export type ResultatHtml = { ok: true; html: string } | { ok: false; detail: string };

export function preparerHtml(html: string): ResultatHtml {
  const m = BALISE.exec(html);
  if (!m) return { ok: false, detail: "graph.html ne charge pas vis-network comme attendu" };
  if (m[1] !== VIS_VERSION) {
    return { ok: false, detail: `version inattendue de vis-network (${m[1]}, attendue ${VIS_VERSION})` };
  }
  // Après le remplacement, plus aucune référence à un hôte tiers ne doit rester dans un `src`.
  const html2 = html.replace(
    BALISE,
    `<script src="${VIS_LOCAL}"></script>`,
  );
  if (/\b(src|href)="https?:\/\//i.test(html2)) {
    return { ok: false, detail: "graph.html référence encore une ressource externe" };
  }
  return { ok: true, html: html2 };
}
