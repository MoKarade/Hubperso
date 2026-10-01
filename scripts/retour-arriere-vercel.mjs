#!/usr/bin/env node
// Retour arrière de production (P5, étage a). Par défaut (`--essai`) : n'appelle RIEN pour
// modifier la production, affiche le plan. `--executer` appelle le rollback.
//
// API (OpenAPI officiel https://openapi.vercel.sh ; doc https://vercel.com/docs/instant-rollback) :
//   GET  /v7/deployments?projectId=…&target=production&state=READY&rollbackCandidate=true
//   POST /v1/projects/{projectId}/rollback/{deploymentId}   (rollback, corps vide)
// POST /v10/projects/{id}/promote/{deploymentId} sert à ANNULER un rollback (rétablit le
// déploiement automatique des domaines de production) : voir docs/prod-automatique.md.
// Plan Pro : tout déploiement déjà aliasé en production est éligible ; `--deploiement <uid>`
// le choisit, sinon le précédent prêt est pris (2e de la liste triée du plus récent au plus
// ancien ; le 1er est SUPPOSÉ être la production actuelle : la doc ne donne pas de champ
// « actuel » explicite, d'où l'affichage du plan avant tout appel).
//
// Entrées : jeton dans VERCEL_TOKEN seulement ; VERCEL_PROJECT_ID (ou --projet) ;
// VERCEL_TEAM_ID facultatif. Aucune de ces valeurs n'est affichée.
const API = "https://api.vercel.com";

export function choisirCible(deployments, idVoulu) {
  const prets = deployments
    .filter(
      (d) =>
        d.target === "production" &&
        (d.state ?? d.readyState) === "READY" &&
        d.isRollbackCandidate !== false,
    )
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  if (idVoulu) {
    const d = prets.find((x) => x.uid === idVoulu);
    if (!d) throw new Error("déploiement demandé introuvable parmi les déploiements de production prêts");
    return { actuel: prets[0], cible: d };
  }
  if (prets.length < 2) throw new Error("aucun déploiement de production précédent prêt");
  return { actuel: prets[0], cible: prets[1] };
}

const decrire = (d) =>
  `${d.uid} (${d.url ?? "url inconnue"}, créé ${d.created ? new Date(d.created).toISOString() : "?"})`;

/**
 * @param {{ env?: Record<string, string | undefined>, args?: string[],
 *           fetchImpl?: typeof fetch, sortie?: (ligne: string) => void }} [params]
 */
export async function executer({
  env = process.env,
  args = [],
  fetchImpl = fetch,
  sortie = (l) => console.log(l),
} = {}) {
  const reel = args.includes("--executer") && !args.includes("--essai");
  const i = args.indexOf("--deploiement");
  const idVoulu = i >= 0 ? args[i + 1] : undefined;
  const j = args.indexOf("--projet");
  const projet = (j >= 0 ? args[j + 1] : undefined) ?? env.VERCEL_PROJECT_ID;
  const jeton = env.VERCEL_TOKEN;
  if (!jeton) throw new Error("VERCEL_TOKEN absent");
  if (!projet) throw new Error("projet manquant : VERCEL_PROJECT_ID ou --projet");

  const equipe = env.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : "";
  const entetes = { authorization: `Bearer ${jeton}` };
  const liste = await fetchImpl(
    `${API}/v7/deployments?projectId=${encodeURIComponent(projet)}&target=production&state=READY&rollbackCandidate=true&limit=20${equipe}`,
    { headers: entetes, signal: AbortSignal.timeout(15_000) },
  );
  if (!liste.ok) throw new Error(`liste des déploiements : HTTP ${liste.status}`);
  const { deployments = [] } = await liste.json();
  const { actuel, cible } = choisirCible(deployments, idVoulu);

  sortie(`Production actuelle (supposée) : ${decrire(actuel)}`);
  sortie(`Cible du retour arrière        : ${decrire(cible)}`);
  if (!reel) {
    sortie("Mode essai : aucun rollback appelé. Ajouter --executer pour appliquer.");
    return 0;
  }
  const equipeQ = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : "";
  const res = await fetchImpl(
    `${API}/v1/projects/${encodeURIComponent(projet)}/rollback/${encodeURIComponent(cible.uid)}${equipeQ}`,
    { method: "POST", headers: entetes, signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) throw new Error(`rollback refusé : HTTP ${res.status}`);
  sortie(
    "Retour arrière demandé. Les déploiements automatiques sont suspendus : pour les rétablir, promouvoir un déploiement (docs/prod-automatique.md).",
  );
  return 0;
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await executer({ args: process.argv.slice(2) });
  } catch (err) {
    console.error(`Retour arrière : ${err.message}`);
    process.exitCode = 1;
  }
}
