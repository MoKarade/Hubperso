// scripts/autoMerge.mjs — cette PR peut-elle être fusionnée toute seule ? Fonctions PURES.
//
// Source : `claude-config`. Identique dans les huit dépôts.
//
// ── POURQUOI LA DÉCISION N'EST PAS DANS LE YAML ─────────────────────────────────────
//
// Parce qu'un `if:` de workflow ne se teste pas. Le premier auto-merge du parc (DriveAI)
// portait sa logique dans du shell, et deux défauts n'ont été trouvés qu'en production :
// un `gh pr ready` qui RETIRAIT le brouillon avant de merger (l'ADR-0045 fusionnée en 63
// secondes malgré son statut « Proposé »), et un 503 transitoire qui tuait le run en
// silence, laissant la PR ouverte avec une CI verte.
//
// Ici, tout ce qui DÉCIDE est une fonction pure avec ses tests. Le workflow ne fait que
// récolter du JSON et obéir.
//
// ── LA RÈGLE D'OR, DANS LE BON SENS ─────────────────────────────────────────────────
//
// Le défaut est de NE PAS MERGER. Toute incertitude — champ absent, état inconnu, lecture
// ratée — refuse. Un merge de trop est irréversible et part en production ; un merge raté se
// rattrape d'un clic. Ces deux erreurs n'ont pas le même prix, et le code doit le refléter.

/** Le label qui retient une PR déjà sortie du brouillon. Second verrou, pas le premier. */
export const LABEL_FREIN = "do-not-merge";

/** Conclusions de check qui n'empêchent pas de merger. Tout le reste bloque. */
const CONCLUSIONS_OK = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

/**
 * Un check en échec pour cause de QUOTA ne dit rien sur le code.
 *
 * ── LA DISTINCTION, ET POURQUOI ELLE N'EST PAS UNE DÉROGATION ───────────────────────
 *
 * « Vercel a échoué » et « Vercel n'a rien tenté » ne sont pas le même fait. Quand le
 * plafond du compte est atteint, le déploiement est refusé À LA CRÉATION — aucun build, donc
 * aucune information sur la PR. Ce n'est pas un feu rouge, c'est un feu ABSENT, et le traiter
 * comme un échec est aussi faux que de le traiter comme un succès.
 *
 * Vécu deux fois en dix-huit heures les 20 et 21/08 : plus rien ne pouvait être fusionné
 * pendant que tout était vert côté code.
 *
 * ⚠️ CE QUI REND CETTE NEUTRALISATION ACCEPTABLE, ET RIEN D'AUTRE : le gate GitHub de ces
 * dépôts exécute DÉJÀ le build (`npm run build`). Une prévisualisation Vercel sautée ne
 * laisse donc pas le build non vérifié — elle enlève la vérification du DÉPLOIEMENT, pas
 * celle de la compilation. Dans un dépôt dont la CI ne construirait pas, cette neutralisation
 * serait fausse et il faudrait la retirer.
 *
 * Et le garde-fou reste : `auMoinsUnePreuve` exige qu'il subsiste au moins un check
 * réellement vert. On ne fusionne jamais une PR dont TOUS les signaux sont absents.
 */
const MOTIFS_QUOTA = [
  /rate limit/i,
  /resource is limited/i,
  /api-deployments-free-per-day/i,
  /try again in 24 hours/i,
];

function estUnQuota(c) {
  const texte = `${(c && c.description) || ""} ${(c && c.title) || ""} ${(c && c.output) || ""}`;
  return MOTIFS_QUOTA.some((motif) => motif.test(texte));
}

/**
 * États de fusion acceptés.
 *
 * `CLEAN` : tout est vert et à jour. `HAS_HOOKS` : idem, avec des hooks côté dépôt.
 * Tout le reste refuse, y compris `UNKNOWN` — GitHub calcule cet état de façon
 * ASYNCHRONE, et il vaut `UNKNOWN` tant que le calcul n'est pas fini. Le traiter comme
 * « probablement bon » mergerait sur une réponse pas encore calculée.
 *
 * `BEHIND` refuse aussi : la PR est verte contre une base PÉRIMÉE. Ses tests n'ont jamais
 * vu le `main` d'aujourd'hui, et c'est exactement comme ça qu'on casse `main` avec deux PR
 * vertes qui ne se sont jamais rencontrées.
 */
const ETATS_OK = new Set(["CLEAN", "HAS_HOOKS"]);

/**
 * @param {object} pr
 * @param {boolean} [pr.isDraft]
 * @param {boolean} [pr.isCrossRepository]
 * @param {{name?:string}[]} [pr.labels]
 * @param {{name?:string, status?:string, conclusion?:string, __typename?:string, state?:string}[]} [pr.checks]
 * @param {string} [pr.mergeStateStatus]
 * @param {string} [pr.state]
 * @returns {{merger: boolean, raison: string, code: string}}
 */
/**
 * Codes de raison : liste FERMÉE, lue par le workflow (sortie du job) et par les tests.
 * `attestation_requise`, `frein_horaire` et `sha_change` de la spec ne s'appliquent pas à ce
 * dépôt (aucune attestation ni frein horaire dans la décision) : ils ne sont pas inventés ici.
 */
export const CODES_RAISON = [
  "merge_ok",
  "brouillon",
  "do_not_merge",
  "controle_en_cours",
  "controle_rouge",
  "etat_fusion",
  "hors_perimetre",
];

export function decision(pr) {
  if (!pr || typeof pr !== "object") return { merger: false, code: "hors_perimetre", raison: "aucune donnée de PR" };

  if (pr.state && pr.state !== "OPEN") {
    return { merger: false, code: "hors_perimetre", raison: `PR à l'état ${pr.state}` };
  }

  // ⚠️ `!== false` et non `=== true` : un champ ABSENT (lecture partielle, API qui change)
  // doit refuser, pas passer. C'est toute la différence entre « je sais que non » et « je
  // ne sais pas », et c'est la seconde qui a coûté l'ADR-0045.
  if (pr.isDraft !== false) {
    return { merger: false, code: "brouillon", raison: "brouillon — le frein posé à la création de la PR" };
  }

  if (pr.isCrossRepository !== false) {
    return { merger: false, code: "hors_perimetre", raison: "PR venant d'un fork" };
  }

  const labels = Array.isArray(pr.labels) ? pr.labels : [];
  if (labels.some((l) => l && l.name === LABEL_FREIN)) {
    return { merger: false, code: "do_not_merge", raison: `label ${LABEL_FREIN}` };
  }

  const checks = Array.isArray(pr.checks) ? pr.checks : null;
  if (checks === null) return { merger: false, code: "controle_en_cours", raison: "checks illisibles" };

  // AUCUN check n'est pas un feu vert. Une PR qui n'a rien prouvé ne se merge pas toute
  // seule — et zéro check signale plus souvent une CI qui n'a pas démarré qu'un dépôt sans
  // CI. Le cas « dépôt réellement sans CI » se règle en ajoutant une CI, pas en fusionnant
  // à l'aveugle.
  if (checks.length === 0) {
    return { merger: false, code: "controle_en_cours", raison: "aucun check — rien n'a été vérifié" };
  }

  // TOUS les checks, pas seulement ceux d'un workflow nommé. C'est le défaut du premier
  // auto-merge du parc : il se déclenchait sur le succès de « CI » et ignorait les autres
  // workflows du dépôt. Hubperso en a deux depuis le 21/08.
  let auMoinsUnePreuve = false;

  for (const c of checks) {
    const nom = (c && c.name) || (c && c.context) || "check sans nom";

    // Un échec de QUOTA est un signal ABSENT, pas un signal négatif. Voir MOTIFS_QUOTA.
    if (estUnQuota(c)) {
      continue;
    }

    // Les statuts « legacy » (Vercel, par exemple) n'ont pas de `status`/`conclusion` mais
    // un `state`. Les deux formes sont acceptées ; une forme inconnue REFUSE.
    if (c && typeof c.state === "string" && c.status === undefined) {
      if (c.state === "SUCCESS") {
        auMoinsUnePreuve = true;
        continue;
      }
      if (c.state === "PENDING") return { merger: false, code: "controle_en_cours", raison: `${nom} en cours` };
      return { merger: false, code: "controle_rouge", raison: `${nom} : ${c.state}` };
    }

    if (!c || c.status !== "COMPLETED") {
      return { merger: false, code: "controle_en_cours", raison: `${nom} pas terminé (${(c && c.status) || "statut absent"})` };
    }
    if (!CONCLUSIONS_OK.has(c.conclusion)) {
      return { merger: false, code: "controle_rouge", raison: `${nom} : ${c.conclusion || "conclusion absente"}` };
    }
    if (c.conclusion === "SUCCESS") auMoinsUnePreuve = true;
  }

  // Tous les checks neutralisés ou sautés ⇒ rien n'a été prouvé. Le cas se produit si le
  // quota tombe avant que la CI ne démarre : la PR aurait l'air « sans échec » alors qu'elle
  // n'a rien passé du tout.
  if (!auMoinsUnePreuve) {
    return { merger: false, code: "controle_en_cours", raison: "aucun check réellement vert — rien n'a été prouvé" };
  }

  if (!ETATS_OK.has(pr.mergeStateStatus)) {
    return {
      merger: false,
      code: "etat_fusion",
      raison: `état de fusion ${pr.mergeStateStatus || "inconnu"} (attendu CLEAN)`,
    };
  }

  return { merger: true, code: "merge_ok", raison: "tous les checks sont verts et la branche est à jour" };
}
