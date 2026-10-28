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
// ── ROTATION D'UN SECRET : UN BUILD NEUF EST REQUIS ───────────────────────────────────
// Les variables Vercel sont figées PAR DÉPLOIEMENT (Hubperso#389) : poser un nouveau jeton
// (`GITHUB_GRAPHES_TOKEN`, `HUB_TOKEN_<APP>`, `GOOGLE_CLIENT_SECRET`…) ne change rien tant
// qu'un push de code sur `main` n'a pas construit un déploiement qui le contient. Jamais
// « Redeploy » ni de commit vide. Un jeton posé APRÈS le démarrage d'un build n'y est pas.
// Rechargés ainsi le 23/10/2026 (Hubperso#392) : GITHUB_GRAPHES_TOKEN, HUB_TOKEN_BATCHCHEF, HUB_TOKEN_CARAI, HUB_TOKEN_DRIVEAI, HUB_TOKEN_FINANCEAI, GANTT_SECRET.
// Rechargés ainsi le 24/10/2026 (Hubperso#488) : SENTRY_DSN (jeton Sentry révoqué, vrai DSN du hub et de JobAI), HUB_TOKEN_JOBAI.
//
// `HUB_SESSION_PRIVATE_JWK` (phase 2 de la session asymétrique, lib/sessionSignee.ts) est
// optionnelle : absente, le hub n'émet pas le cookie signé et rien d'autre ne change.

import { SOURCE_DEFS } from "./sources";

type Env = Record<string, string | undefined>;

type Exigence = "requise" | "optionnelle";

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
    nom: "GANTT_SECRET",
    exigence: "optionnelle",
    siAbsente: "réception du Gantt désactivée : /api/gantt répond 503, l'onglet Chantier Apps n'a rien à montrer",
  },
  {
    nom: "CHANTIER_WEBHOOK_SECRET",
    exigence: "optionnelle",
    siAbsente: "réception des événements GitHub désactivée : /api/chantier/evenement répond 503, la page Chantier ne lit que le relevé du PC",
  },
  {
    nom: "CHANTIER_GITHUB_TOKEN",
    exigence: "optionnelle",
    siAbsente: "rattrapage GitHub non branché : /api/chantier/rattrapage répond 503, la page Chantier garde l'âge du relevé du PC entre le relevé et les premiers événements (jeton en lecture seule : Issues, Pull requests, Metadata, les dépôts du projet)",
  },
  {
    nom: "MEMORYAI_SORTIES_TOKEN",
    exigence: "optionnelle",
    siAbsente: "le hub ne pousse pas l'état du chantier à MemoryAI : LIA ne lit que les faits envoyés avec le clic droit (jeton d'écrivain de la porte POST /api/sorties, variable serveur, lue au build)",
  },
  {
    nom: "BILANS_DRIVE_FOLDER_ID",
    exigence: "optionnelle",
    siAbsente: "le dossier Drive « Bilans » par défaut (lib/bilansGarde.ts) ; la variable le remplace, par exemple pour un autre dossier",
  },
  {
    nom: "AUTH_COOKIE_DOMAIN",
    exigence: "optionnelle",
    siAbsente: "session limitée à hubperso.com, non partagée avec les sous-domaines des apps",
  },
  {
    nom: "HUB_SESSION_PRIVATE_JWK",
    exigence: "optionnelle",
    siAbsente: "le hub n'émet pas le cookie de session signé (__Secure-hub.session) ; la connexion actuelle n'est pas touchée",
  },
  {
    nom: "HUB_SESSION_PUBLIC_KEYS",
    exigence: "optionnelle",
    siAbsente: "la route de contrôle /api/session/signee répond « non-configure » (clés publiques de la session signée, JWKS)",
  },
  {
    nom: "SENTRY_DSN",
    exigence: "optionnelle",
    siAbsente: "suivi des erreurs éteint : aucune erreur n'est envoyée à Sentry (variable serveur, lue à l'exécution)",
  },
  {
    nom: "GITHUB_GRAPHES_TOKEN",
    exigence: "optionnelle",
    siAbsente: "page /graphes « non branchée » : aucun graphe de code lu (jeton GitHub en lecture seule, variable serveur)",
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
