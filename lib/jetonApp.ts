// lib/jetonApp.ts — qui pose la question ?
//
// Le hub répond « cette personne a-t-elle accès à cette app ? ». Encore faut-il savoir de
// QUELLE app on parle. La réponse ne vient PAS du corps de la requête : elle vient du
// jeton. Chaque app partage déjà un secret avec le hub (`HUB_TOKEN_<APP>`, utilisé
// jusqu'ici dans l'autre sens, hub → app pour lire son summary). Ce même secret identifie
// désormais l'appelant.
//
// POURQUOI RÉUTILISER CE JETON PLUTÔT QU'EN CRÉER UN NOUVEAU
//   - aucun secret supplémentaire à générer, poser sur six projets Vercel et faire tourner ;
//   - une app ne peut PAS demander l'accès d'une autre : son jeton ne correspond qu'à son
//     propre `id`. L'identité de l'appelant est une conséquence du secret, pas une
//     déclaration qu'on lui ferait confiance.
//
// COMPARAISON À TEMPS CONSTANT
// `timingSafeEqual` plutôt que `===` : une comparaison qui s'arrête au premier octet
// différent laisse mesurer sa progression, et un jeton se devine alors octet par octet.
// L'attaque demande beaucoup de requêtes et un réseau stable — elle reste théorique ici,
// mais la parade coûte une ligne.

import { timingSafeEqual } from "node:crypto";
import { SOURCE_DEFS } from "./sources";

/** Égalité à temps constant. La différence de LONGUEUR fuit, et c'est sans conséquence. */
export function memeJeton(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Quelle app présente ce jeton ? `null` si aucune — ou si plusieurs.
 *
 * ⚠️ LE CAS « PLUSIEURS » EST UN REFUS, PAS UN CHOIX. Deux apps configurées avec le MÊME
 * `HUB_TOKEN_*` (copier-coller entre deux projets Vercel : ça arrive) rendraient l'identité
 * de l'appelant ambiguë. Retourner la première trouvée attribuerait silencieusement la
 * question à la mauvaise app — donc répondrait sur les accès d'une app que l'appelant n'est
 * pas. On refuse et on journalise : une panne visible vaut mieux qu'une autorisation
 * approximative.
 *
 * Un jeton d'app non configurée (variable absente ou vide) ne peut pas être « trouvé » :
 * sans ça, un en-tête vide correspondrait à toutes les apps non configurées.
 */
export function appDuJeton(
  jeton: string | null | undefined,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string | null {
  const valeur = jeton?.trim();
  if (!valeur) return null;

  const trouvees = SOURCE_DEFS.filter((def) => {
    const attendu = env[def.tokenEnv]?.trim();
    return Boolean(attendu) && memeJeton(valeur, attendu as string);
  });

  if (trouvees.length === 1) return trouvees[0]!.id;

  if (trouvees.length > 1) {
    console.error(
      `[acces] jeton ambigu : partagé par ${trouvees.map((d) => d.id).join(", ")}. ` +
        "Donne un HUB_TOKEN distinct à chaque app.",
    );
  }
  return null;
}
