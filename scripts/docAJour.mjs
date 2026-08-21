// scripts/docAJour.mjs — la doc suit-elle le code ? Fonctions PURES, zéro dépendance.
//
// Source : `claude-config`. Le fichier est IDENTIQUE dans les huit dépôts — un correctif se
// propage en le recopiant, pas en l'adaptant. Zéro dépendance et pas de TypeScript, pour
// qu'il tourne pareil dans un dépôt Next et dans un dépôt Apps Script.
//
// ── LES DEUX OUBLIS QU'IL ATTRAPE ───────────────────────────────────────────────────
//
// Marc, 21/08 : « ça arrive qu'on fasse des tâches backlog sans les cocher, et ça arrive
// qu'on oublie de mettre des tâches dans backlog ».
//
//   1. FAITE MAIS PAS À JOUR — l'ID de la tâche est dans les commits, et son entrée de
//      backlog n'a pas été touchée de la PR.
//   2. JAMAIS INSCRITE — un ID apparaît dans les commits sans exister dans le backlog, ou
//      du code change sans qu'aucun commit ne porte d'ID.
//
// ── POURQUOI « ENTRÉE TOUCHÉE » ET NON « CASE COCHÉE » ──────────────────────────────
//
// Exiger la case cochée punirait le travail en plusieurs PR : une tâche avancée sans être
// finie resterait légitimement ⬜, et le contrôle échouerait à tort. On exige donc que
// l'entrée ait été RELUE — cochée, ou son statut mis à jour, ou sa note complétée. C'est ce
// qui manquait : personne ne rouvrait la ligne.
//
// ── L'ÉCHAPPATOIRE EST NOMMÉE, JAMAIS SILENCIEUSE ───────────────────────────────────
//
// Un correctif de coquille ou une réparation de CI n'a pas de tâche. Le commit porte alors
// `HORS-BACKLOG:` — visible, greppable, et qui force à l'écrire plutôt qu'à contourner. Même
// principe que les exceptions NOMMÉES de `gardePages.test.ts`.

/** L'échappatoire explicite. Un commit qui la porte est dispensé d'ID de tâche. */
export const HORS_BACKLOG = "HORS-BACKLOG";

/**
 * L'identifiant de tâche d'un sujet de commit, ou `null`.
 *
 * ⚠️ Cherché UNIQUEMENT en tête de sujet, éventuellement entre crochets — parce que c'est là
 * que la convention le place (`C28-49: feat: …`, `[CARTE-G] correctifs…`). Le chercher
 * n'importe où attraperait « UTF-8 », « HTTP-404 » ou « ADR-0045 » cité en passant, et le
 * contrôle accuserait des tâches qui n'existent pas. Un faux positif ici coûte cher : il
 * apprend à contourner le contrôle.
 */
export function idsDeSujet(sujet) {
  const ids = [];
  let reste = sujet.trim();
  // Forme à crochets, RÉPÉTABLE : « [H-06][H-07] … ». Un commit peut légitimement fermer
  // deux items, et c'est un usage établi dans le parc (FinanceAI écrit couramment
  // « [FX-FALLBACK-SILENCIEUX][RETIREMENT-GROSSINCOME-DEDUIT] … »).
  const crochet = /^\[([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\]\s*/;
  let m;
  while ((m = crochet.exec(reste))) {
    ids.push(m[1]);
    reste = reste.slice(m[0].length);
  }
  if (ids.length > 0) return ids;
  // Forme nue : « C28-49: … » ou « C28-49 … », et l'échappatoire « HORS-BACKLOG: … ».
  const nu = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\s*:?\s/.exec(reste);
  return nu ? [nu[1]] : [];
}

/**
 * Le PREMIER ID en tête de sujet, ou `null`.
 *
 * ⚠️ La version du 21/08 n'acceptait qu'UN SEUL identifiant : elle exigeait une espace
 * après le crochet fermant, donc « [H-06][H-07] … » ne portait aucun ID à ses yeux. Le
 * contrôle bloquait un commit parfaitement conforme, en affichant « aucun commit ne porte
 * d'identifiant » alors qu'il en portait deux. Découvert en l'appliquant à sa propre PR —
 * c'est-à-dire par le seul moyen qui marche : s'en servir pour de vrai.
 */
export function idDeSujet(sujet) {
  const [premier] = idsDeSujet(sujet);
  return premier ?? null;
}

/** Les IDs distincts portés par une liste de sujets de commit, dans l'ordre d'apparition. */
export function idsDesCommits(sujets) {
  const vus = [];
  for (const sujet of sujets) {
    for (const id of idsDeSujet(sujet)) {
      if (id !== HORS_BACKLOG && !vus.includes(id)) vus.push(id);
    }
  }
  return vus;
}

/** Au moins un commit invoque l'échappatoire ? */
export function porteHorsBacklog(sujets) {
  return sujets.some((s) => idDeSujet(s) === HORS_BACKLOG);
}

/**
 * Les IDs présents dans un BACKLOG.md.
 *
 * Les huit dépôts n'écrivent pas leur backlog pareil, et il a fallu les REGARDER plutôt
 * que les supposer — la première version de cette fonction était aveugle au format de
 * Hubperso, c'est-à-dire au dépôt où elle a été écrite :
 *
 *   - cases à cocher et backticks : `- [ ] **\`MCP-02\`** — poser le jeton` (BatchChef)
 *   - identifiant entre CROCHETS  : `- **[H-01] Re-pinner le contrat…**` (Hubperso)
 *   - tableau à statut emoji      : `| C28-49 — … | ⬜ |` (DriveAI)
 *
 * On accepte les TROIS plutôt que d'imposer un format : réécrire huit backlogs pour faire
 * plaisir à un script serait le faire travailler pour nous. Et un contrôle aveugle à un
 * format passe au VERT sans rien vérifier — pire que pas de contrôle, parce qu'on s'y fie.
 */
export function idsDuBacklog(contenu) {
  const ids = new Set();
  for (const ligne of contenu.split("\n")) {
    for (const m of ligne.matchAll(/`([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)`/g)) ids.add(m[1]);
    for (const m of ligne.matchAll(/\[([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\]/g)) ids.add(m[1]);
    for (const m of ligne.matchAll(/\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b(?=\s*[—:|])/g)) ids.add(m[1]);
  }
  return ids;
}

/** Un ID apparaît-il dans les lignes AJOUTÉES ou RETIRÉES du diff de BACKLOG.md ? */
export function entreeTouchee(diffBacklog, id) {
  return diffBacklog
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .some((l) => l.includes(id));
}

/**
 * Un chemin change-t-il ce qui est SERVI ou exécuté ? La doc, les tests et la CI ne comptent
 * pas comme du code : une PR qui ne touche qu'eux n'a pas de tâche à justifier.
 */
export function estCode(chemin) {
  if (chemin.endsWith(".md")) return false;
  if (chemin.startsWith("docs/") || chemin.startsWith(".github/")) return false;
  if (/(^|\/)tests?\//.test(chemin)) return false;
  return true;
}

/**
 * Le verdict. PUR : tout entre en paramètre, rien n'est lu ni deviné.
 *
 * Les BLOQUANTS ne portent que sur le backlog — décision de Marc du 21/08. Le HANDOVER et
 * les autres documents ne se jugent pas mécaniquement avec assez de certitude pour refuser
 * une PR : un HANDOVER peut être juste sans avoir bougé, et échouer là-dessus apprendrait à
 * le toucher pour rien, ce qui est pire que de ne pas le toucher.
 */
export function verifier({
  sujets = [],
  fichiers = [],
  contenuBacklog = "",
  diffBacklog = "",
  documents = {},
}) {
  const bloquants = [];
  const avertissements = [];

  const codeTouche = fichiers.filter(estCode);
  const ids = idsDesCommits(sujets);
  const connus = idsDuBacklog(contenuBacklog);

  if (codeTouche.length > 0 && ids.length === 0 && !porteHorsBacklog(sujets)) {
    bloquants.push(
      `Du code change (${codeTouche[0]}${codeTouche.length > 1 ? `, +${codeTouche.length - 1}` : ""}) ` +
        `et aucun commit ne porte d'identifiant de tâche. Ajoute l'ID du backlog en tête du sujet ` +
        `(« C28-49: … »), ou déclare l'exception : « ${HORS_BACKLOG}: … ».`,
    );
  }

  for (const id of ids) {
    if (!connus.has(id)) {
      bloquants.push(
        `La tâche \`${id}\` est dans les commits mais ABSENTE de BACKLOG.md — c'est le cas ` +
          `« tâche jamais inscrite ». Ajoute son entrée.`,
      );
      continue;
    }
    if (!entreeTouchee(diffBacklog, id)) {
      bloquants.push(
        `La tâche \`${id}\` a avancé sans que son entrée de BACKLOG.md ne soit relue — c'est le ` +
          `cas « faite mais pas cochée ». Coche-la, ou mets son statut à jour.`,
      );
    }
  }

  // ── LES AVERTISSEMENTS NE SE DÉCLENCHENT PAS SUR TOUT ─────────────────────────────
  //
  // Jamais bloquants, et surtout RARES. Un avertissement qui paraît sur une PR sur deux ne
  // porte plus aucune information : on apprend à le sauter, et le jour où il a raison il est
  // déjà invisible. C'est l'échec exact qu'on cherche à éviter — le même que celui d'un
  // bandeau qui annonce « 0 problème ».
  //
  // Chaque document n'est donc réclamé que quand le diff le rend PLAUSIBLEMENT périmé :
  //
  //   HANDOVER  — l'état réel du projet : toute modification de code peut le périmer, et
  //               c'est lui qui a porté « Phase 0, moteur pas encore écrit » chez DriveAI
  //               pendant que le moteur tournait sur 16 000 documents.
  //   CHANGELOG — même chose : un dépôt qui en tient un le tient à chaque changement servi.
  //   README    — décrit ce que le projet EST, pas chacune de ses lignes. Il ne se périme
  //               que quand la SURFACE bouge : dépendances, scripts, fichier ou dossier à la
  //               racine. Le réclamer à chaque correctif interne serait du bruit pur.
  if (codeTouche.length > 0) {
    const surfaceBouge = fichiers.some(
      (f) => f === "package.json" || (!f.includes("/") && estCode(f)) || /^[^/]+\/$/.test(f),
    );
    const reclame = {
      "HANDOVER.md": true,
      "CHANGELOG.md": true,
      "README.md": surfaceBouge,
    };
    for (const [nom, present] of Object.entries(documents)) {
      if (present && reclame[nom] && !fichiers.includes(nom)) {
        avertissements.push(`${nom} n'a pas bougé alors que du code a changé — encore juste ?`);
      }
    }
  }

  return { bloquants, avertissements };
}

/**
 * Le correctif SUGGÉRÉ, en texte prêt à coller. On propose, on n'applique pas : un commit
 * poussé par la CI dans une PR se bat avec l'auteur, et une entrée de backlog rédigée par un
 * script dirait ce que le script a compris — pas ce qui a été fait. De la doc fausse avec
 * l'air d'être à jour est pire que de la doc absente.
 */
export function suggestion(ids, connus) {
  const manquants = ids.filter((id) => !connus.has(id));
  if (manquants.length === 0) return null;
  return manquants
    .map((id) => `- [ ] **\`${id}\`** — (à décrire : ce que la tâche livre, et ce qui la déclare finie)`)
    .join("\n");
}
