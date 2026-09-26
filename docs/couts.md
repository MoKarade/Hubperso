# Coûts CI — crons autorisés et budget minutes

Dépôt privé, GitHub Free : **2 000 minutes d'Actions par mois** (épuisées le 23/09/2026).
Règle : chiffres MESURÉS seulement ; un chiffre non mesuré est écrit « à mesurer ». Les
« plafonds théoriques » sont un calcul (passages demandés par le cron), pas une mesure : GitHub
étale les `schedule` sous charge et en saute (mesuré sur CarAI le 14/09/2026 : ~15 passages par
jour au lieu de 48).

## Les quatre crons

| Workflow | Cron | Plafond théorique | Coût mesuré | Rôle |
|---|---|---|---|---|
| `releve.yml` | `*/30 * * * *` | 48 runs/jour, ~1 440/mois | à mesurer | Relevé du hub (historique, détection de gel). Fonctionnel : NON réduit sans décision de Marc (« au mieux toutes les 30 min »). |
| `auto-merge.yml` | `23 9 * * *` | 30 runs/mois | à mesurer (auto-merge ≈ 26 % de la consommation en 09/2026, mesuré avant le passage au quotidien) | Filet quotidien. Sortie immédiate, sans checkout ni Node, s'il n'y a aucune PR ouverte. Le réveil principal est événementiel (`workflow_run`, `status`, `pull_request_target`). |
| `constellation.yml` | `17 11 * * *` | 30 runs/mois | à mesurer | Cohérence des 6 apps (`npm run outil:constellation`). |
| `ci.yml` (job `audit`) | `0 12 * * 1` | ~4 runs/mois | à mesurer | `npm audit --omit=dev` hebdomadaire. |

## Autres déclencheurs

- `ci.yml` et `doc-a-jour.yml` : `pull_request` ; `ci.yml` aussi `push` sur `main` seulement (pas de
  double run push + PR). Concurrence avec annulation des runs périmés.
- Aucun check requis n'est filtré par `paths:` (il ne tournerait pas et la PR resterait bloquée).
- Toutes les actions sont épinglées par SHA de commit (le tag est en commentaire) ; Dependabot
  (écosystème `github-actions`, hebdomadaire) propose les mises à jour.

## Règle

Ajouter ou accélérer un cron = mettre ce tableau à jour dans la même PR, avec le coût.
