# Référence complète de Hubperso (ex-CLAUDE.md)

> Texte déplacé tel quel depuis `CLAUDE.md` (devenu un index de 60 lignes max). Les sections
> `## 1.` à `## 11.` gardent leur numéro : `CLAUDE.md` et `CLAUDE.local.md` y renvoient.
> Ce fichier n'est PAS chargé à chaque session : le lire par section (Grep/Read ciblé).

Dashboard central du hub perso. Il **consomme** le contrat
[`@mokarade/hub-contract`](https://github.com/MoKarade/hub-contract) ; il ne le définit
pas. Rôle unique : fetch server-side des `GET .../hub/summary`, validation, rendu de
widgets 100 % génériques.

**Stack** : Next.js 15 (App Router, Server Components) · Neon + Drizzle · Auth.js v5 · Vitest.
**Destination** : `hubperso.com`.

> 📐 Structure de ce fichier et de `docs/` : [convention commune aux huit dépôts](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md).

## 1. Principes non négociables

- **Générique par le contrat.** Le hub ne connaît AUCUNE app en particulier :
  il rend ce que le summary contient (metrics/alerts/actions, `app.color`, `status`).
  Pas de logique spécifique à FinanceAI ou DriveAI dans les composants.
- **No fake data.** Une app injoignable, non autorisée ou en construction affiche un
  état honnête (`unreachable` / `unauthorized` / `building`), jamais un chiffre inventé
  ni un placeholder trompeur.
- **Validation obligatoire.** Toute réponse passe par `validateSummary` avant d'être
  rendue. Un JSON hors contrat → widget `invalid`, jamais un affichage « comme si ».
- **Server-side only.** Le fetch et les jetons restent côté serveur (Server
  Components). Pas de `x-hub-token` exposé au client, pas de CORS demandé aux apps.
- **Hub privé, protégé par auth.** Le hub affiche des données personnelles réelles : il est
  derrière un **login Google (Auth.js v5)**. `middleware.ts` garde tout sauf `/api/auth/*`,
  `/login`, `/api/acces`, `/api/cron/releve`, `/api/sante`, `/api/cout` et les assets. **Toute nouvelle route affichant des données doit
  rester derrière la middleware** (ne jamais l'ajouter aux exclusions du matcher) et, si
  elle porte des jetons, revérifier la session côté serveur (défense en profondeur, cf.
  `app/page.tsx`). Voir la section « Authentification » du README.
- **Deux questions distinctes, jamais confondues** (ADR 0001, `docs/ACCES-PAR-APP.md`).
  `AUTHORIZED_EMAIL` **n'est plus « la seule adresse admise »** : c'est le PROPRIÉTAIRE.
  - *Peut-elle se connecter ?* → `peutSeConnecter` (`lib/personnes.ts`) : le propriétaire,
    ou toute personne active ayant **au moins un accès** quelque part. Sinon aucune session.
  - *A-t-elle le droit d'entrer ICI ?* → `aAcces(email, appId)`. Le hub se traite lui-même
    comme une app (`APP_HUB = "hubperso"`) : **toute page du hub appelle `exigerAccesHub()`**
    (`lib/gardeHub.ts`), et `exigerProprietaire()` pour ce qui est réservé au propriétaire.
    `tests/gardePages.test.ts` fait respecter cette règle — une page ajoutée sans garde
    échoue au test, elle ne se découvre pas en production.

  Le propriétaire est vérifié **en premier et SANS réseau** : une panne de base ne doit
  jamais enfermer Marc dehors de sa propre administration, seul endroit d'où il pourrait
  se réparer.
- **Trois routes serveur-à-serveur traversent le garde, et ce n'est pas une exception au principe ci-dessus.**
  Le matcher reste inchangé ; c'est `isPublicPath` (`lib/authGuard.ts`) qui les laisse
  passer. Aucune des deux n'est ouverte : elles sont authentifiées **autrement**, parce
  qu'un serveur qui appelle un serveur n'a pas de cookie de session à présenter.
  - `POST /api/acces` — une app demande si une adresse a accès chez elle. Authentifiée par
    le `HUB_TOKEN` de l'app appelante. Le jeton **identifie** l'appelant, donc l'`appId`
    vient du jeton et **jamais du corps de la requête** : une app ne peut pas interroger
    les accès d'une autre.
  - `POST /api/gantt` — le **relevé du Gantt** (« Chantier Apps »), envoyé toutes les 10 min par
    la tâche planifiée du PC de Marc (`outils/gantt-pc/tour.py`, MoKarade/.github). Même
    modèle que l'horloge : secret **DÉDIÉ** (`GANTT_SECRET`, `Authorization: Bearer`), 503 si
    absent côté serveur, 401 s'il est faux, comparaison à temps constant, chemin nommé par
    égalité stricte dans `isPublicPath`. Le Drive du PC est privé : le hub ne le lit pas, il
    range le DERNIER envoi (table `gantt_releve`, une seule ligne) et les pages le relisent
    derrière la connexion. Un corps invalide (400) ou trop gros (413) ne touche jamais la ligne.
  - `POST /api/cron/releve` — l'**horloge** du hub, appelée par
    `.github/workflows/releve.yml` (ADR 0003). Authentifiée par un secret **DÉDIÉ**
    (`CRON_SECRET`), pas par un `HUB_TOKEN_*` : ce qu'elle déclenche est une ÉCRITURE dans
    la mémoire du hub, un pouvoir qu'aucune app n'a de raison d'avoir — et qui se
    propagerait à chaque app ajoutée. 503 si le secret manque côté serveur, 401 s'il est
    faux : la distinction EST le diagnostic (l'un envoie sur Vercel, l'autre sur GitHub).
- **`GET /api/chantier/releve` ne traverse PAS le garde** (26/10/2026) : elle reste derrière la session
  et se garde encore seule (accès au hub, puis propriétaire ; un invité reçoit 404, il n'apprend pas que
  la page existe). Elle rend le dernier relevé du Gantt en gzip, avec `ETag` (heure de réception) :
  un `If-None-Match` connu rend 304 sans relire le contenu en base. Lue par la page Chantier ;
  jamais mise en cache (`no-store`). Logique pure : `lib/chantierReleve.ts`.
- **`GET /api/chantier/cadre` ne traverse PAS le CSP du hub** (26/10/2026) : le document de la page Chantier
  (`chantier/cadre.html`, sans aucune donnée) est mis en cadre par `/chantier`. Il est **exclu de la CSP globale**
  (`next.config.mjs` : `frame-ancestors 'none'` interdirait le cadre) et porte la sienne (`lib/chantierCadre.ts` :
  `sandbox` sans `allow-same-origin`, `connect-src 'none'`, `frame-ancestors 'self'`). Propriétaire seul (`AUTHORIZED_EMAIL`,
  sans réseau), 404 pour un invité. Ne jamais y ajouter de donnée : le dépôt est public (`tests/chantierCadre.test.ts`).
- **`GET /api/chantier/couts` reste derrière la session et se garde seule** (26/10/2026) : elle remplace la page `/couts`
  (retirée ; `/couts` redirige vers `/chantier?onglet=couts`). Elle interroge les apps avec leurs jetons (`fetchAllSummaries`),
  donc propriétaire seul (`AUTHORIZED_EMAIL`, sans réseau ; 401 sans session, 404 sinon, 429 au-delà de 6/min), `no-store`.
  Mise en forme pure : `lib/chantierCouts.ts` (un total PAR période, jamais fusionnés). Lue par `components/ChantierCadre.tsx`,
  postée au cadre par le canal (`chantier-couts`) : le cadre n'a aucun réseau.
- **`POST /api/chantier/gestes` reste derrière la session et se garde seule** (27/10/2026) : le geste d'un bouton de l'onglet « À toi »
  (Fusionner, Fait, une réponse), que le PC applique ensuite sur GitHub. Propriétaire seul (`AUTHORIZED_EMAIL`, sans réseau ; 401 sans session,
  404 sinon), uniquement depuis NOTRE page (`Origin` = l'hôte du hub, 403 sinon), 20/min, corps ≤ 4 Ko validé par `lib/chantierGestes.ts`
  (champ inconnu = 422), idempotente par `id`. Table `chantier_gestes` ; reçue du cadre par le canal (`chantier-geste`), jamais lue par lui.
- **`POST /api/lia/ask` traverse aussi le garde, et se garde toute seule** (22/10/2026, #336) :
  la question de LIA. Une app s'identifie par son `HUB_TOKEN` (`appDuJeton`, la source vient du
  jeton, jamais du corps) ; l'accueil, par la session + `aAcces(…, APP_HUB)` lus dans la route.
  Un `x-hub-token` présent mais faux = 401, sans repli sur la session ; un invité du hub (session sans `AUTHORIZED_EMAIL`) = 403, jamais relayé. Le relais porte `proprietaire` (obligatoire côté MemoryAI) : vrai pour le propriétaire de l'accueil ; pour une app, `proprietaire: true` est exigé dans son corps (faux ou absent = 403 sans appel). Elle relaie à MemoryAI
  `POST /api/ask` avec le jeton que le hub détient pour elle ; tout échec = 503, la question
  n'est jamais journalisée. Contrat : `commun/assistant/CONTRAT-ask-lia.md` ; forme : `lib/liaAsk.ts`.
- **Une troisième route traverse le garde SANS aucune authentification : `GET /api/sante`**
  (30/09/2026, patron JobAI#49 / BatchChef#154). C'est la sonde de la vigie de l'Atelier.
  Sa seule défense est de n'avoir rien à donner : elle ne rend que `{ ok: true }` ou
  `{ ok: false, cause: "base" | "configuration" }` (503, `no-store`), limitée à 10 appels/min par client (429, avant tout accès à la base), jamais une donnée, un
  message brut ni un **nom** de variable — les noms des variables requises absentes partent
  au journal serveur seulement. `tests/gardePages.test.ts` la range à part
  (`ROUTES_PUBLIQUES_MUETTES`) et lui interdit d'importer un module de données.
- **Une quatrième traverse le garde SANS authentification et rend UNE donnée : `GET /api/cout`**
  (16/10/2026, tâche #191, oui de Marc). Le coût API cumulé des apps, que le relevé du suivi du
  projet lit sans jeton : un total en CAD (période `total` seulement, jamais fusionnée avec un
  coût « mois »), sa date de mesure (la plus ancienne) et les identifiants des apps « non
  lisibles » (jamais comptées comme 0). Depuis le 16/10/2026 elle porte aussi `mois` : le TOTAL de la
  dépense du mois en cours (estimé par différence de cumuls, voir `lib/coutMois.ts`), pour mesurer
  le plafond de 20 $/mois de Marc. Jamais un montant par app (oui de Marc : les totaux seulement,
  liste blanche `totauxDuMois`), rien de personnel. Elle lit la mémoire du
  hub (les relevés), jamais une app ni un jeton ; 503 si la base ne répond pas ; 10 appels/min par
  client. `tests/gardePages.test.ts` la range à part (`ROUTES_PUBLIQUES_AGREGAT`) : pas de
  `getSources`, ni personnes, ni administration, ni jeton. Logique pure : `lib/coutCumule.ts`.
  La liste des variables attendues (noms, requise/optionnelle, effet si absente) vit dans
  `lib/variablesAttendues.ts` (F7) ; `tests/variablesAttendues.test.ts` vérifie qu'elle
  couvre chaque `process.env` lu par l'app.
- **Suivi des erreurs (Sentry, #162, 16/10/2026)** : `instrumentation.ts` (serveur SEULEMENT, choix du
  18/10/2026), réglages purs dans `lib/sentryConfig.ts`. **Éteint sans `SENTRY_DSN`**, aucune donnée
  personnelle (ni IP, ni cookie, ni en-tête, ni corps, ni chaîne de requête). Ne jamais appeler
  `Sentry.init` hors de `instrumentation.ts`, ni mettre `sendDefaultPii` à vrai, ni copier le DSN vers
  le navigateur (`NEXT_PUBLIC_SENTRY_DSN`, `instrumentation-client.ts`) : la CSP reste `connect-src 'self'`.
  Essai : workflow manuel « Essai Sentry ». Verrou : `tests/sentryConfig.test.ts`.

  ⚠️ Cette section a écrit « c'est la SEULE exception » jusqu'au 14/09/2026, puis « deux
  routes » jusqu'au 30/09/2026. En ajouter une **oblige à corriger la phrase dans la même PR** : une règle qu'on sait fausse
  cesse d'être lue comme une règle, et la session suivante la prendrait pour un interdit —
  donc passerait par le matcher, ce qu'il ne faut jamais faire.
- **Sécurité des liens.** Les `href` du contrat ne deviennent cliquables que via
  `safeHttpUrl` (http/https uniquement). Ne jamais rendre un href brut.
- **Un `href` que le HUB va appeler se juge bien plus sévèrement qu'un href cliquable.**
  Pour une action `kind: "trigger"` (ADR 0002, `lib/declencher.ts`), `safeHttpUrl` ne suffit
  pas : c'est le serveur du hub qui part, depuis son réseau, avec le jeton de l'app. Quatre
  verrous, et il faut les quatre — (1) http(s) ; (2) l'action doit figurer dans un résumé
  **refetché live**, jamais tiré du cache de résilience (un cache sert à AFFICHER, pas à
  AUTORISER) ; (3) **même origine que le `summaryUrl`** ; (4) **aucune redirection suivie**.
  Le verrou 3 est le seul qui tienne quand l'app est compromise — sans lui, une app qui publie
  `http://169.254.169.254/…` fait du hub un relais SSRF vers ce qu'elle ne peut pas atteindre
  elle-même. Le verrou 4 est ce qui empêche de contourner le 3 par un simple `302`.
- **Une Server Action est un point d'entrée POST, pas un détail de page.** Elle est
  atteignable sans passer par la page qui affiche le bouton : cacher le bouton ne garde rien.
  Chacune revérifie la session ET le modèle d'accès côté serveur, et `tests/gardePages.test.ts`
  énumère désormais les `actions.ts` en plus des `page.tsx` pour l'exiger.
- **Les dates s'affichent à l'heure du Québec, jamais à celle du serveur.** Tout
  `Intl.DateTimeFormat` doit passer `timeZone: FUSEAU` (`lib/fuseau.ts`). Sans lui, `Intl`
  prend le fuseau de la machine — et le hub rend ses dates côté serveur, où Vercel tourne
  en UTC : la fraîcheur affichée serait fausse de 4 ou 5 h selon la saison, sans aucun
  signe extérieur. C'est le même principe que « no fake data » appliqué au temps : une
  heure fausse est pire qu'une heure absente, parce qu'on la croit. Tests dans
  `tests/fuseau.test.ts`, dont un cas d'hiver qui échouerait sur un décalage écrit en dur.
- **Jamais d'agrégat entre unités incomparables.** Le contrat laisse chaque app choisir
  la `period` de son coût (`total` / `mois` / `jour`) et elles ne s'accordent pas.
  `aggregateUsage` somme donc PAR période (`totalsByPeriod`) et il n'existe volontairement
  aucun `totalCad` global : un tel champ ne pourrait pas être honnête. Même vigilance pour
  toute future agrégation (devises, fenêtres de temps) — sommer d'abord ce qui est comparable,
  afficher l'unité, jamais un chiffre unique qui mélange.

## 2. Conventions de code

- **TypeScript strict**, pas de `any` silencieux.
- **Erreurs honnêtes** : `fetchSummary` distingue chaque mode d'échec et n'en avale aucun.
  Un widget « injoignable » et un widget « invalide » ne disent pas la même chose.
- **Fonctions pures d'un côté, I/O de l'autre.** `aggregateUsage`, `safeHttpUrl`,
  `isPublicPath` se testent sans base, sans réseau et sans horloge — la date se passe en
  paramètre (cf. `peutSeConnecter(email, env, maintenantMs, lecture)`).
- **Design : direction bento assumée** (voir `app/globals.css`), pas de template générique.
  Thème SOMBRE SEUL (Marc, 26/09), accent de marque `--marque` #93A0FF ; contrastes testés dans `tests/themeSombre.test.ts` ; couleurs figées, jetons et classes sans règle comptés par `tests/theme.test.ts` (verrou de #161).
- ⚠️ **Une couleur reçue du contrat ne porte JAMAIS du texte sans passer par `texteSur`**
  (`lib/couleur.ts`, PURE). `app.color` arrive à l'exécution et le hub ne connaît aucune
  app : mesuré le 15/09, deux des six couleurs rendent le texte blanc illisible (JobAI
  `#f2a31b` → 2,09 ; DriveAI `#8ab4f8` → 2,11, pour un seuil de 4,5). Un `color: #fff` codé
  en dur cassait donc un tiers du tableau de bord — et un bouton illisible s'affiche
  parfaitement, rien ne le signale. Le module prouve aussi que le **meilleur du noir et du
  blanc rend toujours au moins 4,58**, quelle que soit la couleur publiée : le hub n'a donc
  ni liste à maintenir, ni confiance à accorder aux apps sur ce point.
  Même règle pour l'anneau de focus, qui prenait `var(--accent)` : invisible sur les deux
  couleurs claires, et ça ne se voit qu'au clavier.
- ⚠️ **La carte entière est cliquable par un `::after` posé sur le lien « Détail ».** Trois
  conséquences à ne pas défaire : (1) ce lien ne doit porter NI `position`, NI `transform`,
  NI `filter` — les trois créent un bloc conteneur et la nappe se replie sur le bouton, donc
  la carte cesse d'être cliquable **sans que rien ne change à l'écran** ; (2) tout ce qui est
  cliquable dans une carte est remonté par une règle de FORME
  (`.widget :is(a, button):not(.widget__detail)`) et non par une liste de classes, qui se
  périmerait au prochain lien ajouté (leçon n° 6) ; (3) `--cible` est le seul jeton de
  hauteur tactile — les quatre pages le partagent, trois valeurs séparées divergeraient.
- ⚠️ **Tout `className` posé sur un `<button>`, un `<a>` ou un `<Link>` doit déclarer
  `min-height: var(--cible)`** — `tests/ciblesTactiles.test.ts` l'exige, en partant du JSX et
  non d'une liste. Né d'un échec : le 15/09 j'ai agrandi les TROIS classes que j'avais sous
  les yeux, et Marc est revenu le 16 avec « toujours difficilement utilisable sur tel ». Il y
  en avait NEUF, dont quatre encore à ~26 px. Un bouton trop petit s'affiche parfaitement :
  rien ne pouvait me contredire.
  ⚠️ **Et la hauteur ne suffit pas.** Une cible de 48 × 100 px se rate LATÉRALEMENT, un pouce
  étant large et arrivant de biais. Sous 560 px — le seuil où `.bento` passe déjà à une
  colonne, et surtout pas un second seuil qui créerait une fenêtre où les cartes sont
  empilées mais les boutons encore étroits — les boutons prennent toute la largeur et
  `--cible` monte à 48 px.
- **Le liseré, le lavis et la barre d'une carte gardent TOUJOURS la couleur de l'app**
  (`--teinte`), quel que soit l'état (Marc, 28/09 : une couleur unique par projet, jamais la
  couleur d'état). L'état passe uniquement par le badge (couleur + libellé), l'icône et le
  texte. Remplace la règle du 15-16/09 (« le rouge écrase, l'orange prend le liseré »).
  ⚠️ `/attention` ne reçoit aucune couleur d'app : elle ne liste que des problèmes, déjà
  codés par gravité, et deux codes couleur sur le même écran s'annulent.

## 3. Workflow git

- Branches `claude/<slug>` pour le travail automatisé, `feature/<slug>` pour Marc.
- Commits en français, préfixés (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- **PR en draft** pour itérer.
- ❌ Jamais `--force` sur `main`. ❌ Jamais `--no-verify`.
- ⚠️ **`git fetch origin main` AVANT de committer.** Plusieurs sessions travaillent en
  parallèle sur l'écosystème ; le 20/08/2026, deux d'entre elles ont produit la même
  correction de CI, mot pour mot, dans la même heure — et une branche partie d'un `main`
  périmé est entrée en conflit sur `.github/workflows/ci.yml`, ce qui a **empêché GitHub de
  créer le moindre run CI** pendant que Vercel continuait de déployer. Rien n'était rouge.

## 4. Commandes utiles

```bash
npm run dev        # http://localhost:3000
npm run test       # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run build      # build de production
npm run constellation  # interroge les 6 apps et juge la cohérence (jetons requis)
```

## 5. Vérifications avant commit

```bash
npm run typecheck && npm run test && npm run lint && npm run build
```

*(`lint` = ESLint CLI : `next lint` est déprécié et retiré dans Next 16. Le bloc
`ignores` de `eslint.config.mjs` est indispensable — l'ESLint CLI n'ignore pas
`node_modules`/`.next` implicitement, contrairement à `next lint`.)*

La **CI** (`.github/workflows/ci.yml`) rejoue exactement ce gate, plus deux workflows
séparés — `constellation.yml` (quotidien, cf. §7) et un job `audit` (`npm audit --omit=dev`,
aussi en hebdomadaire). Séparés volontairement : un avis
de sécurité paraît sans qu'une ligne n'ait changé — mêlé au gate, il peindrait le dépôt
en rouge sans rapport avec le code, et on prendrait l'habitude du rouge.

⚠️ **Borner les jobs CI** (`timeout-minutes`). Sans plafond, un job figé tourne SIX HEURES
avant d'échouer — vécu sur DriveAI le 19/08/2026, où l'installation d'un navigateur
Playwright s'est bloquée 2 h 15 pendant que la PR restait « en attente » sans rien de rouge.

## 6. Après un merge : vérifier le DÉPLOIEMENT, pas seulement la CI

**CI verte ne veut pas dire « en ligne ».** Ce sont deux systèmes indépendants : la CI
juge le code, Vercel construit et sert. Un merge peut passer le gate et ne jamais être
déployé — la branche reste verte, le site continue de servir l'ancien build, et rien
n'est rouge nulle part.

Vécu le 31/07/2026 : quatre projets Vercel ont cessé de créer des déploiements pendant
~3 h (l'intégration Git n'a rien reçu). DriveAI et JobAI ont rattrapé au push suivant ;
Hubperso et BatchChef n'en ont pas eu — leur commit d'en-têtes de sécurité est resté
**cinq jours** en attente sans que personne ne le voie. La CSP était mergée et absente
de la production en même temps.

Donc, après un merge qui change ce qui est servi (en-têtes, `next.config.mjs`,
middleware, variables de build) : vérifier qu'un déploiement de production a bien été
créé et qu'il est `READY`, puis **contrôler l'effet sur la réponse HTTP réelle** — un
en-tête se lit dans la réponse, il ne se déduit pas du fichier source. Rattrapage :
tableau de bord Vercel → Deployments → « … » → Redeploy.

⚠️ **Cas particulier d'un changement de variable sur Vercel** : si la variable est modifiée dans
l'interface Vercel alors que le dernier commit sur `main` ne touche que de la documentation ou
des tests, faire « Redeploy » sur ce commit sera annulé en silence par `scripts/build-necessaire.sh`
(qui ne voit que le diff git). La procédure de contournement est de **pousser un commit de code**
(même trivial) sur `main` pour forcer une vraie reconstruction qui prendra en compte la nouvelle variable.

Corollaire : un merge qui ne change QUE de la doc n'a pas de déploiement à vérifier. Le dire
plutôt que de laisser croire qu'on a vérifié.

## 7. Le contrat, et ce qu'on en consomme

Quand `hub-contract` publie un nouveau tag, re-pinner ici
(`npm install github:MoKarade/hub-contract#vX.Y.Z`) seulement si on veut consommer un
nouveau champ. Un champ additif optionnel est ignoré sans re-pin (les schémas strippent
les clés inconnues).

**Le hub somme les coûts PAR PÉRIODE et n'expose aucun total global** — voir le dernier
principe de la §1. Quand une app publie `mois` alors que les autres publient `total`, elle
se retrouve seule dans sa colonne et le hub ne peut afficher aucun montant unique. C'est ce
qui a fait basculer DriveAI vers le cumul le 20/08/2026.

**« Contrat trop récent » n'est PAS « réponse invalide ».** Depuis `hub-contract` v1.2.0,
`validateSummary` sonde la version avant la structure et lève un `ContractTooNewError` distinct
quand l'app publie une version que ce build ne lit pas. `fetchSummary` en fait l'état
`contract-too-new` (ton `warn`, pas `danger`) : **l'app va bien, c'est le hub qui est à
re-pinner.** Confondus jusque-là, le widget affichait « réponse invalide » — un diagnostic qui
accuse l'app et envoie corriger le mauvais dépôt. Cet état n'est **jamais** masqué par le cache
de résilience : le masquer 30 min cacherait exactement ce qu'on vient de rendre visible.

**Ce que le hub croit d'une app et ce qu'elle publie d'elle-même ne sont vérifiés nulle part
— sauf par `npm run constellation`.** `lib/sources.ts` déclare `id: "driveai"`, l'app publie son
`app.id` de son côté, et la correspondance est tenue à la main. Une divergence ne se voit pas à
l'écran : le widget s'affiche, avec le bon contenu, sous le bon nom. `lib/constellation.ts`
(PUR, testé sans réseau) juge identités, versions et comparabilité des coûts ; le script et le
workflow quotidien ne sont que le transport. C'est ce contrôle qui aurait attrapé le décalage
« mois vs total » de DriveAI avant qu'un montant faux ne s'affiche.

⚠️ Le vérificateur **échoue si aucun jeton n'est présent** plutôt que de rendre 0 : un run qui
ne vérifie rien ne doit pas ressembler à un run vert.

## 8. Documentation (où vit quoi)

| Fichier | Contenu |
|---|---|
| `README.md` | À quoi sert le hub, pour un lecteur extérieur. |
| `CLAUDE.md` | Ce fichier. Se charge à **chaque session** → il reste **court**. |
| `HANDOVER.md` | L'état RÉEL de l'auth et des accès, et comment le vérifier. À lire en premier. |
| `BACKLOG.md` | Un renvoi vers les issues du dépôt, où vit le backlog (depuis le 16/10/2026). |
| `docs/adr/` | Décisions architecturales, `NNNN-slug.md`. L'ADR 0001 porte le modèle d'accès **et son amendement** ; l'ADR 0002, le déclenchement d'actions et ses verrous SSRF ; l'ADR 0003, l'horloge du hub, la deuxième route à jeton et la détection de gel. |
| `docs/ACCES-PAR-APP.md` | Le modèle d'accès par app, en détail. |
| `docs/CONNEXION-UNIQUE.md` | Le cookie de session partagé entre les apps. |
| `docs/RAPPORT_2026-09-25.md` | Récit DATÉ de la session du 18 au 25/09 : lot L2, apps installables, carte du héros, ce qui attend Marc. Ne se met pas à jour. |

⚠️ **Doc périmée = pire que pas de doc.** Un audit du 19/08/2026 a trouvé la même règle
d'accès écrite dans quatre fichiers de ce dépôt, avec **trois états de vérité différents** :
« une seule adresse admise » survivait dans le README et le HANDOVER alors que le code avait
deux étages depuis cinq jours. Mettre à jour la doc touchée dans la MÊME PR que le code.

⚠️ **Un chiffre au présent rote.** Le HANDOVER annonçait « 42 tests » quand il y en avait
170. Soit on date le chiffre, soit on renvoie à la source qui fait foi.

## 9. Leçons apprises

**1. Le test « je me connecte, ça marche » ne prouve presque rien.** Il n'exerce que le
chemin du PROPRIÉTAIRE, celui qui fonctionne même base en panne — puisqu'il est vérifié
sans réseau, par construction. Ce qui se vérifie vraiment est l'invitation : accorder un
accès dans `/administration` et constater que la personne entre dans la minute, puis le
retirer et constater qu'elle ressort. La procédure est dans `HANDOVER.md`.

**2. Une page ajoutée sans garde ne se découvre pas en production.** Elle s'affiche, tout
simplement. C'est pourquoi `tests/gardePages.test.ts` énumère les fichiers réels de `app/`
et échoue si l'un d'eux n'appelle pas `exigerAccesHub()` — deux exceptions nommées, `/login`
et `/sans-acces`. Ne pas supprimer ce test pour faire passer une page.

**3. Le test qui garde les pages ne gardait pas les Server Actions.** Il énumérait les
`page.tsx` — donc pas `app/administration/actions.ts`, qui expose des écritures en POST
depuis le 14/08. Le trou était plus discret que celui d'une page non gardée : il n'y a même
pas d'URL à visiter pour s'en apercevoir. Corrigé le 20/08 en énumérant aussi les
`actions.ts`. La leçon générale : **un test d'exhaustivité ne couvre que la forme de fichier
qu'on lui a apprise**, et cette forme se périme quand le framework en ajoute une.

**4. Une exception dans le matcher du middleware et une exception dans `isPublicPath` ne
sont pas la même chose.** `/api/acces` et `/api/cron/releve` traversent le garde par
`isPublicPath` ; le matcher reste inchangé. La distinction compte : ces endpoints ne sont
pas ouverts, ils sont authentifiés autrement — par le `HUB_TOKEN` de l'app appelante pour
le premier, par `CRON_SECRET` pour le second (et `GANTT_SECRET` pour `/api/gantt`) — parce qu'un serveur qui appelle un serveur
n'a pas de cookie de session à présenter.

**5. L'observateur était requis pour l'observation.** `enregistrerReleve` n'était appelée
que depuis `app/page.tsx` : rien ne s'enregistrait sans onglet ouvert. Tout l'appareil
conçu pour repérer une métrique GELÉE (`inchangeDepuisMs`, `figeDepuisMs`) a besoin de deux
relevés qui ENCADRENT le gel — il n'en a jamais eu. Un code correct, testé, et qui ne
pouvait rien détecter faute d'être appelé. Réparé par `/api/cron/releve` (ADR 0003). La
leçon générale : **du code de surveillance se juge à sa cadence d'appel, pas à ses tests.**

**6. Le test qui garde les pages ne gardait pas les `route.ts` non plus.** La leçon n°3 dit
qu'un test d'exhaustivité ne couvre que la forme de fichier qu'on lui a apprise — elle a été
écrite le 20/08 en ajoutant les `actions.ts`, et elle est restée vraie : `app/**/route.ts`
était une TROISIÈME forme, non énumérée, alors que `app/api/acces/route.ts` lit le modèle
d'accès depuis le 14/08. Corrigé le 14/09. Une route à jeton peut légitimement être une
exception, mais elle doit **prouver** son authentification de remplacement (comparaison à
temps constant) — sinon la liste d'exceptions devient la porte de sortie du test.

**7. Un code de retour n'est une preuve que si le code qui le rend sait ce qu'il dit.** Le
15/09/2026, `POST /api/cron/releve` rendait `HTTP 200` avec « aucun relevé écrit — le dernier
date de moins de l'espacement minimal » pendant que les CINQ insertions échouaient sur
`relation "releves" does not exist`. Zéro ligne écrite, run GitHub vert. La route ne mentait
pas par choix : `enregistrerReleve` rendait un BOOLÉEN, donc « espacement respecté » (sain) et
« écriture échouée » (grave) lui arrivaient sous la même forme, et la seule phrase disponible
était celle du cas sain. **Aucune rédaction ne pouvait être juste — c'était le type qu'il
fallait changer**, pas le message (`IssueReleve`, plus un `500` qui teint le run en rouge).
Corollaire de méthode, appris à mes frais deux fois dans la même journée : quand un statut
annonce un succès, **chercher la trace de l'effet** (une ligne écrite, un journal
d'exécution) avant de conclure. Un `200` dont personne n'a vérifié la conséquence vaut un
commentaire.

**8. La cause suivante attend derrière celle qu'on vient de corriger.** Quatre causes se sont
succédé sur la même panne entre le 14 et le 15/09 — barre oblique finale, apex qui redirige,
`DATABASE_URL` absente, table inexistante — et chacune ne s'est montrée qu'une fois la
précédente réparée. J'ai annoncé « c'est réglé » deux fois de trop. **Une réparation n'est
finie qu'avec la mesure de son effet, pas avec le correctif.** Et une mesure lancée dans la
minute qui suit un déploiement peut mesurer l'ANCIEN : le 15/09, un relevé lancé 46 secondes
avant la fin d'un redéploiement a rendu un `503` qui n'était plus vrai.

**9. `target="_blank"` est le réflexe de tout le monde, et c'est lui qui éteint la bascule vers
l'app installée.** Une PWA installée sur Android s'enregistre comme gestionnaire des URL de son
`scope` (WebAPK) ; Chrome ne peut lui passer la main que sur une navigation de PREMIER NIVEAU.
Un `_blank` ouvre un onglet de navigateur et court-circuite tout. Le piège n'est pas de l'écrire
aujourd'hui — c'est qu'il se **ré-ajoute sans y penser** au prochain lot qui touche la carte, et
que la bascule s'éteint alors **sans que rien ne change à l'écran** : sur PC le lien marche
toujours, sur téléphone il ouvre Chrome au lieu de l'app, et personne ne relie ça à un attribut
ajouté trois semaines plus tôt. D'où `tests/pwaLiens.test.ts`, qui épingle les DEUX liens
ouvrant une app (le titre de la carte, le bouton « Ouvrir l'app ») avec une anti-vacuité : si le
lien change de forme, le test le dit au lieu de passer en ne regardant plus rien.
⚠️ Cette bascule ne vaut que pour une URL DANS le périmètre de l'app installée : les cartes
pointent vers d'AUTRES origines (`*.hubperso.com`), donc un onglet qui s'ouvre est le comportement
attendu, pas un défaut (Marc, 19/10 ; cause, sources et ce qui reste à vérifier : `docs/adr/0004`).
⚠️ Et il garde aussi le manifeste, sur un point qui ne se voit pas : `sizes` est une
DÉCLARATION, pas une mesure. Un manifeste qui annonce `512x512` en servant un PNG de 192 est
faux, et **Chrome croit le fichier**. Les dimensions se relisent donc dans l'en-tête IHDR du
PNG. C'est le défaut qui rendait FinanceAI non installable (une seule icône, en SVG) — mesuré
le 18/09 sur les sept dépôts du parc, il était le seul dans cet état.

**10. Un champ qui sert à DEUX choses dit la bonne à la majorité et la mauvaise à l'exception.**
`SOURCE_DEFS.defaultUrl` était à la fois l'endpoint du contrat et — par son origine — l'adresse
de l'app pour la palette. Vrai pour cinq apps sur six : une app Next.js sert sa page ET son
`/hub/summary` sur le même domaine. FAUX pour FinanceAI, dont le résumé vient d'un serveur MCP
auto-hébergé. Le champ unique a donc pointé le SITE : mesuré le 21/09/2026,
`https://finance.hubperso.com/hub/summary` répond **200 avec `<!DOCTYPE html>`** — le hub recevait
une page web et affichait « réponse non conforme au contrat », c'est-à-dire un diagnostic qui
ACCUSE l'app et envoie corriger le mauvais dépôt (même famille que `contract-too-new`, §7).
**La majorité valide une déduction qui n'est pas un fait** : on sépare les deux champs même là où
ils coïncident. Et le remède n'est pas une meilleure URL par défaut mais `null` — un défaut
plausible-mais-faux est pire qu'une absence, parce qu'on le croit (`no fake data` appliqué à une
configuration). Corollaire : `unconfigured` porte désormais sa CAUSE (`manque: ["url" | "jeton"]`),
les deux d'un coup — sinon la seconde n'apparaît qu'une fois la première réparée (leçon n° 8).

**11. Le contrôle de DUPLICATION de la CI a trouvé ce qu'aucune relecture n'avait vu.**
Le correctif de la leçon n° 10 écrivait la phrase « aucune URL de résumé configurée / aucun jeton
x-hub-token configuré » DEUX fois — dans la carte et dans la page de détail —, plus un espion de
`fetch` recopié dans deux cas de test. SonarCloud : **4,3 % de duplication sur le code neuf**
(seuil 3 %). Les deux copies se lisent parfaitement bien isolément : **une duplication n'existe
qu'à l'échelle du DIFF**, donc aucune relecture fichier par fichier ne pouvait la voir. Et ici elle
n'était pas cosmétique — deux surfaces qui décrivent le MÊME état doivent dire la même chose, et
deux phrases séparées divergent au premier ajustement. Le remède est la source unique
(`phraseManques`, à côté du type qu'elle explique), jamais un seuil relevé.


⚠️⚠️ **Et la suite de cette leçon est une leçon de MESURE.** La source unique `phraseManques` n'a
fait passer le chiffre que de 4,3 % à 4,1 % : mon relevé ne portait que sur les fichiers du DIFF,
alors que le détecteur compare le code neuf au **projet ENTIER**. Rejoué au bon périmètre : **12
lignes neuves** dans un bloc répété, dont **10 dans `lib/sources.ts`** — les six entrées de la table
des apps, qui ont par construction les mêmes champs et que l'ajout d'un septième a fait passer de 8
à 10 lignes, donc au-dessus de la fenêtre du détecteur. **Un périmètre de mesure trop étroit donne
un diagnostic qui a l'air juste et un remède qui ne bouge pas l'aiguille.**

⚠️ Deux remèdes ont été ESSAYÉS puis ANNULÉS, chacun après mesure : un constructeur partagé pour les
cinq apps du même domaine (re-mesuré — blocs répétés IDENTIQUES : un constructeur déguise la
répétition d'une table, il ne la supprime pas), puis un `sonar-project.properties` portant
`sonar.cpd.exclusions` (re-mesuré — **4,1 % inchangé, et le même identifiant d'analyse** : l'analyse
AUTOMATIQUE ne lit pas ce fichier). ⚠️ Le second méritait d'être retiré plutôt que gardé « au cas
où » : un fichier de configuration sans effet se lit comme un réglage POSÉ, et la session suivante
chercherait pourquoi il ne s'applique pas (`DOC-STALE-IMPOSSIBILITY`).

⚠️ Ce qui a fini par marcher : sortir les adresses d'accueil de la table (une ligne par app dans
`ACCUEIL_PAR_ID`), ce qui ramène les entrées sous la fenêtre — **2,6 % mesuré**. C'est une
contrainte d'OUTIL qui a choisi la forme, pas une amélioration, et c'est écrit tel quel dans le
fichier. Le trou qu'une seconde liste ouvre est fermé des deux côtés : le TYPE interdit une app sans
adresse (`SourceDef.id` est une clé de la table — perturbation : 1 erreur de compilation), un TEST
interdit une adresse sans app (perturbation : 1 rouge).

⚠️ **Suite, 30/09/2026 : les deux tables sont refondues en UNE** (`APPS` dans `lib/sources.ts`),
en gardant la forme qui avait passé le détecteur — **une ligne par app** (nom, résumé, accueil,
héros), les noms de variables d'environnement étant déduits de l'id (`<ID>_SUMMARY_URL`,
`HUB_TOKEN_<ID>`). Plus de seconde liste, donc plus rien à synchroniser. `tests/sources.test.ts`
fige le comportement (les six sources et les douze noms de variables, à l'identique) et refuse
qu'un export `…_PAR_ID` réapparaisse. [À vérifier] le taux de duplication SonarCloud à la
première PR qui porte ce changement.

## 10. Style et compte-rendu

> 📣 Forme des comptes-rendus, des commits, des PR et des docs générées :
> [convention commune aux neuf dépôts](https://github.com/MoKarade/claude-config/blob/main/conventions/COMPTE-RENDU.md).
> Elle régit **la forme** ; ce fichier garde **le contenu métier**. Sur la forme, c'est la
> convention qui gagne ; sur le métier, c'est ce fichier.

@docs/COMPTE-RENDU.md

⚠️ **Pourquoi une COPIE et pas seulement un lien.** Un `CLAUDE.md` ne charge rien hors de son
propre arbre : le lien ci-dessus est lisible par un humain, il n'arrive jamais dans la session.
C'est exactement le mode de panne du 20/08/2026 — les règles de cadrage écrites dans un
`~/.claude/CLAUDE.md` local ne descendaient nulle part, et Marc constatait « je ne vois pas la
différence » alors que rien n'était jamais arrivé. `docs/COMPTE-RENDU.md` est donc une copie
**synchronisée**, importée ci-dessus, et la CI échoue si elle a dérivé de la source.

Pour changer la convention : la changer dans `claude-config`, propager les huit copies, mettre
à jour les huit empreintes. La friction est le garde-fou — une copie qu'on peut modifier sur
place redevient huit conventions différentes en trois mois.

## 11. Ajouter une app

1. UNE ligne dans la table `APPS` de `lib/sources.ts` : clé = `id` kebab-case (= `app.id`
   publié), `name`, `resume`, `accueil` (et `hero` pour la seule tuile 2×2). Les variables
   `<ID>_SUMMARY_URL` et `HUB_TOKEN_<ID>` s'en déduisent — les ajouter aussi à la liste figée
   de `tests/sources.test.ts` et à `.env.example`.
   ⚠️ **`accueil` (la page de l'app) et `resume` (l'endpoint du contrat) sont DEUX champs**,
   même quand ils coïncident — c'est le cas de cinq apps sur six, et c'est précisément ce qui a
   laissé passer le défaut de FinanceAI (cf. leçon n° 10).
   ⚠️ `resume` vaut **`null`** quand aucune URL honnête n'existe : l'app est alors
   `unconfigured` tant que sa variable n'est pas posée, et le hub ne part pas sur le réseau.
   ⚠️ Une nouvelle propriété par app va DANS cette table, jamais dans une seconde table
   `…_PAR_ID` (refusé par test : deux listes pour une même app finissent par diverger).
2. La variable de jeton correspondante dans l'environnement (jamais en dur).

C'est tout : le widget est rendu automatiquement à partir du summary, **et** l'app apparaît
dans `/administration` — `APPS_DISPONIBLES` (`lib/administration.ts`) dérive de `SOURCE_DEFS`
plutôt que d'être une seconde liste écrite à la main. Une liste séparée aurait fini par
diverger, et une app absente de la page d'administration serait une app dont personne ne
peut recevoir l'accès.

## 12. Graphe de code local (graphifyy) : hooks, wiki et MCP

**Statut : déployé le 21/10/2026 (choix de Marc : runbook complet), tâche MoKarade/.github#332, modèle du pilote app-template (#323).** Le graphe est construit à chaque démarrage de session, sans jeton, et interrogé avant de lire ou grepper des fichiers.

### Ce qui est posé
- `scripts/graphe.sh` : seul point d'entrée (version épinglée `graphifyy[sql,mcp]==0.9.93`, venv dans `~/.cache`, `GRAPHIFY_BACKEND=none`). `update`, `query "<question>"`, `affected "<symbole>"`, `path "A" "B"`, `explain "<symbole>"`, `god-nodes`, `wiki`, `serve`, `session`, `hook-guard`, `usage`.
- `.claude/settings.json` : hook `SessionStart` (rend `graphify` utilisable dans la session via `CLAUDE_ENV_FILE`, puis construit le graphe ET le wiki EN ARRIÈRE-PLAN, sans jamais bloquer ni échouer) ; hooks `PreToolUse` sur `Bash|Grep` et `Read|Glob` (rappel « interroge le graphe d'abord », silencieux tant que le graphe n'existe pas ; échec ouvert).
- `.mcp.json` : serveur MCP `graphify` en stdio (`query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`, `list_prs`, `get_pr_impact`, `triage_prs`), à approuver à la première ouverture.
- `graphify-out/` (graphe, rapport, wiki, cache) : généré, JAMAIS committé. Le wiki (`graphify-out/wiki/index.md`) sert de plan de navigation.
- Un pointeur d'une ligne dans `CLAUDE.md` (pas les 11 lignes de l'installeur officiel, qui casseraient le verrou ≤ 60 lignes).

### Règles (chacune vient d'un constat)
- **0 jeton, 0 clé** : `update` est local (Tree-sitter), sans appel réseau ni LLM ; le paquet ne contacte le réseau que pour `add`, `clone` et les commandes LLM. [Certain, code lu et `strace`]
- **Jamais `label` ni `cluster-only` sans `GRAPHIFY_BACKEND=none`** : sans clé API ils se replient sur `claude -p` et consomment le quota Claude. [Certain]
- **N'utilise PAS l'installeur officiel** (`graphify claude install`, `graphify hook install`, skill `/graphify`) : il réécrit `CLAUDE.md`, pose des hooks vers un chemin absolu et la skill lance des sous-agents LLM. Tout passe par `scripts/graphe.sh`. [Certain]
- **`graphify-out/` jamais versionné** : les commentaires `TODO:`/`NOTE:`/`FIXME:` et les docstrings y sont copiés (80 caractères, e-mails compris) ; `graph.html` charge unpkg. Dépôt public : aucune donnée perso dans un commentaire de code. [Certain]
- **Toujours depuis la racine** : `graphify update /chemin/absolu` écrit ce chemin dans `.graphify_root`. [Certain]
- **Version épinglée** : le paquet sort presque une version par jour ; monter la version = relancer la mesure ci-dessous. Sans l'extra `[sql]`, les migrations `.sql` donnent 0 nœud. [Certain]
- **Les hooks de dépôt ne tirent que si la session démarre DANS le dépôt** (constat du 18/10/2026 : un fil du projet lancé depuis `/home/user` ne charge pas `.claude/settings.json`). [Probable] Dans ce cas il reste `scripts/graphe.sh` à la main.
- **Le rappel injecté dit « MANDATORY »** : c'est le texte du paquet, posé par NOTRE hook ; il coûte ~110 jetons par `Grep`/`Bash` quand le graphe existe.

### Ce que ça apporte, ce que ça n'apporte pas (mesure BatchChef, 21/10/2026, 290 fichiers)
- Le « 61,6x » de `graphify benchmark` compare à la lecture de TOUT le dépôt, ce que personne ne fait. Contre `grep` + lecture du fichier utile, sur 4 questions à symbole connu : 12,3 k jetons contre 12,0 k (requête + extrait), aucun gain net ; la requête ramène des nœuds génériques. [Certain pour ces 4 questions, n = 4]
- Ce que `grep` ne donne pas : `affected "X" --depth 2` rend les importeurs transitifs ET les documents qui citent X, avec fichier:ligne. [Certain]
- Les chiffres du document source (71,5x, -80 %, 76 % LongMemEval) viennent du fournisseur, sur d'autres corpus. [Probable]

### Vitesse, profondeur par défaut et journal d'usage (tâche MoKarade/.github#487, 22/10/2026)
- **Délai** : `affected` passe d'environ 1,2 s à environ 0,3 s. `pret()` importait le paquet `mcp` (≈ 850 ms) à CHAQUE appel ; il teste maintenant sa présence par `find_spec` (≈ 20 ms). Le même appel direct de graphify prend ≈ 0,24 s. [Certain, mesuré le 22/10/2026]
- **Profondeur** : `affected` remonte 1 niveau par défaut ; `--depth 2` donne le rayon d'impact complet (importeurs des importeurs). Sur 9 dépôts et 90 symboles (22/10/2026), la sortie est 2 à 3 fois plus courte à la profondeur 1 et le rappel face à grep presque inchangé, mais deux fois moins de fichiers sont cités. Avant une suppression ou un renommage, demander `--depth 2`. [Certain pour la mesure]
- **Journal** : chaque appel `query`, `affected`, `path`, `explain`, `god-nodes` écrit une ligne dans `graphify-out/usage.jsonl` (heure, commande, durée, caractères rendus, branche ; jamais les arguments) et les hooks y comptent leurs passages. `scripts/graphe.sh usage` résume. Il mesure l'usage, pas l'économie de jetons : un hook ne voit pas la sortie des outils et deux sessions ne font pas la même tâche. Local, ignoré par git.
- **Lecture ciblée** : `affected`, `explain` et le MCP donnent des `fichier:Lnn`. Lire alors la zone utile (`Read` avec `offset` et `limit`) plutôt que le fichier entier. Le gain en jetons n'est pas mesuré chez nous. [À vérifier]

### Retour arrière
Supprimer `.claude/settings.json` (ou ses trois blocs), `.mcp.json`, `scripts/graphe.sh`, `.graphifyignore`, les deux lignes de `.gitignore` et la ligne de `CLAUDE.md`. Rien d'autre n'a été modifié.

Évaluation : commun/plans/2026-10-21_graphify-analyse.md. Mesure à refaire sur 10 questions réelles après un jour d'usage.

**Artefact `graphe` pour Hubperso (tâche MoKarade/.github#433, 21/10/2026)**
- `.github/workflows/graphe.yml` appelle le workflow commun de `MoKarade/.github` à chaque push sur `main` : artefact Actions `graphe` (`graph.html` filtré de moins de 1 Mo et `meta.json`), conservé 90 jours. Job séparé, jamais un check requis. Format et règles : `docs/graphe-code.md` de `MoKarade/.github`. L'artefact ne contient que des chemins de fichiers et des dossiers.
