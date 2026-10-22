// lib/liaAsk.ts — le contrat « ask » de LIA, côté hub (pur : aucun réseau, aucune base).
//
// Contrat du 22/10/2026 (`commun/assistant/CONTRAT-ask-lia.md`, fil Assistant), trois sauts avec la
// MÊME forme : navigateur → app → hub → MemoryAI. Le hub est le seul détenteur des jetons : une app
// s'identifie par son `HUB_TOKEN`, l'accueil par la session ; MemoryAI ne fait confiance qu'au hub.
//
// Validation écrite à la main (comme `lib/gantt.ts`) : `zod` n'est pas une dépendance directe du
// hub. Tout ce qui sort de la forme est REFUSÉ — jamais réparé, jamais complété : LIA dit alors
// « indisponible » au lieu d'inventer.

export const QUESTION_MAX = 2000;
const PAGE_MAX = 200;
export const TEXTE_MAX = 8000;
export const PUCES_MAX = 6;
export const BLOCS_MAX = 20;
/** Corps d'une demande : au-delà, 413 (contrat). */
export const CORPS_MAX_OCTETS = 8 * 1024;
/** Délai du saut hub → MemoryAI (contrat : 20 s). */
export const DELAI_MEMORYAI_MS = 20_000;

/** Les douze humeurs de lia-ui (`HUMEURS_LIA`, contrat du fil Assistant). */
const HUMEURS = [
  "neutre", "joyeux", "calme", "curieux", "fatigue", "inquiet",
  "excite", "triste", "concentre", "espiegle", "fier", "timide",
] as const;
type Humeur = (typeof HUMEURS)[number];

export type DemandeAsk = { question: string; page?: string; proprietaire?: boolean };
type PuceAsk = { id: string; label: string };
export type ReponseAsk = { text: string; chips?: PuceAsk[]; mood?: Humeur; blocks?: unknown[] };

type Resultat<T> = { ok: true; valeur: T } | { ok: false; raison: string };

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** La demande d'une app ou de l'accueil : `{ question, page? }`. La question est rognée. */
export function validerDemande(corps: unknown): Resultat<DemandeAsk> {
  if (!estObjet(corps)) return { ok: false, raison: "Corps JSON attendu : { question, page? }." };
  if (typeof corps.question !== "string") return { ok: false, raison: "Champ `question` manquant." };
  const question = corps.question.trim();
  if (question.length < 1 || question.length > QUESTION_MAX) {
    return { ok: false, raison: `\`question\` : 1 à ${QUESTION_MAX} caractères.` };
  }
  const demande: DemandeAsk = { question };
  if (corps.page !== undefined) {
    if (typeof corps.page !== "string" || !corps.page.startsWith("/") || corps.page.length > PAGE_MAX) {
      return { ok: false, raison: `\`page\` : un chemin qui commence par « / », ${PAGE_MAX} caractères au plus.` };
    }
    demande.page = corps.page;
  }
  if (corps.proprietaire !== undefined) {
    // Dit par l'APP appelante (elle seule connaît la session) ; strictement booléen, jamais « truthy ».
    if (typeof corps.proprietaire !== "boolean") return { ok: false, raison: "`proprietaire` : un booléen." };
    demande.proprietaire = corps.proprietaire;
  }
  return { ok: true, valeur: demande };
}

/**
 * Ce que le hub envoie à MemoryAI : question, page, QUI parle et si c'est le PROPRIÉTAIRE. Les deux
 * derniers sont décidés par le hub (jeton ou session), jamais copiés tels quels du corps d'une app.
 * `proprietaire` est obligatoire côté MemoryAI (403 sans lui) : un invité n'atteint jamais la mémoire.
 */
export function corpsPourMemoryAi(demande: DemandeAsk, source: string, proprietaire: boolean): string {
  const { question, page } = demande;
  return JSON.stringify({ question, ...(page !== undefined && { page }), source, proprietaire });
}

/** La réponse de MemoryAI, validée. Clés inconnues retirées, rien n'est complété. */
export function validerReponse(json: unknown): Resultat<ReponseAsk> {
  if (!estObjet(json)) return { ok: false, raison: "réponse non objet" };
  const { text, chips, mood, blocks } = json;
  if (typeof text !== "string" || text.length < 1 || text.length > TEXTE_MAX) {
    return { ok: false, raison: "`text` absent ou hors bornes" };
  }
  const reponse: ReponseAsk = { text };
  if (chips !== undefined) {
    if (!Array.isArray(chips) || chips.length > PUCES_MAX) return { ok: false, raison: "`chips` invalide" };
    const puces: PuceAsk[] = [];
    for (const c of chips) {
      if (!estObjet(c) || typeof c.id !== "string" || typeof c.label !== "string" || !c.id || !c.label) {
        return { ok: false, raison: "puce invalide" };
      }
      puces.push({ id: c.id, label: c.label });
    }
    reponse.chips = puces;
  }
  if (mood !== undefined) {
    if (typeof mood !== "string" || !(HUMEURS as readonly string[]).includes(mood)) {
      return { ok: false, raison: "`mood` inconnue" };
    }
    reponse.mood = mood as Humeur;
  }
  if (blocks !== undefined) {
    if (!Array.isArray(blocks) || blocks.length > BLOCS_MAX) return { ok: false, raison: "`blocks` invalide" };
    reponse.blocks = blocks;
  }
  return { ok: true, valeur: reponse };
}
