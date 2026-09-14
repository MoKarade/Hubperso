// lib/cronAuth.ts — qui a le droit de déclencher l'horloge du hub. PUR.
//
// ── POURQUOI UNE DEUXIÈME ROUTE AUTHENTIFIÉE AUTREMENT ──────────────────────────────
//
// `/api/cron/releve` est appelée par un workflow GitHub Actions, pas par un navigateur :
// il n'y a aucun cookie de session à présenter. C'est le MÊME raisonnement que pour
// `/api/acces` (ADR 0001) — un serveur qui appelle un serveur — et c'est la deuxième et
// dernière route dans ce cas. Le `CLAUDE.md` disait « c'est la SEULE exception » : il est
// corrigé dans la même PR, parce qu'une règle qu'on sait fausse cesse d'être une règle.
//
// Ce qui ne change PAS : le matcher du middleware reste intact (il ne gagne aucune
// exclusion), la requête traverse donc toujours la garde globale et le refus « auth non
// configurée » continue de s'appliquer. C'est `isPublicPath` qui laisse passer, exactement
// comme pour `/api/acces` — la distinction est la leçon n°4 du `CLAUDE.md`.
//
// ── POURQUOI UN SECRET DÉDIÉ, ET PAS UN `HUB_TOKEN_*` ───────────────────────────────
//
// `/api/acces` réutilise le jeton d'app parce que ce jeton IDENTIFIE l'appelant, et que
// l'identité est le cœur de sa réponse. Ici il n'y a rien à identifier : l'horloge n'a
// qu'un seul appelant légitime, et ce qu'elle déclenche est une ÉCRITURE dans la mémoire
// du hub. Réutiliser le jeton de BatchChef donnerait à BatchChef le pouvoir de faire
// écrire le hub — un pouvoir qu'elle n'a aucune raison d'avoir, et qui se propagerait à
// chaque app ajoutée. `CRON_SECRET` est donc distinct, et c'est le même nom que celui déjà
// utilisé par CarAI pour ses polls : une convention d'écosystème, pas un nom de plus.

/** Ce que le hub doit faire d'un appel à son horloge. */
export type DecisionCron =
  /** Secret valide : l'appel procède. */
  | { type: "ok" }
  /**
   * `CRON_SECRET` absent côté serveur → 503, jamais 401.
   *
   * La distinction est le diagnostic : 401 dit « ton secret est faux » et envoie vérifier le
   * dépôt GitHub ; 503 dit « je n'ai pas de secret configuré » et envoie sur Vercel. Les
   * confondre, c'est faire chercher au mauvais endroit — et surtout, sans ce cas, une
   * variable oubliée rendrait l'horloge muette en la faisant passer pour un secret erroné.
   */
  | { type: "non-configure" }
  /** Secret absent de la requête, mal formé ou faux → 401. */
  | { type: "refuse" };

/**
 * Le `Authorization: Bearer <secret>` présenté vaut-il le secret attendu ?
 *
 * `comparer` est injecté pour que ce module reste PUR et testable sans `node:crypto` — en
 * production c'est `memeJeton` (`lib/jetonApp.ts`), donc une comparaison à temps constant.
 * Le préfixe `Bearer ` est comparé de façon insensible à la casse : la RFC 7235 le veut
 * ainsi, et un client qui envoie `bearer` n'est pas un intrus.
 */
export function decideCron(
  enTeteAutorisation: string | null | undefined,
  secretAttendu: string | undefined,
  comparer: (a: string, b: string) => boolean,
): DecisionCron {
  const attendu = secretAttendu?.trim();
  if (!attendu) return { type: "non-configure" };

  const fourni = extraireBearer(enTeteAutorisation);
  if (!fourni) return { type: "refuse" };

  return comparer(fourni, attendu) ? { type: "ok" } : { type: "refuse" };
}

/** Le secret d'un en-tête `Authorization`, ou `null` si l'en-tête n'en porte pas. */
function extraireBearer(enTete: string | null | undefined): string | null {
  const valeur = enTete?.trim();
  if (!valeur) return null;
  const separateur = valeur.indexOf(" ");
  if (separateur === -1) return null;
  if (valeur.slice(0, separateur).toLowerCase() !== "bearer") return null;
  const secret = valeur.slice(separateur + 1).trim();
  return secret.length > 0 ? secret : null;
}
