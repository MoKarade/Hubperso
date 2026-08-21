# BACKLOG — Hubperso

Ce qui est décidé mais pas fait. Un item peut être **périmé** (réglé ailleurs) : vérifier
l'état réel avant de coder.

## À faire

- **[H-05] Propager l'auto-merge aux sept autres dépôts.** Livré ici le 21/08
  (`scripts/autoMerge.mjs` + `.github/workflows/auto-merge.yml`). L'auto-merge NATIF de
  GitHub n'est pas utilisable : il demande un plan payant sur les dépôts privés, et les huit
  le sont. D'où un workflow — mais réécrit, pas copié de DriveAI : le sien se déclenchait sur
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

- ~~Accès par app (base Neon, `POST /api/acces`, `/administration`, `exigerAccesHub`)~~ —
  étape 2, PRs #28 à #33.
- ~~Le total des coûts en évidence sur `/couts`, avec la raison quand il y en a deux~~ —
  PR #33.
- ~~Remettre la doc d'accès à jour~~ — PR #34. Quatre fichiers décrivaient le modèle d'avant.
- ~~Aligner la structure sur la convention commune~~ — 20/08/2026.
