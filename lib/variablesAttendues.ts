// lib/variablesAttendues.ts — les variables d'environnement que le hub attend (F7).
//
// ── POURQUOI CE MODULE EXISTE ────────────────────────────────────────────────────────
// Prévention d'INC-16 : une production qui répond 503 parce qu'une variable manque sur
// Vercel, et RIEN qui le dise avant que Marc aille chercher lui-même. Ce module est la
// liste unique des NOMS attendus (jamais une valeur) et le contrôle de présence associé.
//
// ── CE QU'IL NE FAIT JAMAIS ──────────────────────────────────────────────────────────
// Il ne lit une valeur que pour décider « posée / pas posée » (`estPresente`), et ne la
// rend, ne la journalise ni ne la compare jamais. Ce qui en sort : des booléens et des noms.
// Et même les noms ne sortent PAS dans une réponse HTTP publique : `/api/sante` ne rend
// qu'une cause générique, les noms partent au journal serveur (voir sa route). Nommer
// publiquement une variable absente donnerait la carte de ce qu'il faut deviner.
//
// ── REQUISE OU OPTIONNELLE : CLASSÉE SUR LE CODE, PAS AU JUGÉ ─────────────────────────
// « Requise » = son absence casse une fonction CŒUR (connexion, base, accès). Le reste
// dégrade honnêtement une seule fonctionnalité — c'est dit dans `siAbsente`.
//
// Les deux variables par app (jeton + URL) sont DÉRIVÉES de `SOURCE_DEFS` : ajouter une
// app au hub les ajoute ici sans y penser, et `tests/variablesAttendues.test.ts` vérifie en
// plus que chaque variable lue via `process.env` par le code figure dans la liste.
//
// ⚠️ `HUB_SESSION_PRIVATE_JWK` n'y est PAS : elle appartient à la phase 2 de la session
// asymétrique, pas encore fusionnée. Elle entrera avec la branche qui la lit.

import { SOURCE_DEFS } from "./sources";

type Env = Record<string, string | undefined>;

export type Exigence = "requise" | "optionnelle";

export interface VariableAttendue {
  readonly nom: string;
  readonly exigence: Exigence;
  /** Ce que Marc observe quand elle manque — pour savoir où regarder, pas quoi y mettre. */
  readonly siAbsente: string;
}

const FIXES: readonly VariableAttendue[] = [
  {
    nom: "AUTH_SECRET",
    exigence: "requise",
    siAbsente: "le middleware refuse tout (503 auth_unconfigured) : hub fermé",
  },
  {
    nom: "AUTHORIZED_EMAIL",
    exigence: "requise",
    siAbsente: "le middleware refuse tout (503 auth_unconfigured) : aucun propriétaire",
  },
  {
    nom: "GOOGLE_CLIENT_ID",
    exigence: "requise",
    siAbsente: "connexion Google impossible : personne ne peut entrer",
  },
  {
    nom: "GOOGLE_CLIENT_SECRET",
    exigence: "requise",
    siAbsente: "connexion Google impossible : personne ne peut entrer",
  },
  {
    nom: "DATABASE_URL",
    exigence: "requise",
    siAbsente:
      "/api/sante répond 503 (base) ; seul le propriétaire entre, sans invités ni historique",
  },
  {
    nom: "CRON_SECRET",
    exigence: "optionnelle",
    siAbsente: "horloge désactivée : /api/cron/releve répond 503, aucun relevé écrit",
  },
  {
    nom: "AUTH_COOKIE_DOMAIN",
    exigence: "optionnelle",
    siAbsente: "session limitée à hubperso.com, non partagée avec les sous-domaines des apps",
  },
];

const PAR_APP: readonly VariableAttendue[] = SOURCE_DEFS.flatMap((def) => [
  {
    nom: def.tokenEnv,
    exigence: "optionnelle" as const,
    siAbsente: `widget ${def.name} « non configuré » (aucun jeton x-hub-token)`,
  },
  {
    nom: def.urlEnv,
    exigence: "optionnelle" as const,
    siAbsente: def.defaultSummaryUrl
      ? `widget ${def.name} sur son URL de résumé par défaut`
      : `widget ${def.name} « non configuré » (aucune URL de résumé par défaut)`,
  },
]);

/** La liste complète, dans un ordre stable : fixes d'abord, puis deux par app. */
export const VARIABLES_ATTENDUES: readonly VariableAttendue[] = Object.freeze([
  ...FIXES,
  ...PAR_APP,
]);

/**
 * La SEULE définition de « posée » du dépôt : présente et non blanche après `trim`.
 * Partagée avec `isAuthConfigured` (lib/authConfigured.ts) pour qu'un espace seul ne
 * compte jamais comme une configuration à un endroit et pas à l'autre.
 */
export function estPresente(env: Env, nom: string): boolean {
  return Boolean(env[nom]?.trim());
}

/** Un booléen par nom attendu. Jamais une valeur, et aucun nom hors de la liste. */
export function presenceVariables(env: Env = process.env): Readonly<Record<string, boolean>> {
  return Object.freeze(
    Object.fromEntries(VARIABLES_ATTENDUES.map((v) => [v.nom, estPresente(env, v.nom)])),
  );
}

/** Les NOMS des variables requises absentes — pour le journal serveur, jamais une réponse publique. */
export function requisesManquantes(env: Env = process.env): string[] {
  return VARIABLES_ATTENDUES.filter(
    (v) => v.exigence === "requise" && !estPresente(env, v.nom),
  ).map((v) => v.nom);
}
