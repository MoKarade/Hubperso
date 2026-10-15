Approbation : revue de PR par pole-securite

# CI de Hubperso sur la place du PC (prives-ci-pc, volet 1)

Source : plan `rapports/plan-hubperso-ci-pc.md` approuvé par pole-securite avec conditions (a à f). Cette spec fixe ce que la PR `.github` doit faire. Aucun minute GitHub payante : les contrôles tournent sur la place `[self-hosted, windows, atelier-pc]`.

## Mécanique
- Tous les jobs de `ci.yml`, `doc-a-jour.yml`, `constellation.yml`, `fumee-prod.yml`, `releve.yml` (et `ci-reutilisable.yml` s'il est encore appelé) passent à `runs-on: [self-hosted, windows, atelier-pc]`, `shell: pwsh`, `permissions: contents: read`.
- **Garde d'échec fermé** (condition a, b) : première étape de chaque job, avant tout checkout, script `pwsh` identique partout. Elle échoue si le dépôt n'est pas privé, ou si l'événement est `pull_request*` et que le dépôt de la tête (`head.repo.full_name`) diffère du dépôt (valeur vide = échec). Les étapes suivantes ne tournent que si elle réussit. Pas de `if:` au niveau du job : un job « skipped » compte comme réussi pour un contrôle requis et laisserait fusionner sans contrôle.
- **Noms des 5 contrôles requis inchangés** (condition f) : « Gate (typecheck · tests · lint · build) », « Qualité (lint · couverture · code mort · architecture) », « Sécurité (secrets · analyse statique) », « Audit des dépendances de production », « La doc suit le code ».
- **Outils** (condition c) : gitleaks 8.28.0, binaire officiel `gitleaks_8.28.0_windows_x64.zip`, SHA-256 `da6458e8864af553807de1c46a7a8eac0880bd6b99ba56288e87e86a45af884f` (identique au `checksums.txt` officiel), téléchargé dans le job, vérifié, jamais en administrateur, jamais `pip install`.
- **Secrets** (condition d) : seulement dans `releve.yml` et `fumee-prod.yml` (schedule, dispatch ou déploiement de main), `constellation.yml` (schedule, dispatch). Jamais sur `pull_request`.
- **gate** : la vérification d'empreinte de `docs/COMPTE-RENDU.md` passe de `sha256sum -c` à `Get-FileHash` (même empreinte attendue).
- **fumee-prod** : écritures `GITHUB_OUTPUT` en `Out-File -Append -Encoding utf8` ; **alerte « passage manquant »** (condition e) quand aucun passage n'a eu lieu depuis plus de 60 min.
- **releve** : `curl` bash remplacé par `Invoke-RestMethod`/`curl.exe`, mêmes plafonds (120 s, 2 redirections), `CRON_SECRET` inchangé.

## Semgrep (décision de pole-securite, relayée par le gérant)
Semgrep n'a pas de binaire officiel Windows, mais la roue officielle `win_amd64` de Semgrep 1.180.0 existe sur PyPI. Conditions :
- a) un venv créé dans le dossier temporaire de la fente (job), jamais installé en permanence ;
- b) fichier verrouillé avec les hashes de semgrep et de toutes ses dépendances (`pip-compile --generate-hashes`), installé avec `--require-hashes --only-binary=:all:` ;
- c) règles versionnées dans le dépôt Hubperso, jamais `--config p/...` ni `auto`, et `--metrics=off` ;
- d) si la première exécution échoue pour une raison propre à Windows : retirer Semgrep et refaire le contrôle « Sécurité » avec gitleaks + audit des dépendances. Jamais un job sauté qui compte comme vert.
- gitleaks : le SHA-256 du fichier de sommes officiel (`gitleaks_8.28.0_checksums.txt`) est figé dans le workflow, en plus de celui du zip.

## Points ouverts
1. **Coupure du forking** (`allow_forking=false` sur Hubperso) : refusée par le classificateur ; reste à Marc (décision du gérant). Le tri anti-fork de la boucle du runner (head_repository == dépôt) reste la barrière principale.
3. **Droit d'éditer `.github`** : en attente du clic de Marc (carte dr-code-workflows-hubpc).

## Conditions
- PR `.github` NON armée ; armement après attestation de pole-securite.
- Aucune minute GitHub payante ; la place doit être enregistrée pour Hubperso (volet 2, PR atelier, `runner.json`) et son jeton posé par le gérant.

## Critères vérifiables
1. `tests/gardeCiPc.test.ts` : chaque job a la garde en 1re étape, texte identique, `runs-on` place du PC, `permissions: contents: read`, les 5 noms de contrôles inchangés, aucun secret dans un workflow `pull_request`.
2. La garde, exécutée sous `pwsh` avec des variables d'environnement variées, échoue pour dépôt public, fork, tête vide ; réussit pour dépôt privé et même dépôt.
3. Gate local vert : `npm run typecheck && npm run test && npm run lint && npm run build`.
4. Une PR doc seule voit les 5 contrôles verts sur la place ; `python agence/runs_github_audit.py --heures 24` code 0 pour MoKarade/Hubperso.
