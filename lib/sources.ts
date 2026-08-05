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
  /** Occupe la grande tuile 2×2 de la grille. Exactement une source doit l'avoir. */
  hero: boolean;
}

interface SourceDef {
  id: string;
  name: string;
  defaultUrl: string;
  urlEnv: string;
  tokenEnv: string;
  hero?: boolean;
}

/**
 * Apps connues du hub. Ajouter une app = une entrée ici + sa variable de jeton.
 *
 * `hero` : quelle app occupe la grande tuile 2×2. C'est une DÉCISION, pas une déduction.
 * Auparavant le héros était élu à l'exécution (l'app publiant le plus de métriques), ce qui
 * rendait la mise en page dépendante des données — donc inconnue tant que TOUTES les apps
 * n'avaient pas répondu, et remaniée dès qu'une app hoquetait. En le déclarant, la grille
 * est connue avant le premier fetch : chaque carte peut arriver à son rythme dans un
 * emplacement déjà réservé, sans que rien ne saute (cf. le streaming dans `app/page.tsx`).
 */
const SOURCE_DEFS: readonly SourceDef[] = [
  {
    id: "financeai",
    name: "FinanceAI",
    defaultUrl: "https://finance.hubperso.com/hub/summary",
    urlEnv: "FINANCEAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_FINANCEAI",
    hero: true,
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
    defaultUrl: "https://batchchef-glu8-chi.vercel.app/api/hub/summary",
    urlEnv: "BATCHCHEF_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_BATCHCHEF",
  },
  {
    id: "jobai",
    name: "JobAI",
    defaultUrl: "https://emploi.hubperso.com/api/hub/summary",
    urlEnv: "JOBAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_JOBAI",
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
    hero: def.hero === true,
  }));
}
