// lib/chantierEvenements.ts — les événements GitHub que le hub reçoit pour la page Chantier. PUR : aucune I/O.
//
// Le relevé du PC arrive toutes les 10 minutes ; un événement arrive à l'instant où il se produit. Ici : vérifier la
// signature de GitHub, puis réduire un webhook à la forme convenue avec le fil workflow (28/10/2026) :
//   { v:1, id, type, action, repo, n|null, sha|null, cle, at, etat, plus? }
// `cle` : `repo#n` (issue, PR, comme la clé `etapes` du relevé), `repo@sha` (déploiement, contrôle) ou `repo:nom` (run,
// alerte, envoi d'une app). `repo` est la clé COURTE du relevé (`drive`, `hub`…), pas le nom GitHub. `at` est l'heure de
// l'événement, jamais celle de la réception. Rien du corps des commentaires ni des issues n'est gardé : un titre, un lien.
//
// NO FAKE DATA : un événement qu'on ne sait pas lire est REFUSÉ (422), jamais rangé à moitié ; un type qu'on ne retient
// pas est ignoré à voix haute (`ignore`), jamais présenté comme rangé.

import { createHmac } from "node:crypto";

/** Au-delà, le corps est refusé avant d'être lu (un `workflow_run` pèse quelques dizaines de Ko). */
export const TAILLE_MAX_EVENEMENT = 2_000_000;

/** Combien de jours on garde les événements : plus que le Gantt le plus long qu'ils complètent. */
export const JOURS_CONSERVES = 14;

/** Nom GitHub du dépôt (minuscules) → clé courte du relevé. Un dépôt absent de la table est refusé. */
export const DEPOTS: Record<string, string> = {
  ".github": "eco",
  financeai: "fin",
  jobai: "job",
  "batchchef-": "batch",
  driveai: "drive",
  hubperso: "hub",
  carai: "car",
  memoryai: "mem",
  "app-template": "tpl",
  "hub-contract": "hc",
  "lia-ui": "lia",
};

export interface EvenementChantier {
  v: 1;
  /** L'identifiant de livraison GitHub : le même événement renvoyé ne crée pas de seconde ligne. */
  id: string;
  type: string;
  action: string;
  repo: string;
  n: number | null;
  sha: string | null;
  cle: string;
  at: string;
  etat: string | null;
  /** Ce qui aide à lire l'événement sans retourner sur GitHub : titre, lien, branche, étiquette, environnement. */
  plus: Record<string, string> | null;
}

export type Lecture =
  | { ok: true; evenement: EvenementChantier }
  | { ok: false; ignore: true; raison: string }
  | { ok: false; ignore: false; raison: string };

/** `sha256=<hex>` : la signature que GitHub pose dans `X-Hub-Signature-256` pour ce corps et ce secret. */
export function signer(corps: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(corps, "utf8").digest("hex");
}

/** La signature présentée a-t-elle la forme de GitHub (`sha256=` et 64 chiffres hexadécimaux) ? La comparaison, elle, se fait dans la route. */
export const formeSignature = (enTete: string | null | undefined): enTete is string => !!enTete && /^sha256=[0-9a-f]{64}$/.test(enTete);

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const txt = (v: unknown, max = 200): string | null => (typeof v === "string" && v ? v.slice(0, max) : null);
const entier = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
const date = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const sans = (o: Record<string, string | null>): Record<string, string> | null => {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (v) r[k] = v;
  return Object.keys(r).length ? r : null;
};

const ACTIONS: Record<string, string[]> = {
  issues: ["opened", "edited", "labeled", "unlabeled", "closed", "reopened"],
  pull_request: ["opened", "ready_for_review", "converted_to_draft", "labeled", "unlabeled", "closed", "reopened"],
  workflow_run: ["completed"],
  check_suite: ["completed"],
  deployment_status: ["created"],
  issue_comment: ["created"],
  merge_group: ["checks_requested", "destroyed"],
  dependabot_alert: ["created", "dismissed", "auto_dismissed", "fixed", "reintroduced", "reopened", "auto_reopened"],
};

/**
 * Le webhook (`X-GitHub-Event`, `X-GitHub-Delivery`, corps JSON déjà lu) réduit à un événement du Chantier.
 * `maintenant` ne sert qu'aux événements qui ne portent aucune heure (`repository_dispatch`, `merge_group` sans commit).
 */
export function lireEvenement(type: string, livraison: string, corps: unknown, maintenant: Date): Lecture {
  const refus = (raison: string): Lecture => ({ ok: false, ignore: false, raison });
  if (type === "ping") return { ok: false, ignore: true, raison: "ping : webhook bien relié" };
  if (type !== "repository_dispatch" && !ACTIONS[type]) return { ok: false, ignore: true, raison: `type « ${type} » non retenu` };
  if (!/^[0-9a-f-]{8,64}$/i.test(livraison)) return refus("X-GitHub-Delivery absent ou illisible");
  const p = obj(corps);
  if (!p) return refus("corps : objet JSON attendu");
  const action = type === "repository_dispatch" ? txt(p.action, 80) : txt(p.action, 40);
  if (!action) return refus("action absente");
  if (ACTIONS[type] && !ACTIONS[type].includes(action)) return { ok: false, ignore: true, raison: `action « ${type}.${action} » non retenue` };

  const depot = txt(obj(p.repository)?.name, 100)?.toLowerCase() ?? "";
  const repo = DEPOTS[depot];
  if (!repo) return refus(`dépôt « ${depot || "?"} » hors du projet`);

  const fait = (
    cle: string,
    n: number | null,
    sha: string | null,
    at: string | null,
    etat: string | null,
    plus: Record<string, string | null> = {},
  ): Lecture =>
    at
      ? { ok: true, evenement: { v: 1, id: livraison, type, action, repo, n, sha, cle, at, etat, plus: sans(plus) } }
      : refus(`${type}.${action} : heure de l'événement illisible`);

  if (type === "issues" || type === "pull_request") {
    const o = obj(type === "issues" ? p.issue : p.pull_request);
    const n = entier(o?.number);
    if (!o || !n) return refus(`${type} : numéro absent`);
    const etiquette = txt(obj(p.label)?.name, 80);
    const fusionnee = type === "pull_request" && o.merged === true;
    const etat =
      type === "pull_request"
        ? action === "closed" ? (fusionnee ? "fusionnee" : "fermee") : o.draft === true || action === "converted_to_draft" ? "brouillon" : "ouverte"
        : o.state === "closed" ? "fermee" : "ouverte";
    const at = date(fusionnee ? o.merged_at : action === "closed" ? o.closed_at : o.updated_at) ?? date(o.updated_at);
    return fait(`${repo}#${n}`, n, null, at, etat, { t: txt(o.title), u: txt(o.html_url, 300), lb: etiquette });
  }

  if (type === "workflow_run") {
    const o = obj(p.workflow_run);
    const nom = txt(o?.name, 100);
    if (!o || !nom) return refus("workflow_run : nom absent");
    const pr = Array.isArray(o.pull_requests) ? entier(obj(o.pull_requests[0])?.number) : null;
    return fait(`${repo}:${nom}`, pr, txt(o.head_sha, 40), date(o.updated_at), txt(o.conclusion, 30), {
      t: nom,
      u: txt(o.html_url, 300),
      b: txt(o.head_branch, 100),
    });
  }

  if (type === "check_suite") {
    const o = obj(p.check_suite);
    const sha = txt(o?.head_sha, 40);
    if (!o || !sha) return refus("check_suite : sha absent");
    const pr = Array.isArray(o.pull_requests) ? entier(obj(o.pull_requests[0])?.number) : null;
    return fait(`${repo}@${sha.slice(0, 7)}`, pr, sha, date(o.updated_at), txt(o.conclusion, 30), {
      t: txt(obj(o.app)?.name, 80),
      b: txt(o.head_branch, 100),
    });
  }

  if (type === "deployment_status") {
    const s = obj(p.deployment_status);
    const d = obj(p.deployment);
    const sha = txt(d?.sha, 40);
    if (!s || !sha) return refus("deployment_status : sha absent");
    return fait(`${repo}@${sha.slice(0, 7)}`, null, sha, date(s.created_at), txt(s.state, 30), {
      env: txt(s.environment) ?? txt(d?.environment, 80),
      u: txt(s.environment_url, 300) ?? txt(s.target_url, 300),
    });
  }

  if (type === "issue_comment") {
    const i = obj(p.issue);
    const c = obj(p.comment);
    const n = entier(i?.number);
    if (!i || !c || !n) return refus("issue_comment : numéro absent");
    // Seul « Acceptée » (la preuve) intéresse la page : tout autre commentaire est ignoré, jamais gardé.
    if (!/accept[ée]e/i.test(typeof c.body === "string" ? c.body : "")) return { ok: false, ignore: true, raison: "commentaire sans « Acceptée »" };
    return fait(`${repo}#${n}`, n, null, date(c.created_at), "acceptee", { t: txt(i.title), u: txt(c.html_url, 300) });
  }

  if (type === "merge_group") {
    const g = obj(p.merge_group);
    const sha = txt(g?.head_sha, 40);
    if (!g || !sha) return refus("merge_group : sha absent");
    const at = date(obj(g.head_commit)?.timestamp) ?? maintenant.toISOString();
    return fait(`${repo}@${sha.slice(0, 7)}`, null, sha, at, action === "destroyed" ? txt(p.reason, 30) ?? "detruit" : "en_file", { b: txt(g.head_ref, 100) });
  }

  if (type === "dependabot_alert") {
    const a = obj(p.alert);
    const n = entier(a?.number);
    if (!a || !n) return refus("dependabot_alert : numéro absent");
    return fait(`${repo}:alerte-${n}`, null, null, date(a.updated_at) ?? date(a.created_at), txt(a.state, 30), {
      t: txt(obj(a.security_advisory)?.summary),
      u: txt(a.html_url, 300),
      sev: txt(obj(a.security_advisory)?.severity, 20),
    });
  }

  // repository_dispatch : un envoi d'une app (fin de cron, note de LIA). Le type d'événement nomme la clé.
  const charge = obj(p.client_payload);
  return fait(`${repo}:${action}`, null, null, date(charge?.at) ?? maintenant.toISOString(), txt(charge?.etat, 30), {
    t: txt(charge?.titre),
  });
}
