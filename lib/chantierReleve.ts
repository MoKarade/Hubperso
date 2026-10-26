// lib/chantierReleve.ts — ce que la page Chantier relit du dernier relevé, et à quelle condition
// elle n'a RIEN à retélécharger. PUR : aucune I/O.
//
// ── POURQUOI UN ETAG ─────────────────────────────────────────────────────────────────
//
// Le PC envoie un relevé toutes les 10 minutes ; la page le relit chaque minute. Sans validateur,
// 9 lectures sur 10 retélécharger ~430 Ko identiques et relire la ligne entière en base (quota de
// transfert Neon, invocations Vercel). L'ETag est l'heure de RÉCEPTION du hub (`recuLe`, réécrite
// à chaque envoi) : elle change si et seulement si un nouveau relevé est rangé.
//
// ⚠️ La réponse porte `Cache-Control: no-store` (contenu privé), donc le navigateur ne garde pas
// le corps et ne revalide pas seul : c'est la PAGE qui renvoie `If-None-Match` à la main.

/** L'ETag d'un relevé : l'instant de réception en millisecondes, entre guillemets (forme forte). */
export function etagDuReleve(recuLe: Date): string {
  return `"${recuLe.getTime()}"`;
}

/**
 * `If-None-Match` désigne-t-il cet ETag ? Accepte `*`, une liste séparée par des virgules et le
 * préfixe faible `W/` (une comparaison faible suffit pour un GET, RFC 9110 § 13.1.2).
 */
export function etagCorrespond(siNoneMatch: string | null, etag: string): boolean {
  if (!siNoneMatch) return false;
  const demande = siNoneMatch.trim();
  if (demande === "*") return true;
  return demande
    .split(",")
    .map((e) => e.trim().replace(/^W\//, ""))
    .includes(etag);
}

/**
 * Le gzip stocké (base64) en octets, ou `null` si ce n'en est pas un. La base ne garde qu'un
 * envoi déjà validé (`lib/gantt.ts`), mais un octet qui ne commence pas par `1f 8b` annoncé
 * `Content-Encoding: gzip` ferait échouer la page SANS message : on préfère refuser ici.
 */
export function octetsGzip(donneesGzB64: string): Buffer | null {
  const octets = Buffer.from(donneesGzB64, "base64");
  if (octets.length < 18 || octets[0] !== 0x1f || octets[1] !== 0x8b) return null;
  return octets;
}
