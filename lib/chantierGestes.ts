// lib/chantierGestes.ts — les gestes de l'onglet « À toi » (Fusionner, Fait, une réponse) que le cadre
// remet au hub. PUR : aucune I/O.
//
// Avant, un clic déposait `reponse-<horodatage>.json` dans le dossier Drive `_Gantt` ; le PC
// (`outils/gantt-pc/reponses.py`, MoKarade/.github) l'appliquait sur GitHub. Dans le cadre isolé du hub
// il n'y a ni connecteur Drive ni réseau : le cadre passe le geste au hub par son canal, et le hub le
// dépose lui-même, avec la session du propriétaire (`app/api/chantier/gestes/route.ts`). Le corps reste
// EXACTEMENT celui d'hier, pour que le PC lise la nouvelle source sans changer de logique.
//
// Un geste agit sur GitHub (fusion d'une PR, fermeture d'une tâche) : rien n'est deviné, tout champ
// hors contrat refuse le geste entier.

/** Version du corps. Un autre numéro est refusé, jamais deviné. */
const VERSION_GESTE = 1;

/** Ce que le PC sait appliquer. */
const GESTES = ["fusionner", "fait", "reponse"] as const;
type Geste = (typeof GESTES)[number];

/** Taille maximale du corps reçu (octets) : un geste en tient bien moins de 1 Ko. */
export const TAILLE_MAX_GESTE = 4_096;

/** Longueur maximale d'une réponse (la phrase d'un bouton). */
export const TEXTE_MAX = 500;

export type DepotGeste = {
  v: typeof VERSION_GESTE;
  /** Identifiant tiré par le cadre : un renvoi du même geste ne se range qu'une fois. */
  id: string;
  /** La tâche ou la PR visée, telle que la page la nomme (`owner/depot#n`). */
  ref: string;
  geste: Geste;
  /** La phrase d'une réponse ; `null` pour fusionner et fait. */
  texte: string | null;
  /** L'heure du clic, ISO 8601 (heure du navigateur) ; l'heure de réception est celle du hub. */
  quand: string;
};

export type ValidationGeste = { ok: true; geste: DepotGeste } | { ok: false; raison: string };

const CHAMPS = ["v", "id", "ref", "geste", "texte", "quand"];
const ID = /^[a-z0-9-]{6,48}$/;
// Une référence ne contient ni espace ni caractère de contrôle ; sa forme exacte appartient au PC, qui la vérifie sur GitHub.
const REF = /^[^\s\u0000-\u001f\u007f]{3,200}$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}T/;

const estObjet = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Le corps est-il un geste complet et lisible ? Sinon, pourquoi : jamais un geste à moitié. */
export function validerGeste(corps: unknown): ValidationGeste {
  if (!estObjet(corps)) return { ok: false, raison: "corps : un objet JSON est attendu" };
  const inconnu = Object.keys(corps).find((k) => !CHAMPS.includes(k));
  if (inconnu !== undefined) return { ok: false, raison: `${inconnu} : champ inconnu` };

  if (corps.v !== VERSION_GESTE) return { ok: false, raison: `v : seule la version ${VERSION_GESTE} est connue` };
  const { id, ref, geste, texte, quand } = corps;
  if (typeof id !== "string" || !ID.test(id)) return { ok: false, raison: "id : 6 à 48 caractères a-z, 0-9 et tiret" };
  if (typeof ref !== "string" || !REF.test(ref)) return { ok: false, raison: "ref : une référence sans espace est attendue" };
  if (typeof geste !== "string" || !(GESTES as readonly string[]).includes(geste)) {
    return { ok: false, raison: `geste : ${GESTES.join(", ")}` };
  }
  if (geste === "reponse") {
    if (typeof texte !== "string" || texte.trim() === "" || texte.length > TEXTE_MAX) {
      return { ok: false, raison: `texte : une réponse de 1 à ${TEXTE_MAX} caractères est attendue` };
    }
  } else if (texte !== null && texte !== undefined) {
    return { ok: false, raison: "texte : seul le geste « reponse » en porte un" };
  }
  if (typeof quand !== "string" || !DATE_ISO.test(quand) || Number.isNaN(Date.parse(quand))) {
    return { ok: false, raison: "quand : une date ISO 8601 est attendue" };
  }
  return {
    ok: true,
    geste: { v: VERSION_GESTE, id, ref, geste: geste as Geste, texte: geste === "reponse" ? (texte as string) : null, quand },
  };
}

/**
 * La demande vient-elle de NOTRE page ? Un POST qui écrit sur GitHub ne se fie pas au cookie seul :
 * l'en-tête `Origin` (toujours posé par un navigateur sur un POST) doit nommer l'hôte du hub.
 */
export function memeOrigine(entetes: Pick<Headers, "get">): boolean {
  const origine = entetes.get("origin");
  const hote = entetes.get("x-forwarded-host") ?? entetes.get("host");
  if (!origine || !hote) return false;
  try {
    return new URL(origine).host === hote;
  } catch {
    return false;
  }
}

/** Pourquoi le dépôt a échoué, dit au cadre en clair (il l'affiche sur le bouton). */
export function erreurGeste(status: number): string {
  if (status === 401) return "La session du hub a expiré : recharge la page pour te reconnecter.";
  if (status === 404) return "Ce geste est réservé au propriétaire du hub.";
  if (status === 429) return "Trop de gestes d'affilée : nouvel essai dans une minute.";
  if (status === 503) return "Le hub n'a pas de base : le geste n'est pas déposé.";
  return `Le geste n'est pas déposé (erreur ${status}).`;
}
