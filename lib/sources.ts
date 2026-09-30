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
  /**
   * Endpoint `GET .../hub/summary`, ou **`null`** quand aucune URL n'est connue.
   *
   * ⚠️ `null` n'est pas un oubli : c'est le seul état honnête pour une app dont le résumé
   * n'est PAS servi par son site web (FinanceAI, cf. plus bas). Une source sans URL n'est
   * jamais interrogée — `fetchSummary` rend `unconfigured` sans toucher au réseau.
   */
  summaryUrl: string | null;
  /**
   * L'adresse HUMAINE de l'app (la page qu'on ouvre dans un navigateur). TOUJOURS connue,
   * même quand `summaryUrl` ne l'est pas : la palette de commandes s'en sert AVANT tout
   * fetch. Séparée de `summaryUrl` le 21/09/2026 — voir le commentaire de `SourceDef`.
   */
  accueilUrl: string;
  /** Jeton x-hub-token, ou null si non configuré. */
  token: string | null;
  /** Occupe la grande tuile 2×2 de la grille. Exactement une source doit l'avoir. */
  hero: boolean;
}

/**
 * ⚠️ `accueilUrl` et `defaultSummaryUrl` sont DEUX choses, et les avoir confondues a coûté
 * un après-midi le 21/09/2026.
 *
 * Un seul champ `defaultUrl` servait aux deux : l'endpoint du contrat ET (par son origine)
 * l'adresse de l'app pour la palette. Vrai pour cinq apps sur six — une app Next.js sert sa
 * page ET son `/hub/summary` sur le même domaine. FAUX pour FinanceAI, dont le résumé vient
 * d'un serveur MCP auto-hébergé : le champ unique ne pouvait pas dire les deux, donc il
 * disait le mauvais, et le hub recevait une PAGE WEB là où il attendait un résumé JSON.
 *
 * Les deux champs restent donc séparés même quand ils coïncident
 * (`AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`).
 */
interface SourceDef {
  /** ⚠️ `AppId`, pas `string` : l'app doit figurer dans `ACCUEIL_PAR_ID` (voir plus bas). */
  id: AppId;
  name: string;
  /** L'endpoint du contrat par défaut, ou `null` si aucun n'est connu. */
  defaultSummaryUrl: string | null;
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
// Exporté pour que `tests/envExample.test.ts` vérifie que `.env.example` documente bien
// chaque variable déclarée ici — l'oubli de `HUB_TOKEN_CARAI` avait échappé à tout le
// monde parce que le code marchait et que seul le fichier d'exemple mentait.
export const SOURCE_DEFS: readonly SourceDef[] = [
  {
    // ⚠️ La SEULE app sans URL de résumé par défaut, et ce n'est pas un oubli.
    //
    // FinanceAI ne publie PAS son résumé depuis son site : les données financières ne
    // quittent pas la machine de Marc, donc le résumé se calcule là où elles sont — dans un
    // serveur MCP auto-hébergé (Cloud Run), à une adresse qui n'a rien à voir avec
    // `finance.hubperso.com` et qui n'est pas devinable depuis ce dépôt.
    //
    // Jusqu'au 21/09/2026 ce champ valait `https://finance.hubperso.com/hub/summary` — le
    // site web. Mesuré ce jour-là : cette URL répond **200 avec `<!DOCTYPE html>`**, donc le
    // hub recevait la page de l'app à la place du résumé, et affichait « réponse non conforme
    // au contrat » : un diagnostic qui ACCUSE l'app et envoie corriger le mauvais dépôt.
    // (Aucune fuite : c'est du HTML public, pas un résumé non authentifié.)
    //
    // `null` plutôt qu'une adresse Cloud Run écrite en dur : elle change à chaque service, et
    // un défaut plausible-mais-faux est pire qu'une absence (`no fake data` appliqué à une
    // configuration). Sans `FINANCEAI_SUMMARY_URL`, la carte dit « URL non configurée » et
    // le hub ne part PAS sur le réseau.
    id: "financeai",
    name: "FinanceAI",
    defaultSummaryUrl: null,
    urlEnv: "FINANCEAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_FINANCEAI",
    hero: true,
  },
  {
    id: "driveai",
    name: "DriveAI",
    defaultSummaryUrl: "https://drive.hubperso.com/hub/summary",
    urlEnv: "DRIVEAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_DRIVEAI",
  },
  {
    id: "batchchef",
    name: "BatchChef",
    defaultSummaryUrl: "https://batchchef.hubperso.com/api/hub/summary",
    urlEnv: "BATCHCHEF_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_BATCHCHEF",
  },
  {
    id: "carai",
    name: "CarAI",
    defaultSummaryUrl: "https://carai.hubperso.com/hub/summary",
    urlEnv: "CARAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_CARAI",
  },
  {
    id: "jobai",
    name: "JobAI",
    defaultSummaryUrl: "https://emploi.hubperso.com/api/hub/summary",
    urlEnv: "JOBAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_JOBAI",
  },
  {
    // La mémoire (ADR 0001 de MemoryAI, 15/09/2026). Route `/hub/summary` sans `/api`, comme
    // CarAI. ⚠️ MemoryAI est une app SANS invités : elle n'appelle jamais `POST /api/acces`,
    // donc l'accorder à quelqu'un dans /administration n'ouvre rien chez elle.
    id: "memoryai",
    name: "MemoryAI",
    defaultSummaryUrl: "https://memoryai.hubperso.com/hub/summary",
    urlEnv: "MEMORYAI_SUMMARY_URL",
    tokenEnv: "HUB_TOKEN_MEMORYAI",
  },
];

/**
 * L'adresse HUMAINE de chaque app — la page qu'on ouvre dans un navigateur.
 *
 * ⚠️ POURQUOI UNE TABLE À PART, et pas un champ de `SourceDef` : le détecteur de copier-coller
 * de la CI comptait les six entrées de `SOURCE_DEFS` comme de la duplication dès qu'elles
 * passaient à sept champs (mesuré le 21/09/2026 : 10 des 12 lignes neuves incriminées étaient
 * ces paires). La forme ci-dessous dit la même chose en une ligne par app. **C'est une
 * contrainte d'outil qui a choisi la forme, pas une amélioration** — et ça se dit.
 *
 * ⚠️ Ce qu'une liste PARALLÈLE risque, c'est de DIVERGER (§11 : une app absente de la page
 * d'administration serait une app dont personne ne peut recevoir l'accès). D'où la garde de
 * `tests/sources.test.ts` : les deux jeux de clés doivent coïncider EXACTEMENT, dans les deux
 * sens. Une app ajoutée à l'une sans l'autre fait rougir la CI, elle ne se découvre pas à
 * l'écran.
 *
 * ⚠️ Et elle reste ÉCRITE, jamais dérivée de `defaultSummaryUrl` : c'est précisément le
 * couplage que la leçon n° 10 a supprimé. FinanceAI le prouve — son résumé ne vient pas de son
 * site, donc aucune déduction n'est possible.
 */
export const ACCUEIL_PAR_ID = {
  financeai: "https://finance.hubperso.com",
  driveai: "https://drive.hubperso.com",
  batchchef: "https://batchchef.hubperso.com",
  carai: "https://carai.hubperso.com",
  jobai: "https://emploi.hubperso.com",
  memoryai: "https://memoryai.hubperso.com",
} as const;

/**
 * L'identifiant d'une app EST une clé de la table ci-dessus.
 *
 * ⚠️ C'est ce qui rend le trou IMPOSSIBLE plutôt que testé : une app déclarée dans
 * `SOURCE_DEFS` sans adresse d'accueil ne compile pas. Sans ça il faudrait un repli à la
 * lecture — et le seul repli disponible (chaîne vide) serait un lien MORT, c'est-à-dire la
 * valeur crédible-mais-fausse que ce dépôt refuse partout ailleurs.
 * Le sens inverse (une clé de la table sans entrée dans `SOURCE_DEFS`) ne se voit pas au
 * compilateur : c'est `tests/sources.test.ts` qui le garde.
 */
type AppId = keyof typeof ACCUEIL_PAR_ID;

type Env = Record<string, string | undefined>;

/** Résout la config des sources depuis l'environnement (injectable pour les tests). */
export function getSources(env: Env = process.env): HubSource[] {
  return SOURCE_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    summaryUrl: env[def.urlEnv]?.trim() || def.defaultSummaryUrl,
    accueilUrl: ACCUEIL_PAR_ID[def.id],
    token: env[def.tokenEnv]?.trim() || null,
    hero: def.hero === true,
  }));
}
