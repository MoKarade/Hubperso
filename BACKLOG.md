# BACKLOG — Hubperso

Ce qui est décidé mais pas fait. Un item peut être **périmé** (réglé ailleurs) : vérifier
l'état réel avant de coder.

## À faire

- **[H-18] `build-necessaire.sh` ne voit jamais une variable d'environnement changée
  sur Vercel.** Incident du 01/09/2026 : le secret OAuth Google a été mis à jour dans
  Vercel après une panne de connexion, mais le dernier commit sur `main` (#48) ne touchait
  que de la doc. `build-necessaire.sh` juge uniquement le diff git — il a donc annulé DEUX
  tentatives de « Redeploy » d'affilée (« build ignoré : documentation et tests uniquement »)
  pendant que le site continuait de servir l'ancien secret invalide. Le script n'a aucun
  moyen de voir qu'une variable Vercel a bougé : ce n'est pas dans git.
  Débloqué en urgence par un commit de code trivial (celui-ci) pour forcer une vraie
  reconstruction. Reste à trancher, sans urgence : ajouter au script un avertissement
  visible sur `Redeploy` d'un commit doc-only (« si tu changes une variable d'env, ce
  bouton ne fera rien »), ou documenter la procédure de contournement (pousser un commit
  de code trivial) dans le HANDOVER.

### Demande de Marc du 21/08/2026 — cartes, coûts, ouverture des apps

⚠️ **À lire avant de coder l'un de ces items.** La plupart de ce que Marc a demandé n'est PAS
du travail de hub : c'est du contenu que **l'app doit publier dans son summary**. Le principe
n°1 de ce dépôt — *le hub ne connaît AUCUNE app en particulier* — n'est pas négociable, et
une carte FinanceAI plus riche se code **dans FinanceAI**, pas ici. Chaque item porte donc
son lieu : `[HUB]` ce dépôt · `[APP]` le dépôt de l'app · `[CONTRAT]` `hub-contract`.

⚠️ **Contrainte dure du contrat, à connaître avant de promettre quoi que ce soit :**
`metrics` est plafonné à **6 par app**, `alerts` à 10, `actions` à 6. La liste de FinanceAI
ci-dessous en demande six à elle seule — il n'y a pas de septième place, et « liquidités PAR
COMPTE » n'entre pas dans une métrique unique sans choix éditorial.

- [ ] **[H-09] [HUB] Coûts et quotas détaillés, avec l'évolution dans le temps.** Au clic sur
  « détails » d'une app : graphique de l'évolution de son coût ; sinon, le prix sur 7 jours.
  Une bonne partie du socle existe déjà — `lib/historique.ts` (`serieCout`, `serieMetrique`,
  PURES) et `lib/historiqueDb.ts` archivent un relevé par app toutes les 15 min sur 90 jours.
  Reste le rendu. ⚠️ `serieCout` prend une `periode` ET une `devise` **exprès** : ne jamais
  tracer une courbe qui mélange `total`, `mois` et `jour` — c'est le principe « jamais
  d'agrégat entre unités incomparables » appliqué au temps.

- [ ] **[H-10] [HUB] Un bouton d'ouverture d'app plus simple et plus visible.** Purement du
  rendu, aucune dépendance au contrat : l'`app.url` est déjà dans chaque summary.

- [ ] **[H-11] [CONTRAT] Comment une app dit QUELLE métrique est la principale.** Plusieurs
  demandes ci-dessous supposent qu'une valeur domine la carte (la charge pour CarAI, le
  patrimoine pour FinanceAI). Le contrat n'a aucun moyen de l'exprimer : le hub afficherait
  six métriques de même poids. Champ additif à concevoir dans `hub-contract` — sans lui,
  `[H-09]` et les cartes plus riches se font au jugé, donc mal.

- [ ] **[H-12] [CONTRAT] Une app peut-elle publier une RECOMMANDATION ?** Marc demande « voir
  recommandation directe » pour FinanceAI. Aujourd'hui ça passerait par une `alert` de
  sévérité `info`, ce qui la range visuellement avec les problèmes. À trancher : détourner
  `alerts`, ou ajouter un champ. ⚠️ Ne pas trancher seul — c'est le contrat, six consommateurs.

#### Ce qui relève des APPS, pas de ce dépôt (à propager sur feu vert de Marc)

- [ ] **[H-13] [APP] FinanceAI** — publier : gagné/dépensé aujourd'hui · rendement du jour des
  placements · total des placements avec l'écart en % et en $ depuis le début · dette restante
  (nette de ce qui est déjà payé) · liquidités par compte · une recommandation.
  ⚠️ Six métriques demandées pour un plafond de six : « liquidités par compte » devra être
  agrégée, ou passer par la page de détail de FinanceAI.
- [ ] **[H-14] [APP] DriveAI** — publier : avancement de chaque mission de tri · nombre de
  documents classés sur 7 jours · dernier fichier classé · nombre d'erreurs.
- [ ] **[H-15] [APP] BatchChef** — publier : recettes recommandées · recette active · nombre
  d'aliments restant à acheter et leur prix.
- [ ] **[H-16] [APP] CarAI** — publier : charge **et si la voiture est en train de charger**
  (un état, pas seulement un pourcentage) · bail consommé · autonomie · odomètre.
- [ ] **[H-17] [APP] CarAI, hors hub** — refaire l'ACCUEIL de CarAI autour de la voiture :
  ouvrants, pression des pneus, verrouillage. C'est une page de CarAI, le hub n'y touche pas.
- **JobAI** — rien à faire, Marc : « looks good déjà ».

- **[H-04] Propager le contrôle « doc à jour » aux sept autres dépôts.** Livré ici le
  21/08 (`scripts/docAJour.mjs` + `.github/workflows/doc-a-jour.yml`), volontairement sur UN
  seul dépôt d'abord : la première version était aveugle au format de backlog de Hubperso —
  celui-là même où elle a été écrite — et serait passée au vert sans rien vérifier. Les
  trois formats du parc sont désormais gérés (backticks, crochets, tableau emoji), mais
  chaque dépôt doit être vérifié sur ses VRAIS commits avant d'y activer le blocage. Ordre
  proposé : CarAI et BatchChef (proches de Hubperso), puis JobAI et FinanceAI, puis DriveAI
  (auto-merge : un contrôle mal réglé y bloquerait tout).

  ⚠️ **Deuxième angle mort corrigé le 21/08 au soir** : `idDeSujet` n'acceptait qu'UN seul
  identifiant en tête de sujet — elle exigeait une espace après le crochet fermant, donc
  `[H-06][H-07] …` ne portait aucun id à ses yeux et le contrôle bloquait un commit
  parfaitement conforme, en affirmant l'inverse de la vérité. Or un commit qui ferme deux
  items est un usage courant du parc (FinanceAI écrit `[FX-A][RETIREMENT-B] …`).
  Trouvé, comme le premier, **en appliquant le contrôle à sa propre PR** — c'est le seul
  moyen qui marche. Trois tests de régression, prouvés discriminants (2 échecs si on remet
  l'ancien motif).

  ⚠️ **Troisième angle mort, le plus sérieux, corrigé dans la foulée** : `entreeTouchee`
  exigeait que l'identifiant figure DANS une ligne modifiée. Or mettre une entrée à jour,
  c'est écrire dans son CORPS — cocher, dater, ajouter une raison — sans retaper l'id, qui
  vit sur la ligne de titre restée inchangée. Le contrôle refusait donc **exactement le
  geste qu'il est censé encourager**, en affirmant « la tâche a avancé sans que son entrée
  ne soit relue » alors qu'elle venait de l'être. `entreesTouchees` situe désormais chaque
  ligne modifiée dans le BLOC auquel elle appartient (en-têtes `@@` + contenu du fichier).
  Et quand le diff n'a pas d'en-tête `@@`, elle ne répond pas « rien n'est touché » — elle
  ne SAIT pas, et retombe sur le critère littéral : « je ne sais pas » ne doit jamais
  devenir « non », surtout quand ce non refuse une PR.

  **Leçon à emporter avant chaque propagation** : ce script se valide sur les VRAIS commits
  et les VRAIS backlogs du dépôt visé, jamais sur ce qu'on croit qu'ils sont. Trois angles
  morts, trois fois découverts en s'en servant pour de vrai, zéro fois par relecture.

- **[H-08] Deux avertissements de lint dans `tests/autoMerge.test.ts`.** `isDraft` et
  `isCrossRepository` assignés sans être utilisés (lignes 75 et 86). 0 erreur, le gate passe
  — c'est du bruit, pas une panne. Découvert le 21/08 en passant le gate pour [H-06]/[H-07] ;
  laissé tel quel, c'est du périmètre non demandé.

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
