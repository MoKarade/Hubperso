# Production automatique : fumée et retour arrière (P5, étage a)

## Ce que couvre la v1
Un test de fumée HTTP + JSON : `npm run fumee` sonde 5 URL publiques de `https://hubperso.com`
(liste dans `scripts/fumee.json`) : 200 attendu ; `/api/sante` doit rendre `{ok:true}` (un 200 avec
`ok:false` est une PANNE). Délai 10 s, 2 essais espacés de 10 s. Le parcours navigateur (Playwright)
arrive avec P4. Pour viser une préversion : `npm run fumee -- --url-base https://<déploiement>`.

## Lire une alerte
Ligne `PANNE <url> — <cause>` : `HTTP 5xx` ou `délai dépassé` = site ou Vercel ; `ok:false (cause base)`
= base Neon ; `(cause configuration)` = une variable requise manque (les noms sont dans les journaux
Vercel). Relancer une fois à la main : `npm run fumee`. Deux pannes de suite = retour arrière.

## Retour arrière à la main
1. Plan sans rien appeler (mode essai, par défaut) :
   `VERCEL_TOKEN=… VERCEL_PROJECT_ID=… node scripts/retour-arriere-vercel.mjs`
   (jeton lu dans `VERCEL_TOKEN` seulement ; `VERCEL_TEAM_ID` si l'équipe l'exige).
2. Vérifier la cible affichée, puis ajouter `--executer` (`--deploiement <uid>` pour choisir un autre
   déploiement de production prêt : le plan Pro permet n'importe lequel déjà aliasé en production).
3. Après un rollback, Vercel suspend le déploiement automatique des domaines : pour le rétablir,
   promouvoir un déploiement (tableau de bord « Undo Rollback », ou `vercel promote <id>`).
Alternative sans script : tableau de bord Vercel, « Instant Rollback ».

Sources : <https://vercel.com/docs/instant-rollback> ; OpenAPI <https://openapi.vercel.sh>
(`POST /v1/projects/{projectId}/rollback/{deploymentId}`, `GET /v7/deployments`).
Le script suppose que le déploiement de production le plus récent prêt est l'actuel.

## Désactiver
Retirer le workflow qui appelle `npm run fumee` (ajouté séparément, hors de cette PR) ; les scripts
eux-mêmes ne font rien tout seuls.
