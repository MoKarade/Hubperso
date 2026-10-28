// lib/chantierRattrapage.ts — rattraper le trou entre le dernier relevé du PC et les premiers événements GitHub reçus.
//
// Les webhooks (lib/chantierEvenements.ts) disent ce qui se passe À PARTIR de leur pose ; le relevé du PC dit l'état à son heure.
// Entre les deux (PC éteint, tour raté, webhooks posés après), l'état est inconnu. Ce module lit GitHub lui-même, UNE fois au
// chargement de la page (jamais sur minuterie), et rend l'état COURANT des issues et des PR touchées depuis `depuis`, sous la forme
// d'événements `action: "snapshot"` que la page range comme les autres (même forme, mêmes règles : l'heure d'après le relevé gagne).
//
// NO FAKE DATA : une lecture qui échoue ou qui est tronquée est DITE (`erreurs`, `incomplets`), jamais présentée comme complète.
// Le corps d'une issue n'est jamais gardé : un titre, un lien, les étiquettes, la preuve « Acceptée » (lien et heure seulement).
// Fonctions pures (`snapshotIssue`, `snapshotPr`, `lireAcceptee`) d'un côté, I/O de l'autre (`rattraper`, `api` injecté).

import { DEPOTS, type EvenementChantier } from "./chantierEvenements";

const PROPRIETAIRE = "MoKarade";
/** Combien de jours on remonte au plus : la fenêtre de conservation des événements. */
const JOURS_MAX = 14;
const PAGES_MAX = 3;
const COMMENTAIRES_MAX = 10;

export type Api = (chemin: string) => Promise<unknown>;

export interface Rattrapage {
  evenements: EvenementChantier[];
  /** Dépôts dont la lecture a atteint la limite de pages : des changements plus anciens peuvent manquer. */
  incomplets: string[];
  /** Une ligne par lecture qui a échoué (dépôt, cause) : jamais un silence. */
  erreurs: string[];
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
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

/** Les noms des étiquettes d'une issue GitHub (chaînes ou objets `{name}`). */
const etiquettes = (issue: Record<string, unknown>): string[] =>
  (Array.isArray(issue.labels) ? issue.labels : []).map((l) => (typeof l === "string" ? l : txt(obj(l)?.name, 80))).filter((x): x is string => !!x);

const ACCEPTEE = /^\s*\*{0,2}\s*accept[ée]e\b/i;

/** La dernière preuve « Acceptée » d'une liste de commentaires : son lien et son heure, ou null. Le corps n'est jamais gardé. */
export function lireAcceptee(commentaires: unknown): { u: string; c: string } | null {
  if (!Array.isArray(commentaires)) return null;
  let trouvee: { u: string; c: string } | null = null;
  for (const brut of commentaires) {
    const c = obj(brut);
    const corps = typeof c?.body === "string" ? c.body : "";
    const u = txt(c?.html_url, 300);
    const quand = date(c?.created_at);
    if (c && u && quand && ACCEPTEE.test(corps)) trouvee = { u, c: quand };
  }
  return trouvee;
}

/** L'état courant d'une issue (jamais une PR) : titre, lien, étiquettes, création, fermeture, et la preuve si elle a été lue. */
export function snapshotIssue(repo: string, issue: unknown, acceptee: { u: string; c: string } | null): EvenementChantier | null {
  const o = obj(issue);
  const n = entier(o?.number);
  const at = date(o?.updated_at);
  if (!o || !n || !at || o.pull_request) return null;
  const fermee = o.state === "closed";
  return {
    v: 1,
    id: `snap:issues:${repo}#${n}:${at}`,
    type: "issues",
    action: "snapshot",
    repo,
    n,
    sha: null,
    cle: `${repo}#${n}`,
    at,
    etat: fermee ? "fermee" : "ouverte",
    plus: sans({
      t: txt(o.title),
      u: txt(o.html_url, 300),
      labs: JSON.stringify(etiquettes(o)),
      cr: date(o.created_at),
      fin: fermee ? date(o.closed_at) : null,
      acc: acceptee ? JSON.stringify(acceptee) : null,
    }),
  };
}

/** L'état courant d'une PR : ouverte, brouillon, fusionnée ou fermée. */
export function snapshotPr(repo: string, pr: unknown): EvenementChantier | null {
  const o = obj(pr);
  const n = entier(o?.number);
  const at = date(o?.updated_at);
  if (!o || !n || !at) return null;
  const fusionnee = !!date(o.merged_at);
  const etat = o.state === "closed" ? (fusionnee ? "fusionnee" : "fermee") : o.draft === true ? "brouillon" : "ouverte";
  return {
    v: 1,
    id: `snap:pr:${repo}#${n}:${at}`,
    type: "pull_request",
    action: "snapshot",
    repo,
    n,
    sha: null,
    cle: `${repo}#${n}`,
    at: etat === "fusionnee" ? (date(o.merged_at) ?? at) : etat === "fermee" ? (date(o.closed_at) ?? at) : at,
    etat,
    plus: sans({ t: txt(o.title), u: txt(o.html_url, 300) }),
  };
}

/**
 * Pagine une liste GitHub (100 par page, `PAGES_MAX` au plus) ; `tronquee` quand la dernière page lue était encore pleine.
 * `assezAncien(dernier)` arrête la lecture d'une liste triée du plus récent au plus ancien quand sa dernière ligne est déjà d'avant la fenêtre.
 */
async function lister(api: Api, chemin: string, assezAncien?: (dernier: unknown) => boolean): Promise<{ lignes: unknown[]; tronquee: boolean }> {
  const lignes: unknown[] = [];
  for (let page = 1; page <= PAGES_MAX; page += 1) {
    const lot = await api(`${chemin}${chemin.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    if (!Array.isArray(lot)) throw new Error("réponse illisible");
    lignes.push(...lot);
    if (lot.length < 100 || (assezAncien && assezAncien(lot[lot.length - 1]))) return { lignes, tronquee: false };
  }
  return { lignes, tronquee: true };
}

/**
 * L'état courant des issues et des PR de chaque dépôt du projet touchées depuis `depuis`. Une issue de tâche fermée est lue avec
 * ses commentaires (au plus `COMMENTAIRES_MAX` appels par dépôt, en parallèle) pour retrouver sa preuve « Acceptée » : sans elle, une tâche acceptée
 * passerait pour fermée sans preuve, donc en rouge. Un dépôt illisible n'arrête pas les autres : il est nommé dans `erreurs`.
 */
export async function rattraper({ api, depuis, maintenant = new Date() }: { api: Api; depuis: Date | null; maintenant?: Date }): Promise<Rattrapage> {
  const plancher = maintenant.getTime() - JOURS_MAX * 86_400_000;
  const since = new Date(Math.max(depuis?.getTime() ?? plancher, plancher)).toISOString();
  const sortie: Rattrapage = { evenements: [], incomplets: [], erreurs: [] };
  const lecture = await Promise.all(
    Object.entries(DEPOTS).map(async ([nom, cle]) => {
      const chemin = `/repos/${PROPRIETAIRE}/${encodeURIComponent(nom)}`;
      try {
        const [issues, prs] = await Promise.all([
          lister(api, `${chemin}/issues?state=all&since=${encodeURIComponent(since)}&sort=updated&direction=desc`),
          lister(api, `${chemin}/pulls?state=all&sort=updated&direction=desc`, (dernier) => {
            const t = Date.parse(String(obj(dernier)?.updated_at ?? ""));
            return !Number.isNaN(t) && t <= Date.parse(since);
          }),
        ]);
        const evenements: EvenementChantier[] = [];
        const issuesVraies = issues.lignes.filter((brut) => {
          const o = obj(brut);
          return !!o && !o.pull_request;
        });
        // la preuve « Acceptée » des tâches fermées les plus récemment touchées (en parallèle : un seul tour de réseau par dépôt)
        const aLire = issuesVraies
          .filter((o) => obj(o)?.state === "closed" && etiquettes(obj(o) ?? {}).includes("niveau:tâche"))
          .slice(0, COMMENTAIRES_MAX);
        const preuves = new Map<number, { u: string; c: string }>();
        await Promise.all(
          aLire.map(async (o) => {
            const n = entier(obj(o)?.number);
            if (!n) return;
            try {
              const p = lireAcceptee(await api(`${chemin}/issues/${n}/comments?per_page=100`));
              if (p) preuves.set(n, p);
            } catch {
              // la preuve reste inconnue : la page garde celle du relevé
            }
          }),
        );
        for (const o of issuesVraies) {
          const e = snapshotIssue(cle, o, preuves.get(entier(obj(o)?.number) ?? 0) ?? null);
          if (e) evenements.push(e);
        }
        for (const brut of prs.lignes) {
          const e = snapshotPr(cle, brut);
          if (e && Date.parse(e.at) > Date.parse(since)) evenements.push(e);
        }
        return { cle, evenements, incomplet: issues.tronquee || prs.tronquee, erreur: null as string | null };
      } catch (err) {
        return { cle, evenements: [] as EvenementChantier[], incomplet: false, erreur: err instanceof Error ? err.message : "lecture impossible" };
      }
    }),
  );
  for (const l of lecture) {
    sortie.evenements.push(...l.evenements);
    if (l.incomplet) sortie.incomplets.push(l.cle);
    if (l.erreur) sortie.erreurs.push(`${l.cle} : ${l.erreur}`);
  }
  sortie.evenements.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : 1));
  return sortie;
}
