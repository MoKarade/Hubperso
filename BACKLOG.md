# BACKLOG — Hubperso

Ce qui est décidé mais pas fait. Un item peut être **périmé** (réglé ailleurs) : vérifier
l'état réel avant de coder.

## À faire

- **[H-04] Propager le contrôle « doc à jour » aux sept autres dépôts.** Livré ici le
  21/08 (`scripts/docAJour.mjs` + `.github/workflows/doc-a-jour.yml`), volontairement sur UN
  seul dépôt d'abord : la première version était aveugle au format de backlog de Hubperso —
  celui-là même où elle a été écrite — et serait passée au vert sans rien vérifier. Les
  trois formats du parc sont désormais gérés (backticks, crochets, tableau emoji), mais
  chaque dépôt doit être vérifié sur ses VRAIS commits avant d'y activer le blocage. Ordre
  proposé : CarAI et BatchChef (proches de Hubperso), puis JobAI et FinanceAI, puis DriveAI
  (auto-merge : un contrôle mal réglé y bloquerait tout).

- **[H-05] Propager l'auto-merge aux sept autres dépôts.** Livré ici le 21/08
  (`scripts/autoMerge.mjs` + `.github/workflows/auto-merge.yml`). ⚠️ **Correction du 21/08 au soir : la raison invoquée ici était fausse.**
  Ce point disait que l'auto-merge NATIF de GitHub était inutilisable, faute de plan payant
  sur des dépôts privés. Il a pourtant été armé avec succès sur FinanceAI#689 le 21/08 à
  17:53, en squash, et la PR a fusionné seule. Le diagnostic de départ ne tenait pas.
  Le workflow reste néanmoins justifié — il refuse par défaut, connaît les quotas et se teste
  sans réseau — mais on ne le garde plus « parce que le natif est impossible ». D'où un workflow — mais réécrit, pas copié de DriveAI : le sien se déclenchait sur
  le succès du seul workflow « CI » et ignorait les autres, ce qui aurait mergé une PR dont
  le contrôle de doc avait échoué. Chaque dépôt demande une vérification propre : DriveAI
  dispatche `deploy.yml` après le merge (le moteur Apps Script), BatchChef a sa racine dans
  `web/`. Ne pas copier en lot.

- **[H-01] Re-pinner le contrat sur `#v1.1.0`.** Le tag existe depuis le 20/08/2026 et
  pointe `3bbbf19`. Le dépôt épingle encore le SHA `2d37a61` — **valide** (le schéma est
  identique entre les deux, seuls des commentaires ont bougé), mais un tag se lit mieux
  qu'un SHA. À faire au prochain besoin de re-pin, pas dans l'urgence.

- **[H-02] Décider ce qu'on affiche quand une app publie une période isolée.**
  `aggregateUsage` somme par période et `pourquoiPasDeTotalUnique` explique pourquoi il n'y
  a pas UN total. Depuis que DriveAI et JobAI publient `total`, toutes les apps suivies sont
  alignées — la note ne s'affiche donc plus. Elle reste juste et utile le jour où une app
  repassera à `mois`, mais rien ne le teste en conditions réelles.

- **[H-03] Aucune app ne publie encore d'action `trigger`.** Le hub sait en exécuter une
  depuis le 20/08 (ADR 0002) : verrous SSRF posés, testés, et le bouton apparaît tout seul
  dès qu'une app en publie. Côté hub il n'y a donc **rien à faire de plus** — l'étape
  suivante est chez une app, et c'est un choix délibéré, app par app. Le candidat le plus
  évident est DriveAI (relancer une campagne en pause), justement parce qu'une campagne
  arrêtée au frein est passée inaperçue deux semaines. À ratifier avec Marc avant de livrer
  la première : c'est le moment où le hub cesse d'être en lecture seule pour de bon.

## Fait

- ~~**[H-06]** Plafonner les jobs de CI (`timeout-minutes`)~~ — 21/08/2026. La §5 de
  `CLAUDE.md` le prescrit depuis l'incident DriveAI du 19/08 ; ce dépôt ne le faisait pas.
  `gate` à 15 min, `audit` à 10 min, calibrés sur les durées réellement observées (1 min 36 s
  et 29 s), pas sur un chiffre choisi au hasard.
- ~~**[H-07]** Cesser de consommer le quota Vercel avec des PR de branche~~ — 21/08/2026.
  `git.deploymentEnabled: { "claude/*": false }` dans `vercel.json`. Le quota (100/jour,
  **partagé entre les six projets**) a été épuisé le 21/08 par huit PR de documentation.
  ⚠️ `scripts/build-necessaire.sh` ne protégeait **pas** de ça : il tourne en `ignoreCommand`,
  donc PENDANT le déploiement, alors que le refus tombe à sa CRÉATION. Il économise du temps
  de build, pas du quota. Croire l'inverse laissait le trou ouvert en pensant l'avoir bouché.

- ~~Accès par app (base Neon, `POST /api/acces`, `/administration`, `exigerAccesHub`)~~ —
  étape 2, PRs #28 à #33.
- ~~Le total des coûts en évidence sur `/couts`, avec la raison quand il y en a deux~~ —
  PR #33.
- ~~Remettre la doc d'accès à jour~~ — PR #34. Quatre fichiers décrivaient le modèle d'avant.
- ~~Aligner la structure sur la convention commune~~ — 20/08/2026.
