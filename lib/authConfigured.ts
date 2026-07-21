// lib/authConfigured.ts
//
// Fail-closed : constat en préproduction — quand AUTH_SECRET manque, Auth.js loggue
// `MissingSecret` mais LAISSE PASSER la requête, et le hub servait ses données sans
// aucun login. Un hub privé ne doit jamais « échouer ouvert » : sans config d'auth
// complète, on ne sert RIEN de protégé. Fonction pure, injectable pour les tests.

type Env = Record<string, string | undefined>;

/** true seulement si la config d'auth minimale est présente (secret + allowlist). */
export function isAuthConfigured(env: Env = process.env): boolean {
  return Boolean(env.AUTH_SECRET?.trim() && env.AUTHORIZED_EMAIL?.trim());
}
