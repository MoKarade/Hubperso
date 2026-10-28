// lib/sessionSigneeControle.ts — le cookie de session signé est-il bien émis ET vérifiable ?
//
// Le cookie est `httpOnly` : ni Marc ni un contrôle de production ne peut le lire. Cette
// vérification fait ce que font les apps — `verifierSession` de hub-contract avec les clés
// publiques (`HUB_SESSION_PUBLIC_KEYS`) — et ne rend que l'ÉTAT, jamais le cookie ni une clé.
// Les deux clés ne sont lues qu'au build : après les avoir posées ou changées sur Vercel, il
// faut un déploiement neuf (un commit qui touche un fichier servi) avant de lire la route.
import { decodeProtectedHeader } from "jose";
import { verifierSession, type ClesPubliques } from "@mokarade/hub-contract/session";

type Env = Partial<NodeJS.ProcessEnv>;

type EtatControle = "valide" | "absent" | "invalide" | "non-configure";

export interface ResultatControle {
  readonly etat: EtatControle;
  /** Identifiant de la clé qui a signé (en-tête du cookie vérifié). */
  readonly kid?: string;
  /** Expiration du cookie, en ISO 8601. */
  readonly expireLe?: string;
}

function clesPubliques(env: Env): ClesPubliques | null {
  const brut = env.HUB_SESSION_PUBLIC_KEYS?.trim();
  if (!brut) return null;
  try {
    const lu = JSON.parse(brut) as { keys?: unknown } | null;
    return Array.isArray(lu?.keys) ? (lu as ClesPubliques) : null;
  } catch {
    return null;
  }
}

/**
 * @param cookie valeur reçue de `__Secure-hub.session`, ou `undefined`
 * @param emailSession l'adresse de la session du hub : le cookie doit porter la MÊME, sinon « invalide »
 */
export async function controlerSessionSignee(
  cookie: string | undefined,
  emailSession: string,
  env: Env = process.env,
  maintenant: Date = new Date(),
): Promise<ResultatControle> {
  const cles = clesPubliques(env);
  if (!cles) return { etat: "non-configure" };
  if (!cookie) return { etat: "absent" };

  const identite = await verifierSession(cookie, cles, { maintenant });
  if (!identite || identite.email !== emailSession) return { etat: "invalide" };

  // `verifierSession` a déjà exigé un kid de type texte : la lecture de l'en-tête ne peut pas échouer.
  const { kid } = decodeProtectedHeader(cookie);
  return { etat: "valide", kid, expireLe: new Date(identite.expireLe * 1000).toISOString() };
}
