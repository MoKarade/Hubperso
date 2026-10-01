// Décision du workflow fumee-prod.yml (P5.2) : faut-il tenter un retour arrière ?
// Logique pure, testée dans tests/fumeeProd.test.ts. Aucun réseau, aucun secret.
//
// ANTI-BOUCLE. Un retour arrière relance un `deployment_status` (Vercel redéploie l'alias),
// donc la fumée se relance sur la version restaurée. Règle : UN SEUL retour arrière par alerte.
// Tant qu'une issue `prod-rouge` est ouverte, le workflow n'en déclenche jamais un second et ne
// crée pas de doublon d'issue : un humain ferme l'issue quand la production est rétablie.
// Une fumée verte ne déclenche jamais rien (un déploiement de rollback sain n'a rien à signaler).

export const ETIQUETTE = "prod-rouge";

/**
 * @param {{ fumeeOk: boolean, issuesOuvertes: number }} p
 * @returns {{ action: "rien" | "retour-arriere-et-alerte" | "alerte-existante" }}
 */
export function decider({ fumeeOk, issuesOuvertes }) {
  if (fumeeOk) return { action: "rien" };
  if (issuesOuvertes > 0) return { action: "alerte-existante" };
  return { action: "retour-arriere-et-alerte" };
}

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Entrées par variables d'environnement seulement (jamais interpolées dans le YAML).
  const r = decider({
    fumeeOk: process.env.FUMEE_OK === "true",
    issuesOuvertes: Number.parseInt(process.env.ISSUES_OUVERTES ?? "0", 10) || 0,
  });
  console.log(`Décision : ${r.action}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `action=${r.action}\n`);
}
