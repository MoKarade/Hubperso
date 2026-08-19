// lib/authorized.ts
//
// Comparaison d'UNE adresse à UNE autre, en lower-case + trim. Fonction pure, sans
// dépendance à l'environnement, pour être testable directement.
//
// ⚠️ CE N'EST PLUS « le filtre d'accès du hub » (ADR 0001, 14/08). Son unique appelant est
// désormais `estProprietaire` (lib/personnes.ts) : elle répond à « est-ce le PROPRIÉTAIRE ? »,
// pas à « cette personne a-t-elle le droit d'entrer ? ». Les autres personnes vivent dans la
// base et se gèrent depuis /administration. Le nom du fichier et de la fonction est resté
// pour ne pas toucher au code au passage — c'est ce commentaire qui dit ce qu'il fait.

/**
 * Retourne true seulement si `email` correspond à `authorized`, comparés en
 * lower-case + trim. Toute valeur absente/vide côté candidat OU côté autorisé →
 * refus : sans `AUTHORIZED_EMAIL` configuré, `"" === ""` laisserait entrer n'importe qui.
 */
export function isAuthorizedEmail(
  email: string | null | undefined,
  authorized: string | null | undefined,
): boolean {
  const normalize = (value: string | null | undefined): string =>
    (value ?? "").trim().toLowerCase();

  const candidate = normalize(email);
  const allowed = normalize(authorized);

  if (!candidate || !allowed) return false;
  return candidate === allowed;
}
