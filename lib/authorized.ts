// lib/authorized.ts
//
// Filtre d'accès du hub : UNE SEULE adresse est admise. La valeur autorisée vient de
// la variable d'env AUTHORIZED_EMAIL (jamais en dur) — voir README / .env.example.
// Fonction pure, sans dépendance à l'environnement, pour être testable directement.

/**
 * Retourne true seulement si `email` correspond à `authorized`, comparés en
 * lower-case + trim. Toute valeur absente/vide côté candidat OU côté autorisé →
 * refus (on ne laisse jamais passer si l'allowlist n'est pas configurée).
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
