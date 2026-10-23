// lib/liaAsk.ts — le contrat « ask » de LIA, côté hub (pur : aucun réseau, aucune base).
//
// Contrat du 22/10/2026 (`commun/assistant/CONTRAT-ask-lia.md`, fil Assistant), trois sauts avec la
// MÊME forme : navigateur → app → hub → MemoryAI. Le hub est le seul détenteur des jetons : une app
// s'identifie par son `HUB_TOKEN`, l'accueil par la session ; MemoryAI ne fait confiance qu'au hub.
//
// Validation écrite à la main (comme `lib/gantt.ts`) : `zod` n'est pas une dépendance directe du
// hub. Tout ce qui sort de la forme est REFUSÉ — jamais réparé, jamais complété : LIA dit alors
// « indisponible » au lieu d'inventer.

import { HUMEURS_DETAILLEES, SILHOUETTES_LIA } from "@mokarade/lia-ui";

export const QUESTION_MAX = 2000;
const PAGE_MAX = 200;
export const TEXTE_MAX = 8000;
export const PUCES_MAX = 6;
export const BLOCS_MAX = 20;
/** Corps d'une demande : au-delà, 413 (contrat). */
export const CORPS_MAX_OCTETS = 8 * 1024;
/** Délai du saut hub → MemoryAI (contrat : 30 s ; l'app attend 35 s). */
export const DELAI_MEMORYAI_MS = 30_000;

/** Les douze humeurs de lia-ui (`HUMEURS_LIA`, contrat du fil Assistant). */
export const HUMEURS = [
  "neutre", "joyeux", "calme", "curieux", "fatigue", "inquiet",
  "excite", "triste", "concentre", "espiegle", "fier", "timide",
] as const;
type Humeur = (typeof HUMEURS)[number];

/**
 * L'état du corps de LIA à l'écran (lia-ui ≥ v0.15.0, 3e argument de `ask`) : une DONNÉE sur elle, pas sur Marc.
 * Listes fermées, jamais de texte libre : ces valeurs finissent dans le message que MemoryAI envoie au modèle.
 * `humeur` et `silhouette` viennent des listes exportées par le paquet épinglé (elles bougent avec le re-pin,
 * jamais seules) ; `regard` a la forme de `data-lia-cible`.
 */
export type EtatLia = { humeur: string; silhouette: string; regard: string | null };
const REGARD = /^[a-z0-9-]{1,40}$/;
const HUMEURS_LIA_40: ReadonlySet<string> = new Set(HUMEURS_DETAILLEES);
const SILHOUETTES: ReadonlySet<string> = new Set(SILHOUETTES_LIA);

/** L'état conforme, ou `undefined` : une clé en trop, un texte hors liste ou un `regard` mal formé le refusent. */
export function lireEtatLia(v: unknown): EtatLia | undefined {
  if (!estObjet(v)) return undefined;
  const cles = Object.keys(v);
  if (cles.length !== 3 || !["humeur", "silhouette", "regard"].every((c) => cles.includes(c))) return undefined;
  const { humeur, silhouette, regard } = v;
  if (typeof humeur !== "string" || !HUMEURS_LIA_40.has(humeur)) return undefined;
  if (typeof silhouette !== "string" || !SILHOUETTES.has(silhouette)) return undefined;
  if (regard !== null && (typeof regard !== "string" || !REGARD.test(regard))) return undefined;
  return { humeur, silhouette, regard };
}

export type DemandeAsk = { question: string; page?: string; proprietaire?: boolean; etat_lia?: EtatLia };
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
  if (corps.etat_lia !== undefined) {
    // Refusé s'il sort de la forme, jamais réparé : MemoryAI ne reçoit que ce que ce hub a validé.
    const etat = lireEtatLia(corps.etat_lia);
    if (!etat) return { ok: false, raison: "`etat_lia` : { humeur, silhouette, regard } dans les listes de LIA." };
    demande.etat_lia = etat;
  }
  return { ok: true, valeur: demande };
}

/**
 * Ce que le hub envoie à MemoryAI : question, page, QUI parle et si c'est le PROPRIÉTAIRE. Les deux
 * derniers sont décidés par le hub (jeton ou session), jamais copiés tels quels du corps d'une app.
 * `proprietaire` est obligatoire côté MemoryAI (403 sans lui) : un invité n'atteint jamais la mémoire.
 *
 * `contexte` : le bilan d'état des apps (`lib/liaContexte.ts`), une DONNÉE datée écrite par le hub,
 * jamais un champ copié d'une app ni du navigateur. Absent = rien n'est joint.
 */
export function corpsPourMemoryAi(demande: DemandeAsk, source: string, proprietaire: boolean, contexte?: string): string {
  const { question, page, etat_lia } = demande;
  return JSON.stringify({
    question,
    ...(page !== undefined && { page }),
    ...(etat_lia !== undefined && { etat_lia }),
    source,
    proprietaire,
    ...(contexte !== undefined && contexte !== "" && { contexte }),
  });
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
