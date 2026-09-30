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
   * fetch. Séparée de `summaryUrl` le 21/09/2026 — voir le commentaire de `DeclarationApp`.
   */
  accueilUrl: string;
  /** Jeton x-hub-token, ou null si non configuré. */
  token: string | null;
  /** Occupe la grande tuile 2×2 de la grille. Exactement une source doit l'avoir. */
  hero: boolean;
}

/**
 * ⚠️ `accueil` et `resume` sont DEUX choses, et les avoir confondues a coûté un après-midi le
 * 21/09/2026.
 *
 * Un seul champ `defaultUrl` servait aux deux : l'endpoint du contrat ET (par son origine)
 * l'adresse de l'app pour la palette. Vrai pour cinq apps sur six — une app Next.js sert sa
 * page ET son `/hub/summary` sur le même domaine. FAUX pour FinanceAI, dont le résumé vient
 * d'un serveur MCP auto-hébergé : le champ unique ne pouvait pas dire les deux, donc il
 * disait le mauvais, et le hub recevait une PAGE WEB là où il attendait un résumé JSON.
 *
 * Les deux champs restent donc séparés même quand ils coïncident
 * (`AVANT-D-UNIFIER-N-COPIES-SEPARER-CE-QUI-EST-PARTAGE-DE-CE-QUI-NE-L-EST-PAS`), et
 * `accueil` reste ÉCRIT, jamais dérivé de `resume` (leçon n° 10).
 */
interface DeclarationApp {
  readonly name: string;
  /** L'endpoint du contrat par défaut, ou `null` si aucun n'est connu. */
  readonly resume: string | null;
  /** L'adresse HUMAINE de l'app : une origine https, sans chemin. */
  readonly accueil: string;
  readonly hero?: true;
}

/**
 * LA table des apps connues du hub : UNE ligne, donc UN objet, par app.
 *
 * ── POURQUOI UNE LIGNE PAR APP (30/09/2026) ──────────────────────────────────────────
 * Avant, deux tables PARALLÈLES : `SOURCE_DEFS` (six champs par app, sur plusieurs lignes)
 * et `ACCUEIL_PAR_ID` (l'adresse d'accueil, sortie à part le 21/09 parce que le détecteur de
 * duplication de SonarCloud comptait les entrées multi-lignes comme du copier-coller — voir
 * la leçon n° 11 de `docs/reference-claude.md`). Deux listes pour une même app, c'est le
 * risque qu'elles DIVERGENT (§11). Elles sont fusionnées ici, et la forme « une ligne par
 * app » est celle qui avait passé le détecteur : aucune entrée ne forme de bloc répété.
 *
 * Les noms de variables d'environnement ne sont plus recopiés : ils se DÉDUISENT de l'id
 * (`<ID>_SUMMARY_URL`, `HUB_TOKEN_<ID>`), la convention que les six apps suivaient déjà.
 * `tests/sources.test.ts` fige la liste exacte des douze noms.
 *
 * Ajouter une app = une ligne ici + sa variable de jeton sur Vercel. Une nouvelle propriété
 * par app (couleur…) va DANS cette table, jamais dans une seconde : le test « aucune seconde
 * table par app » le refuse.
 *
 * `hero` : quelle app occupe la grande tuile 2×2. C'est une DÉCISION, pas une déduction :
 * déclarée, la grille est connue avant le premier fetch (cf. le streaming dans `app/page.tsx`).
 *
 * ⚠️ FinanceAI : `resume: null`, et ce n'est pas un oubli. Ses données financières ne
 * quittent pas la machine de Marc : le résumé se calcule dans un serveur MCP auto-hébergé
 * (Cloud Run), à une adresse qui change à chaque service et n'est pas devinable depuis ce
 * dépôt. Jusqu'au 21/09/2026 ce champ valait l'URL du SITE, qui répond 200 en HTML : le hub
 * affichait « réponse non conforme au contrat », un diagnostic qui accusait l'app. Un défaut
 * plausible-mais-faux est pire qu'une absence (`no fake data` appliqué à une configuration).
 *
 * ⚠️ MemoryAI (ADR 0001 de MemoryAI, 15/09/2026) : route `/hub/summary` sans `/api`, comme
 * CarAI, et app SANS invités — elle n'appelle jamais `POST /api/acces`, donc l'accorder à
 * quelqu'un dans /administration n'ouvre rien chez elle.
 */
const APPS = {
  financeai: { name: "FinanceAI", resume: null, accueil: "https://finance.hubperso.com", hero: true },
  driveai: { name: "DriveAI", resume: "https://drive.hubperso.com/hub/summary", accueil: "https://drive.hubperso.com" },
  batchchef: { name: "BatchChef", resume: "https://batchchef.hubperso.com/api/hub/summary", accueil: "https://batchchef.hubperso.com" },
  carai: { name: "CarAI", resume: "https://carai.hubperso.com/hub/summary", accueil: "https://carai.hubperso.com" },
  jobai: { name: "JobAI", resume: "https://emploi.hubperso.com/api/hub/summary", accueil: "https://emploi.hubperso.com" },
  memoryai: { name: "MemoryAI", resume: "https://memoryai.hubperso.com/hub/summary", accueil: "https://memoryai.hubperso.com" },
} as const satisfies Record<string, DeclarationApp>;

/** L'identifiant d'une app EST une clé de `APPS` : une app sans déclaration ne compile pas. */
type AppId = keyof typeof APPS;

/** Une app déclarée, sous la forme qu'en lisent le reste du hub et les tests. */
interface SourceDef {
  id: AppId;
  name: string;
  defaultSummaryUrl: string | null;
  accueilUrl: string;
  urlEnv: string;
  tokenEnv: string;
  hero: boolean;
}

/** `batchchef` → `BATCHCHEF` ; un tiret d'un futur id kebab-case devient `_`. */
function prefixeEnv(id: string): string {
  return id.toUpperCase().replace(/-/g, "_");
}

// Exporté pour que `tests/envExample.test.ts` vérifie que `.env.example` documente bien
// chaque variable déclarée ici — l'oubli de `HUB_TOKEN_CARAI` avait échappé à tout le
// monde parce que le code marchait et que seul le fichier d'exemple mentait.
export const SOURCE_DEFS: readonly SourceDef[] = (Object.keys(APPS) as AppId[]).map((id) => {
  const app: DeclarationApp = APPS[id];
  return {
    id,
    name: app.name,
    defaultSummaryUrl: app.resume,
    accueilUrl: app.accueil,
    urlEnv: `${prefixeEnv(id)}_SUMMARY_URL`,
    tokenEnv: `HUB_TOKEN_${prefixeEnv(id)}`,
    hero: app.hero === true,
  };
});

type Env = Record<string, string | undefined>;

/** Résout la config des sources depuis l'environnement (injectable pour les tests). */
export function getSources(env: Env = process.env): HubSource[] {
  return SOURCE_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    summaryUrl: env[def.urlEnv]?.trim() || def.defaultSummaryUrl,
    accueilUrl: def.accueilUrl,
    token: env[def.tokenEnv]?.trim() || null,
    hero: def.hero,
  }));
}
