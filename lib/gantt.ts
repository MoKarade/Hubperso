// lib/gantt.ts — le relevé du Gantt que le PC de Marc envoie au hub. PUR : aucune I/O.
//
// ── POURQUOI LE HUB REÇOIT AU LIEU DE LIRE ──────────────────────────────────────────
//
// Le suivi « Chantier Apps » vit dans le Drive de Marc, réécrit toutes les 10 minutes par
// `outils/gantt-pc/tour.py` (MoKarade/.github). Le hub ne peut pas le lire : Drive est privé,
// aucun jeton Google n'est porté ici pour ça, et une URL publique est INTERDITE (les titres de
// tâches de FinanceAI et DriveAI sont privés). C'est donc le PC qui POSTe, le hub qui range, et
// la page qui lit la base DERRIÈRE la connexion du hub.
//
// ── CE QUE LE HUB GARDE ─────────────────────────────────────────────────────────────
//
// Le DERNIER envoi seulement (+ l'heure de réception) : pas d'historique, le Drive reste la
// copie de secours. `donnees_gz_b64` est conservé TEL QUEL (JSON gzippé puis base64) : le hub
// ne le décode ni ne le reformate, pour ne jamais créer d'écart avec ce que montre le Gantt.

/** Version du corps que `tour.py` envoie. Un autre numéro est refusé, jamais deviné. */
export const VERSION_ENVOI = 1;

/**
 * Taille maximale du corps, en octets. La limite d'une fonction Vercel est 4,5 Mo ; le relevé
 * réel fait environ 250 Ko. 4 Mo laisse de la marge sans ouvrir la porte à un corps géant.
 */
export const TAILLE_MAX_OCTETS = 4_000_000;

/** `H4sI` : le début, en base64, de tout flux gzip (octets 1f 8b 08). */
const DEBUT_GZIP_B64 = "H4sI";

type Objet = Record<string, unknown>;

export type EnvoiGantt = {
  v: typeof VERSION_ENVOI;
  /** Date d'envoi, ISO 8601 (heure du PC). */
  envoye: string;
  /** JSON du Gantt, gzippé puis en base64 : gardé tel quel. */
  donnees_gz_b64: string;
  etat: Objet;
  fiabilite: Objet;
  prochaines: Objet;
  quota: Objet;
};

export type ValidationEnvoi =
  | { ok: true; envoi: EnvoiGantt }
  | { ok: false; raison: string };

const estObjet = (x: unknown): x is Objet => typeof x === "object" && x !== null && !Array.isArray(x);

/** Le corps est-il un envoi complet et lisible ? Sinon, pourquoi — jamais un envoi à moitié. */
export function validerEnvoi(corps: unknown): ValidationEnvoi {
  if (!estObjet(corps)) return { ok: false, raison: "corps : un objet JSON est attendu" };

  if (corps.v !== VERSION_ENVOI) {
    return { ok: false, raison: `v : seule la version ${VERSION_ENVOI} est connue` };
  }
  const envoye = corps.envoye;
  if (typeof envoye !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(envoye) || Number.isNaN(Date.parse(envoye))) {
    return { ok: false, raison: "envoye : une date ISO 8601 est attendue" };
  }
  const gz = corps.donnees_gz_b64;
  if (typeof gz !== "string") return { ok: false, raison: "donnees_gz_b64 : une chaîne est attendue" };
  if (!gz.startsWith(DEBUT_GZIP_B64)) {
    return { ok: false, raison: "donnees_gz_b64 : ce n'est pas un gzip en base64" };
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(gz)) {
    return { ok: false, raison: "donnees_gz_b64 : ce n'est pas du base64" };
  }
  for (const champ of ["etat", "fiabilite", "prochaines", "quota"] as const) {
    if (!estObjet(corps[champ])) return { ok: false, raison: `${champ} : un objet est attendu` };
  }
  return {
    ok: true,
    envoi: {
      v: VERSION_ENVOI,
      envoye,
      donnees_gz_b64: gz,
      etat: corps.etat as Objet,
      fiabilite: corps.fiabilite as Objet,
      prochaines: corps.prochaines as Objet,
      quota: corps.quota as Objet,
    },
  };
}

/**
 * Le dernier relevé est-il périmé ? La donnée n'est jamais plus fraîche que le tour du PC
 * (10 min) : au-delà de 30 minutes, la page doit le DIRE (contrainte du fil Gantt).
 */
export const PEREMPTION_MS = 30 * 60_000;

export function estPerime(recuLe: number, maintenant: number): boolean {
  return maintenant - recuLe > PEREMPTION_MS;
}
