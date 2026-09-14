# BACKLOG — Hubperso

Ce qui est décidé mais pas fait. Un item peut être **périmé** (réglé ailleurs) : vérifier
l'état réel avant de coder.

## À faire

- **[H-20] Next 15.5.22 → 15.5.25 : RCE critique NON AUTHENTIFIÉE, et le chemin visé est
  public par conception.** Deux avis parus entre le 07/09 (dernier audit hebdomadaire vert
  sur `main`) et le 14/09, **sans qu'une ligne du dépôt n'ait changé** — exactement le
  scénario pour lequel le job `audit` existe.
  - `next` ≤ 15.5.23 — **critique** : GHSA-2xp9-vwfh-vxw4, exécution de code à distance non
    authentifiée dans l'API d'optimisation d'images quand des fichiers AVIF sont utilisés.
    ⚠️ Ce n'est PAS théorique ici : `isPublicPath` laisse passer `/_next/image` **exprès**
    (c'est requis pour que les images se chargent), donc le point d'entrée est joignable
    sans session sur hubperso.com. L'autre avis, GHSA-p293-qw3h-jr36, ne vise que les
    serveurs Windows et ne s'applique pas à Vercel.
  - `sharp` < 0.35.4 — **haute** : GHSA-rgj7-g3m4-5g8c (libheif), dépendance de
    l'optimisation d'images de Next.

  Corrigé le 14/09 par `npm audit fix` : **lockfile uniquement**, `package.json` inchangé
  (`next: "^15.5.22"` résout désormais 15.5.25, `sharp` 0.35.4). `npm audit --omit=dev` :
  0 vulnérabilité. Gate rejoué entier après le bump.
  Établi comme PRÉEXISTANT avant d'agir, pas supposé : l'audit rejoué sur `origin/main`
  dans un worktree séparé rend les deux mêmes avis, à l'identique.
  ⚠️ Ça change ce qui est SERVI (Next lui-même) : vérifier le déploiement de production
  après le merge, pas seulement la CI (§6).

- **[H-22] Le message de la page « attention » envoyait refaire un geste déjà fait.**
  Capture de Marc du 14/09 au soir : l'encadré « Ce que le hub a pu observer » affichait
  « il faut les secrets `HUB_URL` et `CRON_SECRET` » alors que les deux étaient **posés et
  corrects**. La vraie cause était la VALEUR de `HUB_URL` — l'apex, qui redirige en 308 vers
  `www`, et `curl` retire l'en-tête `Authorization` dès que l'hôte change (401 « secret
  refusé »). Le message accusait donc le premier suspect, qui était innocent, et laissait la
  cause invisible.
  C'est le défaut que cette page existe pour combattre, commis par cette page. **Livré** :
  l'encadré ne devine plus, il renvoie au dernier run du workflow `Relevé`, qui NOMME le
  blocage (401 vs 503) et compare les deux hôtes depuis [H-19].

- **[H-21] L'auto-merge était MORT, et c'est pour ça que cinq PR ont dû être fusionnées à
  la main.** Mesuré le 14/09 : les runs 361 à 364 d'`auto-merge.yml` ont TOUS échoué entre
  18h53 et 19h42 Z — passes planifiées et `pull_request_target` comprises — sur
  « Resource not accessible by integration (…**checkSuite.workflowRun**) ». Cinq essais,
  échec fermé, aucune PR fusionnée. `gh pr view --json statusCheckRollup` descend jusqu'à ce
  champ, qui relève de l'API **Actions** et non de `checks` : il manquait `actions: read`.
  **C'est la DEUXIÈME fois** — le 21/08, c'étaient `checks: read` et `statuses: read`. Une
  permission manquante ne se manifeste jamais par « il manque une permission » : elle se
  manifeste par du SILENCE, puisque le seul signal est un run d'Actions en échec que
  personne n'ouvre.
  **Livré** : `actions: read`, la liste des cinq permissions verrouillée par
  `tests/autoMerge.test.ts` (6 mutations jouées, 6 attrapées), et le message d'erreur du
  workflow corrigé — il accusait encore les permissions du PREMIER incident, donc envoyait
  vérifier deux permissions déjà présentes.
  ⚠️ **Diagnostic trouvé par une AUTRE session** (CarAI #108, le même jour) et porté ici
  avec les mesures de ce dépôt. `scripts/autoMerge.mjs` se dit « identique dans les huit
  dépôts » : **DriveAI, JobAI, BatchChef, FinanceAI, hub-contract et app-template sont donc
  probablement dans le même état**, non vérifiés. À porter — ou à vérifier avant de conclure.

- **[H-19] Le hub observe sans toi, et il dit quand il a mal observé.** Diagnostic du
  14/09/2026 : `enregistrerReleve` n'était appelée que depuis `app/page.tsx`, donc rien ne
  s'enregistrait sans onglet ouvert — l'observateur était requis pour l'observation. Trois
  conséquences, toutes invisibles à l'écran : aucune courbe en dehors des heures de
  consultation, aucune détection de métrique GELÉE (il faut deux relevés qui encadrent le
  gel), aucune trace d'une app tombée le vendredi.
  **Livré** : `POST /api/cron/releve` + `.github/workflows/releve.yml` (l'horloge),
  `lib/gel.ts` (`fraicheur`, `rythmeDonnee`, `continuite`, PURES), la donnée figée inscrite
  dans le bandeau « attention », et `tests/gardePages.test.ts` étendu aux `route.ts`.
  **Mesuré le 14/09 au soir, premier run réel** : les deux secrets étaient POSÉS et corrects
  (masqués dans le journal, donc non vides), et le run a quand même échoué sur un
  `HTTP 308 Redirecting`. `HUB_URL` désignait `hubperso.com`, qui redirige vers
  `www.hubperso.com` — le domaine canonique du projet Vercel. Et un jeton ne franchit PAS une
  redirection de domaine : `curl` retire l'en-tête `Authorization` dès que l'hôte change
  (protection, pas défaut). Le workflow normalise désormais la barre oblique finale, suit les
  redirections de MÊME hôte (bornées, jamais `--location-trusted`) et REFUSE un changement
  d'hôte en nommant les deux — sinon le 401 qui suit accuse le secret alors que l'URL est en
  cause. Le diagnostic a été produit par le correctif lui-même, en exécution réelle.
  **Reste** : 👤 `HUB_URL` = `https://www.hubperso.com` (le seul geste manquant) ; puis
  vérifier sur trois jours que la cadence réelle tient, puisque GitHub n'en garantit aucune
  (mesuré à ~3× plus lent sur CarAI, tous les runs verts).

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

⚠️ **Contrainte du contrat, à connaître avant de promettre quoi que ce soit :** `metrics`
reste plafonné à **6 par app**, `alerts` à 10, `actions` à 6. La liste de FinanceAI
ci-dessous en demande six à elle seule — il n'y a pas de septième place SUR LA CARTE, et
« liquidités PAR COMPTE » n'entre pas dans une métrique unique sans choix éditorial.

✅ **Ce n'est plus une impasse depuis `hub-contract` v1.3.0 (14/09/2026).** Le plafond de 6
protège la lisibilité de la CARTE ; il n'avait aucune raison de borner ce qu'on consulte en
cliquant. Le champ `details` porte désormais jusqu'à 6 sections titrées de 8 lignes chacune,
avec un `hint` par ligne pour dire l'unité ou la période. La carte garde ses 6 métriques, le
reste va dans la vue détaillée.
⚠️ Les libellés de détail servent de CLÉ à l'historique : la clé est le couple (titre de
section, libellé). Deux lignes homonymes dans une même section donneraient une courbe qui
saute d'une grandeur à l'autre — un graphe faux, sans rien d'anormal à l'écran. Le contrat
les rejette ; le même libellé dans deux sections différentes reste accepté.

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
  patrimoine pour FinanceAI). Le contrat n'avait aucun moyen de l'exprimer : le hub
  affichait six métriques de même poids.
  **Tranché et livré côté contrat** (`hub-contract` v1.3.0, 14/09/2026) : un DRAPEAU
  `primary: true` porté par la métrique, et non un `primaryMetric: "<label>"` à la racine —
  une référence par libellé peut pendre dans le vide, un drapeau ne peut désigner que ce à
  quoi il est attaché. Au plus un par summary, sinon le summary est rejeté.
  **Reste, côté HUB** : le rendu (aujourd'hui le hub retombe toujours sur la première
  métrique, ce qu'il faisait déjà — la nouveauté est qu'une app peut enfin le dire).

- [ ] **[H-12] [CONTRAT] Une app peut-elle publier une RECOMMANDATION ?** Marc demande « voir
  recommandation directe » pour FinanceAI. Ça passait par une `alert` de sévérité `info`,
  ce qui la rangeait visuellement avec les problèmes.
  **Tranché et livré côté contrat** (`hub-contract` v1.3.0, 14/09/2026) : un CHAMP
  `recommendation` dédié, et volontairement SINGULIER. Une alerte dit ce qui va mal, une
  recommandation dit ce qu'il y a de mieux à faire — et le plus souvent rien ne va mal. Les
  fondre laissait deux issues, mauvaises toutes les deux : un bon conseil mis en forme comme
  un problème, ou une liste de problèmes diluée qu'on apprend à ne plus lire. Un tableau
  aurait été rempli de cinq conseils, et un tableau de bord qui en affiche cinq n'en affiche
  aucune.
  **Reste, côté HUB** : le rendu sur la carte et dans la vue détaillée.

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

  ⚠️ **Quatrième angle mort, corrigé le 14/09/2026** : `idDeclare` n'admettait, avant
  l'identifiant, que la puce, un `~~` de rayure et les `**` du gras. Une entrée écrite
  `- 🟦 **[H-19] …` — avec l'un des quatre marqueurs de statut que la convention de
  compte-rendu §8 déclare EXPLICITEMENT légitimes dans `BACKLOG.md` et `HANDOVER.md`, et
  dont elle précise qu'ils sont **lus par ce script** — n'était donc pas reconnue comme une
  déclaration. Son corps n'appartenait à aucun bloc, et le contrôle affirmait « la tâche a
  avancé sans que son entrée ne soit relue » alors qu'elle venait d'être ÉCRITE dans la même
  PR. Le motif tolère désormais un marqueur de statut et une case Markdown en tête.
  Trouvé, comme les trois autres, **en appliquant le contrôle à sa propre PR** — quatre sur
  quatre par le même moyen, ce qui commence à être une méthode plutôt qu'une coïncidence.
  Quatre tests de régression, prouvés discriminants (3 échecs si on remet l'ancien motif).

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
