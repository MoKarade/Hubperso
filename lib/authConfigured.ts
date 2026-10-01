// lib/authConfigured.ts
//
// Fail-closed : constat en préproduction — quand AUTH_SECRET manque, Auth.js loggue
// `MissingSecret` mais LAISSE PASSER la requête, et le hub servait ses données sans
// aucun login. Un hub privé ne doit jamais « échouer ouvert » : sans config d'auth
// complète, on ne sert RIEN de protégé. Fonction pure, injectable pour les tests.
//
// « Présente » a UNE définition dans le dépôt (`estPresente`, lib/variablesAttendues.ts) :
// la liste des variables attendues et ce garde disent toujours la même chose.

import { estPresente } from "./variablesAttendues";

type Env = Record<string, string | undefined>;

/** true seulement si la config d'auth minimale est présente (secret + allowlist). */
export function isAuthConfigured(env: Env = process.env): boolean {
  return estPresente(env, "AUTH_SECRET") && estPresente(env, "AUTHORIZED_EMAIL");
}
