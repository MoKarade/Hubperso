# Coûts CI — crons autorisés et budget minutes

Dépôt privé, GitHub Free : **2 000 minutes d'Actions par mois** (épuisées le 23/09/2026).
Règle : chiffres MESURÉS seulement ; un chiffre non mesuré est écrit « à mesurer ». Les
« plafonds théoriques » sont un calcul (passages demandés par le cron), pas une mesure : GitHub
étale les `schedule` sous charge et en saute (mesuré sur CarAI le 14/09/2026 : ~15 passages par
jour au lieu de 48).

## Les quatre crons

| Workflow | Cron | Plafond théorique | Coût mesuré | Rôle |
|---|---|---|---|---|
| `releve.yml` | `0 * * * *` | 24 runs/jour, ~720/mois | à mesurer | Relevé du hub (historique, détection de gel). |
| `auto-merge.yml` | `23 9 * * *` | 30 runs/mois | à mesurer (auto-merge ≈ 26 % de la consommation en 09/2026, mesuré avant le passage au quotidien) | Filet quotidien. Sortie immédiate, sans checkout ni Node, s'il n'y a aucune PR ouverte. Le réveil principal est événementiel (`workflow_run`, `status`, `check_run`, `pull_request_target`). |
| `constellation.yml` | `0 * * * *` | 24 runs/jour, ~720/mois | à mesurer | Cohérence des 6 apps (`npm run outil:constellation`). |
| `ci.yml` (job `audit`) | `0 12 * * 1` | ~4 runs/mois | à mesurer | `npm audit --omit=dev` hebdomadaire — mais ce job tourne aussi à CHAQUE push et PR (pas de garde `if: github.event_name != 'schedule'` comme `gate`/`qualité`/`sécurité`), donc son vrai coût mensuel dépend du volume de PR, pas seulement du cron. |

**`releve.yml` ET `constellation.yml` passés de `*/30`/`17 11 * * *` à l'horaire (`0 * * * *`)
le 28/09/2026, sur autorisation explicite de Marc donnée EN SESSION à hubperso-code** (pas un
message relayé — la demande relayée plus tôt le même jour avait été laissée de côté par
prudence, le temps de cette confirmation directe). Plafond théorique multiplié par 2 pour
`releve.yml` (~1 440 → ~720/mois, donc une RÉDUCTION) et par 24 pour `constellation.yml` (~30 →
~720/mois, une augmentation, assumée pour unifier les deux horloges). `CADENCE_HORLOGE_MS`
(`lib/gel.ts`) porte la même valeur d'une heure, changée dans le même lot — sinon la détection
de « trou » (`continuite`, `lib/gel.ts`) jugerait avec la mauvaise référence et signalerait des
trous qui n'en sont pas.

## Autres déclencheurs

- `ci.yml` et `doc-a-jour.yml` : `pull_request` ; `ci.yml` aussi `push` sur `main` seulement (pas de
  double run push + PR). Concurrence avec annulation des runs périmés.
- `ci.yml` — **voie rapide doc seule** (coût CI) : sur une PR qui ne touche QUE des fichiers
  `**/*.md` ou `docs/**`, les jobs `gate`, `qualité` et `audit` sont sautés. **Jamais** le job
  `Sécurité` (secrets, analyse statique) ni « La doc suit le code » (`doc-a-jour.yml`, workflow
  séparé) — ceux-là tournent toujours. La décision se fait par un job dédié (`fichiers`, sur les
  fichiers réellement changés via `gh pr diff`) et une condition `if:` sur chacun des trois jobs
  concernés, jamais par `paths:` sur le déclencheur : `paths:` empêcherait un contrôle requis de
  tourner sur une PR de code et la bloquerait (règle de l'Atelier).
- Aucun check requis n'est filtré par `paths:` sur son propre déclencheur.
- Épinglage par SHA de commit (le tag reste en commentaire) : `auto-merge.yml`,
  `armement-auto-merge.yml`, `ci-reutilisable.yml` (kit auto-merge), `constellation.yml` et
  `doc-a-jour.yml`. **`ci.yml` n'est PAS encore épinglé** (`actions/checkout@v7`,
  `actions/setup-node@v7`, `actions/setup-python@v7`, `actions/upload-artifact@v7`) — hors
  périmètre de cette PR, à faire séparément. `releve.yml` n'a aucune action `uses:` (il ne fait
  que `curl`), rien à épingler. Dependabot (écosystème `github-actions`, hebdomadaire) propose
  les mises à jour des actions déjà épinglées.

## Règle

Ajouter ou accélérer un cron = mettre ce tableau à jour dans la même PR, avec le coût.
