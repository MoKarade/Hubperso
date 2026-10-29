# Production automatique : fumée et retour arrière (P5, étage a)

## Ce que couvre la v1
Un test de fumée HTTP + JSON : `npm run fumee` sonde 5 URL publiques de `https://hubperso.com`
(liste dans `scripts/fumee.json`) : 200 attendu ; `/api/sante` doit rendre `{ok:true}` (plus `commit`, les 7 premiers caractères du SHA servi) (un 200 avec
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

## Automatique : `.github/workflows/fumee-prod.yml` (P5.2)
Après chaque déploiement Production réussi (événement `deployment_status`, état `success`, environnement
`Production`), le workflow lance `node scripts/fumee.mjs` (2 essais par URL). Si c'est rouge : retour arrière
Vercel EN VRAI (`retour-arriere-vercel.mjs --executer`, jeton dans cette étape seulement), puis une issue
`prod-rouge` au texte fixe (SHA court, état, lien du run : jamais de contenu de réponse). Pas de PR
d'annulation automatique (étape suivante : identité de l'App + avis de pole-securite).
- Lire l'alerte : ouvrir l'issue `prod-rouge`, suivre le lien du run (la ligne `PANNE <url> — <cause>`, voir
  plus haut). Après un rollback, rétablir le déploiement automatique (voir « Retour arrière à la main », 3).
- Anti-boucle : un rollback relance un `deployment_status`. Règle (testée, `scripts/fumee-decision.mjs`) :
  UN seul retour arrière par alerte ; tant qu'une issue `prod-rouge` est ouverte, aucun second rollback et
  aucun doublon. Fumée verte = rien. FERMER l'issue quand la production est rétablie, sinon la garde reste armée.
- Le projet Vercel se lit dans la variable de dépôt `VERCEL_PROJECT_ID` (défaut : `hubperso`, nom accepté par
  l'API) ; `VERCEL_TEAM_ID` facultative.
- Essai prévu sur CarAI, avec Marc présent, pas sur Hubperso.

## Désactiver
Supprimer `.github/workflows/fumee-prod.yml` ; les scripts eux-mêmes ne font rien tout seuls.
