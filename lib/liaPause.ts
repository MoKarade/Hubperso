// lib/liaPause.ts — la pause de LIA, côté hub (PUR : aucune base, aucun réseau, aucune horloge).
//
// Marc (22/10/2026) : un interrupteur « assistant en pause » qui coupe vraiment. Vraiment = VÉRIFIÉ PAR LE SERVEUR : l'état
// vit en base (`lia_reglages`, `lib/liaPauseDb.ts`) et `POST /api/lia/ask` le consulte avant tout saut vers MemoryAI. Une
// pause que seule la page connaît ne retiendrait ni une app, ni un autre onglet, ni un script.
//
// Ce module ne fait que juger ce qui passe : le corps d'un changement de pause, et la réponse « en pause ». Il ne dit
// jamais « pas en pause » à la place de la base : si l'état est illisible, la route échoue FERMÉE (503), pas ouverte.

/** Ce que la page lit. `modifieLe` : ISO 8601, `null` tant que personne n'a jamais touché à la pause. */
export interface EtatPause {
  pause: boolean;
  modifieLe: string | null;
}

/** Un corps de changement tient en quelques octets ; au-delà, c'est autre chose. */
export const TAILLE_MAX_CORPS_PAUSE = 256;

export type LecturePause =
  | { ok: true; pause: boolean }
  | { ok: false; status: 400 | 413; error: string; message: string };

/** Lit le corps BRUT d'un `PUT /api/lia/pause` : exactement `{ "pause": true | false }`. Le refus ne cite jamais une valeur reçue. */
export function lireCorpsPause(brut: string): LecturePause {
  if (Buffer.byteLength(brut, "utf8") > TAILLE_MAX_CORPS_PAUSE) {
    return { ok: false, status: 413, error: "payload_too_large", message: `Corps au-delà de ${TAILLE_MAX_CORPS_PAUSE} octets.` };
  }
  let json: unknown;
  try {
    json = JSON.parse(brut);
  } catch {
    return { ok: false, status: 400, error: "bad_request", message: "JSON attendu : { pause: true | false }." };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, status: 400, error: "bad_request", message: "Objet attendu : { pause: true | false }." };
  }
  const cles = Object.keys(json);
  const pause = (json as Record<string, unknown>).pause;
  // Un booléen, rien d'autre : « "true" » ou 1 ne sont pas une décision, et une clé en plus n'a aucun sens ici.
  if (typeof pause !== "boolean" || cles.length !== 1) {
    return { ok: false, status: 400, error: "bad_request", message: "Seule la clé « pause » (vrai ou faux) est acceptée." };
  }
  return { ok: true, pause };
}

/** La réponse de `/api/lia/ask` pendant la pause : 423, sans avoir quitté le hub. Distincte du 503 « indisponible ». */
export const REPONSE_EN_PAUSE = {
  status: 423,
  corps: { error: "paused", message: "LIA est en pause." },
} as const;
