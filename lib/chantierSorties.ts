// lib/chantierSorties.ts — l'état du chantier, mis en événements pour la porte `POST /api/sorties` de MemoryAI.
// PUR : aucune I/O (le décodage du gzip est un calcul, l'envoi est dans la route).
//
// ── POURQUOI ────────────────────────────────────────────────────────────────────────
// Marc, 28/10/2026 : LIA doit voir et analyser elle-même ce qu'on lui montre (clic droit sur une barre du
// Gantt). Les faits envoyés avec le clic tiennent en 1 200 caractères ; pour le reste (une mission entière,
// ce qui est en retard, l'évolution), LIA les lit dans ses « sorties ». MemoryAI ne détient aucun jeton vers
// une app (ADR 0015) : c'est donc le hub qui POUSSE, après chaque relevé reçu du PC.
//
// ── CE QUI PART ─────────────────────────────────────────────────────────────────────
// Des COMPTES et des TITRES de travail : aucune donnée personnelle, aucun montant. Une ligne par app et une
// par mission ouverte. Le niveau est 1 (le plancher du hub côté MemoryAI).
// ⚠️ La `ref` porte une empreinte de l'état : un état qui change donne un événement NEUF, un état identique
// renvoyé ne se double jamais (l'identité d'une sortie est son type et sa `ref`, ADR 0031).

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { octetsGzip } from "./chantierReleve";

export const TYPE_APP = "chantier_app";
export const TYPE_MISSION = "chantier_mission";
/** Les bornes de la porte de MemoryAI (`lib/sorties/contrat.ts`) : plus long est REFUSÉ, jamais coupé là-bas. */
export const TITRE_MAX = 120;
export const RESUME_MAX = 600;
export const EVENEMENTS_MAX = 50;
/** Le niveau de ce que le hub envoie : des métadonnées de travail. */
export const NIVEAU = 1;
/** La taille du relevé décompressé qu'on accepte de lire (le réel : environ 2 Mo). */
const DECODE_MAX_OCTETS = 20_000_000;

type Objet = Record<string, unknown>;
const estObjet = (x: unknown): x is Objet => typeof x === "object" && x !== null && !Array.isArray(x);

export interface EvenementChantier {
  type: string;
  date: string;
  titre: string;
  resume: string;
  ref: string;
  niveau: number;
}

/** Le relevé du PC, décompressé, ou `null` si ce n'est pas un gzip de JSON lisible. */
export function decoderReleve(donneesGzB64: string): unknown | null {
  const octets = octetsGzip(donneesGzB64);
  if (!octets) return null;
  try {
    return JSON.parse(gunzipSync(octets, { maxOutputLength: DECODE_MAX_OCTETS }).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Un texte sur une ligne, sans balise ni caractère de contrôle, borné. */
function ligne(v: unknown, max: number): string {
  const t = String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

type Etat = "fini" | "cours" | "preuve" | "marc" | "bloque" | "afaire";
const LIBELLE: Record<Etat, string> = {
  fini: "terminée",
  cours: "en cours",
  preuve: "à prouver",
  marc: "attend Marc",
  bloque: "bloquée",
  afaire: "à faire",
};
const ORDRE: readonly Etat[] = ["fini", "cours", "preuve", "marc", "bloque", "afaire"];

/** L'état d'une tâche lu dans ses étiquettes GitHub (le relevé ne calcule pas l'état fin, c'est la page qui le fait). */
function etatDe(noeud: Objet): Etat {
  if (noeud.st !== "open") return "fini";
  const lb = Array.isArray(noeud.lb) ? noeud.lb.map(String) : [];
  if (lb.includes("preuve-attendue") || lb.includes("preuve-manquante")) return "preuve";
  if (lb.includes("qui:marc")) return "marc";
  if (lb.includes("bloqué")) return "bloque";
  if (lb.includes("en-cours") || lb.includes("jules")) return "cours";
  return "afaire";
}

function compter(etats: readonly Etat[]): string {
  const c: Partial<Record<Etat, number>> = {};
  etats.forEach((e) => {
    c[e] = (c[e] ?? 0) + 1;
  });
  return ORDRE.filter((e) => c[e]).map((e) => `${c[e]} ${LIBELLE[e]}`).join(", ");
}

function empreinte(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex").slice(0, 10);
}

/**
 * Les événements du chantier : une ligne par app, une par mission ouverte, au plus 50 (les missions les plus
 * chargées d'abord). Un relevé illisible donne une liste vide. PURE.
 */
export function evenementsChantier(releve: unknown, maintenant: Date): EvenementChantier[] {
  if (!estObjet(releve) || !Array.isArray(releve.repos)) return [];
  const date = maintenant.toISOString();
  const apps: EvenementChantier[] = [];
  const missions: { poids: number; e: EvenementChantier }[] = [];

  for (const repo of releve.repos) {
    if (!estObjet(repo) || typeof repo.repo !== "string" || !Array.isArray(repo.nodes)) continue;
    const rl = repo.repo.toLowerCase();
    const nom = ligne(repo.name ?? repo.repo, 40);
    const noeuds = repo.nodes.filter(estObjet);
    const parNumero = new Map<string, Objet>();
    noeuds.forEach((n) => parNumero.set(`${rl}#${String(n.n)}`, n));
    const taches = noeuds.filter((n) => n.l === "tâche");
    const missionsOuvertes = noeuds.filter((n) => n.l === "mission" && n.st === "open");

    const resumeApp = `${missionsOuvertes.length} mission${missionsOuvertes.length > 1 ? "s" : ""} ouverte${missionsOuvertes.length > 1 ? "s" : ""} ; ${taches.length} tâche${taches.length > 1 ? "s" : ""} : ${compter(taches.map(etatDe)) || "aucune"}.`;
    apps.push({
      type: TYPE_APP,
      date,
      titre: ligne(`${nom} : état du chantier`, TITRE_MAX),
      resume: ligne(resumeApp, RESUME_MAX),
      ref: `app:${rl}:${empreinte(resumeApp)}`,
      niveau: NIVEAU,
    });

    for (const m of missionsOuvertes) {
      const kids = (Array.isArray(m.k) ? m.k : [])
        .map((k) => parNumero.get(typeof k === "string" ? k.toLowerCase() : `${rl}#${String(k)}`))
        .filter((x): x is Objet => x !== undefined && x.l === "tâche");
      const etats = kids.map(etatDe);
      const aSuivre = kids
        .filter((k) => k.st === "open")
        .slice(0, 4)
        .map((k) => `« ${ligne(k.t, 50)} » ${LIBELLE[etatDe(k)]}`);
      const resume = `${kids.length} tâche${kids.length > 1 ? "s" : ""} : ${compter(etats) || "aucune"}.${aSuivre.length ? ` À suivre : ${aSuivre.join(" ; ")}.` : ""}`;
      missions.push({
        poids: kids.filter((k) => k.st === "open").length,
        e: {
          type: TYPE_MISSION,
          date,
          titre: ligne(`${nom} · mission #${String(m.n)} : ${ligne(m.t, 70)}`, TITRE_MAX),
          resume: ligne(resume, RESUME_MAX),
          ref: `m:${rl}#${String(m.n)}:${empreinte(resume)}`,
          niveau: NIVEAU,
        },
      });
    }
  }

  missions.sort((a, b) => b.poids - a.poids);
  return [...apps, ...missions.map((m) => m.e)].slice(0, EVENEMENTS_MAX);
}

/** Le corps de `POST /api/sorties`. L'app ne s'y lit jamais : MemoryAI la déduit du jeton (ADR 0015). PURE. */
export function corpsSorties(evenements: readonly EvenementChantier[]): { source: "sorties"; evenements: EvenementChantier[] } {
  return { source: "sorties", evenements: [...evenements] };
}
