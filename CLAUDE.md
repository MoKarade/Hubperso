# CLAUDE.md — Hubperso

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
  `/login`, `/api/acces` et les assets. **Toute nouvelle route affichant des données doit
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
- **`/api/acces` traverse le garde, et ce n'est pas une exception au principe ci-dessus.**
  Le matcher est inchangé ; c'est `isPublicPath` (`lib/authGuard.ts`) qui laisse passer
  cette seule route. Elle n'est pas ouverte : elle est authentifiée **autrement**, par le
  `HUB_TOKEN` de l'app appelante — c'est un serveur qui appelle un serveur, il n'a pas de
  cookie de session à présenter. Le jeton **identifie** l'appelant, donc l'`appId` vient du
  jeton et **jamais du corps de la requête** : une app ne peut pas interroger les accès
  d'une autre.
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
  Ne pas imposer le dark mode : les deux thèmes suivent `prefers-color-scheme`.

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
npm run constellation  # interroge les 5 apps et juge la cohérence (jetons requis)
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
| `BACKLOG.md` | Ce qui est décidé mais pas fait. |
| `docs/adr/` | Décisions architecturales, `NNNN-slug.md`. L'ADR 0001 porte le modèle d'accès **et son amendement** ; l'ADR 0002, le déclenchement d'actions et ses verrous SSRF. |
| `docs/ACCES-PAR-APP.md` | Le modèle d'accès par app, en détail. |
| `docs/CONNEXION-UNIQUE.md` | Le cookie de session partagé entre les apps. |

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
sont pas la même chose.** `/api/acces` traverse le garde par `isPublicPath`, le matcher
reste inchangé. La distinction compte : l'endpoint n'est pas ouvert, il est authentifié
autrement — par le `HUB_TOKEN` de l'app appelante, parce qu'un serveur qui appelle un
serveur n'a pas de cookie de session à présenter.

## 10. Style (hérité du CLAUDE.md global de Marc)

- Réponses, commits et docs **en français** (`feat:`, `fix:`, `docs:`, …).
- Ton direct, technique mais clair. Pas de flatterie.

## 11. Ajouter une app

1. Une entrée dans `lib/sources.ts` (`id` kebab-case = `app.id` publié, `name`,
   `defaultUrl`, `urlEnv`, `tokenEnv`).
2. La variable de jeton correspondante dans l'environnement (jamais en dur).

C'est tout : le widget est rendu automatiquement à partir du summary, **et** l'app apparaît
dans `/administration` — `APPS_DISPONIBLES` (`lib/administration.ts`) dérive de `SOURCE_DEFS`
plutôt que d'être une seconde liste écrite à la main. Une liste séparée aurait fini par
diverger, et une app absente de la page d'administration serait une app dont personne ne
peut recevoir l'accès.
