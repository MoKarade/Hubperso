// lib/sources.ts
//
// Déclaration des apps que le hub interroge. Les URLs sont publiques (overridables
// par env tant qu'une app n'est pas sur son domaine final) ; les jetons x-hub-token
// sont des SECRETS et ne viennent QUE des variables d'environnement — jamais en dur.
// Une app sans jeton configuré n'est pas interrogée (widget « non configurée »).

export interface HubSource {
  /** Identifiant stable, kebab-case (doit matcher l'app.id publié par l'app). */
  id: string;
  /** Nom affiché tant qu'aucun summary n'est disponible (sinon on prend app.name). */
  name: string;
  /** Endpoint GET .../hub/summary. */
  summaryUrl: string;
  /** Jeton x-hub-token, ou null si non configuré. */
  token: string | null;
}

interface SourceDef {
  id: string;
  name: string;
  defaultUrl: string;
  urlEnv: string;
  tokenEnv: string;
}

/** Apps connues du hub. Ajouter une app = une entrée ici + sa variable de jeton. */
const SOURCE_DEFS: readonly SourceDef[] = [
  {
    id: "financeai",
    name: "FinanceAI",
    defaultUrl: "https://finance.hubperso.com/hub/summary",
    urlEnv: "FINANCEAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_FINANCEAI",
  },
  {
    id: "driveai",
    name: "DriveAI",
    defaultUrl: "https://drive.hubperso.com/hub/summary",
    urlEnv: "DRIVEAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_DRIVEAI",
  },
  {
    id: "batchchef",
    name: "BatchChef",
    defaultUrl: "https://batchchef.hubperso.com/hub/summary",
    urlEnv: "BATCHCHEF_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_BATCHCHEF",
  },
];

type Env = Record<string, string | undefined>;

/** Résout la config des sources depuis l'environnement (injectable pour les tests). */
export function getSources(env: Env = process.env): HubSource[] {
  return SOURCE_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    summaryUrl: env[def.urlEnv]?.trim() || def.defaultUrl,
    token: env[def.tokenEnv]?.trim() || null,
  }));
}
