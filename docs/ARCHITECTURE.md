# Architecture de Hubperso

Écrit d'après le code du dépôt (branche `main`, 11/10/2026). Quand cette page et le code
divergent, le code a raison : corriger la page dans la même PR. Les règles non négociables
vivent dans `CLAUDE.local.md` et `docs/reference-claude.md`, l'état de l'auth dans
`HANDOVER.md`, les chantiers ouverts dans `BACKLOG.md`.

## 1. Rôle

Hubperso (`hubperso.com`) est le tableau de bord privé de la constellation d'apps de Marc.
Il **consomme** le contrat `@mokarade/hub-contract` (il ne le définit pas) : il interroge le
`GET .../hub/summary` de chaque app côté serveur, valide la réponse, puis affiche des
widgets 100 % génériques. Il est aussi la **porte d'entrée unique** : la connexion Google se
fait ici, et chaque app lui demande via `POST /api/acces` si une adresse a accès chez elle
(ADR 0001, `docs/CONNEXION-UNIQUE.md`, `docs/ACCES-PAR-APP.md`).

## 2. Pile

| Couche | Choix (source : `package.json`) |
|---|---|
| Framework | Next.js `^16.3.8`, App Router, Server Components |
| UI | React `^19.3.0`, CSS maison (`app/globals.css`), `@fontsource-variable/outfit` |
| Auth | `next-auth ^5.0.0-beta.32` (Auth.js v5), fournisseur Google, session en JWT |
| Base | Neon (Postgres) via `@neondatabase/serverless` (HTTP) + Drizzle ORM `^0.45.3` |
| Contrat | `@mokarade/hub-contract`, épinglé sur le tag GitHub `v1.3.1` |
| Mesure | `@vercel/analytics` |
| Tests | Vitest `^5`, jsdom, PGlite (`@electric-sql/pglite`) pour une vraie base en mémoire |
| Qualité | ESLint 9 (CLI), TypeScript `^5.7`, dependency-cruiser, knip, `@vitest/coverage-v8` |
| Outils | drizzle-kit (migrations), tsx |
| Exécution | Node : version de `.nvmrc` ; module ES (`"type": "module"`) |

## 3. Dossiers

| Dossier | Contenu |
|---|---|
| `app/` | Pages, Server Actions (`actions.ts`), routes API, `layout.tsx`, `manifest.ts` (PWA) |
| `components/` | Composants d'affichage génériques (cartes, listes, badges, palette de commandes, service worker) |
| `lib/` | Logique : sources, récupération et validation, dérivés purs, accès, auth, base |
| `lib/db/` | `index.ts` (connexion paresseuse) et `schema.ts` (tables Drizzle) |
| `drizzle/` | Migrations SQL générées (`0000_…`, `0001_…`) et `meta/` |
| `tests/` | Tests Vitest (`*.test.ts`) et `helpers.ts` |
| `scripts/` | Garde de commit, fumée de production, retour arrière Vercel, contrôle de doc, constellation, `build-necessaire.sh` |
| `qualite/` | Portes qualité à cliquet : `portes.mjs` et `seuils.json` |
| `docs/` | ADR (`adr/0001` à `0003`), guides, état, maquettes, archive |
| `.github/` | `CODEOWNERS`, `dependabot.yml`, workflows, scripts de CI |
| Racine | `auth.ts`, `middleware.ts`, `next.config.mjs`, `vercel.json`, `drizzle.config.ts` |

## 4. Pages et routes

Pages (`app/`) : accueil (`page.tsx`), détail d'une app (`[id]/`), `attention/`, `couts/`,
`administration/` (réservée au propriétaire), `login/`, `sans-acces/`, et les pages légales
publiques `confidentialite/` et `conditions/` (exigées par la vérification Google OAuth).

Routes API :

| Route | Méthode | Protection |
|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | Auth.js (publique pour le middleware) |
| `/api/acces` | POST | Jeton `HUB_TOKEN` de l'app appelante ; l'`appId` vient du jeton, jamais du corps ; durée de réponse planchée à 250 ms |
| `/api/cron/releve` | POST | `CRON_SECRET` dédié (503 s'il est absent, 401 s'il est faux), comparaison à temps constant, `maxDuration = 60` |
| `/api/sante` | GET | Limitée en débit ; 503 `base` ou `configuration` si le hub ne peut pas servir |

## 5. Flux de données

```
variables d'env (<ID>_SUMMARY_URL, HUB_TOKEN_<ID>)
        |
lib/sources.ts  --- table APPS (6 apps) -> getSources(env) -> HubSource[]
        |
lib/fetchSummary.ts  --- fetch serveur no-store, en-tête x-hub-token, délai 9 s
        |                validateSummary (contrat) -> état honnête
        v
app/page.tsx  --- promesses lancées en parallèle, Suspense par carte
        |
        +--> dérivés purs : gel, attention, historique, carte, usage (coûts), alertes, status
        +--> historiqueDb : enregistre un relevé espacé, lit l'historique de toutes les apps
        v
components/  --- rendu générique (aucune logique propre à une app)
```

**Sources.** `lib/sources.ts` contient la table `APPS` : financeai (app principale),
driveai, batchchef, carai, jobai, memoryai. Chaque ligne a deux champs distincts :
l'adresse d'accueil et l'adresse du résumé. Le résumé vaut `null` quand aucune URL honnête
n'existe (cas de financeai : son résumé n'est pas servi par son site). Les variables
d'environnement sont dérivées de l'id (`<ID>_SUMMARY_URL`, `HUB_TOKEN_<ID>`) ; leur liste
est figée par `tests/sources.test.ts` et `lib/variablesAttendues.ts`. Une source sans URL ou
sans jeton n'est jamais interrogée (état `unconfigured`).

**Récupération.** `fetchSummary` ne rejette jamais. Il rend un état parmi : `ok`,
`unconfigured`, `unauthorized`, `unreachable`, `invalid` (hors contrat), `contract-too-new`
(le hub est à re-pinner : jamais masqué par le cache). En cas de panne, il peut servir le
dernier bon résumé, marqué `stale`, tant qu'il a moins de 30 minutes (`STALE_MAX_MS`). Aucun
chiffre n'est jamais inventé.

**Rendu.** L'accueil est dynamique (`force-dynamic`) et rendu en flux : chaque carte
attend sa propre promesse, la mise en page ne dépend pas des données (la carte principale est
déclarée à l'avance). Un rafraîchissement automatique tourne environ toutes les 15 s
(`RefreshControls`).

**Dérivés purs** (testables sans réseau) : `gel.ts` (donnée figée, seuil tiré de
`expectedMaxAgeSec` du contrat), `attention.ts`, `historique.ts`, `carte.ts`, `usage.ts`
(les coûts se somment PAR période, jamais en total global ni entre unités incomparables),
`alertes.ts`, `status.ts`.

**Base de données.** Trois tables (`lib/db/schema.ts`) : `personnes` (adresse en minuscules
en clé primaire, `actif`), `acces` (clé composite personne + `appId`, en texte pour qu'ajouter
une app ne demande pas de migration) et `releves` (historique). La connexion est paresseuse :
`DATABASE_URL` n'est exigée qu'à la première requête. `lib/migrations.ts` applique les
migrations au démarrage (`assurerMigrations()`, une fois par processus ; un échec n'éteint
pas l'app), et `tests/migrationsAppelees.test.ts` vérifie que toute route ou action qui
touche la base l'appelle. `lib/historiqueDb.ts` espace les écritures (`INTERVALLE_RELEVE_MS`)
avec un `WHERE NOT EXISTS` dans l'INSERT pour éviter la course entre instances ; une panne
d'écriture est journalisée et avalée.

**Relevés planifiés.** `.github/workflows/releve.yml` appelle `POST /api/cron/releve` toutes
les 30 minutes (Vercel Hobby n'autorise que des crons quotidiens ; GitHub étale les
déclenchements, au mieux).

**Limite de débit.** `lib/limiteDebit.ts` : fenêtre fixe en mémoire, par instance, pour les
routes à jeton et `/api/sante`. Le plafond global relève du pare-feu Vercel.

## 6. Authentification et accès

- `middleware.ts` enveloppe `auth` (de `auth.ts`). Il **ferme par défaut** : si `AUTH_SECRET`
  ou `AUTHORIZED_EMAIL` manque, 503 `auth_unconfigured`. `lib/authGuard.ts` (`decideGuard`)
  tranche : passer, 401 JSON pour une route API, redirection vers `/login` pour une page.
- Le matcher exclut seulement `api/auth`, `login`, `_next/static`, `_next/image`,
  `favicon.ico` et les fichiers à extension ; il reste aligné avec `isPublicPath`. Une route
  de données ne s'ajoute **jamais** aux exclusions : les routes à jeton passent par
  `isPublicPath`.
- Deux questions distinctes : `peutSeConnecter` (`lib/personnes.ts`, callback `signIn`) et
  `aAcces(email, appId)` (hub = `APP_HUB = "hubperso"`). `AUTHORIZED_EMAIL` est le
  propriétaire : vérifié en premier et sans réseau.
- Chaque page appelle `exigerAccesHub()` (ou `exigerProprietaire()`), chaque Server Action
  revérifie session et accès (`lib/gardeHub.ts`). `tests/gardePages.test.ts` l'impose pour
  toute `page.tsx`, `actions.ts` et `route.ts`.
- `lib/retour.ts` limite la redirection après connexion à une liste blanche de domaines.
  `lib/sessionPartagee.ts` partage le cookie de session avec les apps ; `lib/jetonsGoogle.ts`
  gère les portées OAuth ; `lib/cronAuth.ts` et `lib/jetonApp.ts` comparent les jetons à
  temps constant.
- Serveur seulement : fetch et jetons restent côté serveur, jamais de `x-hub-token` au
  navigateur, pas de CORS.
- Liens : un `href` du contrat n'est cliquable que via `safeHttpUrl` (`lib/url.ts`). Une action
  `kind: "trigger"` (`lib/declencher.ts`, ADR 0002) a quatre verrous : http(s), résumé relu
  en direct (jamais le cache), même origine que `summaryUrl`, aucune redirection suivie.
- Dates : tout `Intl.DateTimeFormat` porte `timeZone: FUSEAU` (`lib/fuseau.ts`, ADR 0003).

## 7. Portes de qualité

Gate local, rejoué par la CI : `npm run typecheck && npm run test && npm run lint && npm run build`.
Autres commandes : `npm run portes` (cliquet, voir plus bas), `npm run fumee`,
`npm run constellation` (échoue sans jetons), `npm run db:generate`.

Workflows (`.github/workflows/`) :

| Workflow | Rôle |
|---|---|
| `ci.yml` | 4 jobs : `gate` (empreinte de `docs/COMPTE-RENDU.md`, `npm ci --ignore-scripts`, typecheck, tests, lint, build), `audit` (`npm audit --omit=dev`, séparé exprès), `qualite` (`node qualite/portes.mjs`), `securite` (gitleaks sur l'historique, Semgrep). Lancé sur push `main`, PR, lundi 12 h UTC (audit seul) et à la demande |
| `ci-reutilisable.yml` | Version réutilisable de la CI |
| `doc-a-jour.yml` | Sur PR : la doc suit le code (`scripts/doc-a-jour.mjs`) |
| `constellation.yml` | Quotidien : le hub et les apps s'accordent sur identité, contrat et périodes de coût |
| `releve.yml` | Relevés d'historique (voir §5) |
| `fumee-prod.yml` | Après un déploiement Production réussi : sonde le site, retour arrière Vercel si la fumée reste rouge après 2 essais (`docs/prod-automatique.md`) |

**Cliquet qualité** (`qualite/portes.mjs`, seuils dans `qualite/seuils.json`) : mesure
typage, lint, tests, couverture (cœur = `lib/`, global, branches), code mort (knip) et
architecture (dependency-cruiser sur `app`, `lib`, `components`). L'existant est toléré, rien
ne peut reculer ; `npm run portes:maj` resserre un seuil, le desserrer demande `--forcer` et
une décision de Marc. Il écrit `qualite/rapport.json` (non versionné).

Fusion : native GitHub (« Allow auto-merge » + règles de dépôt avec contrôles requis),
détail dans `HANDOVER.md`. `.github/CODEOWNERS` et les gardes de `scripts/`
(`claude-garde.mjs`, `hooks/commit-gate.mjs`, `chemins-sensibles.json`) protègent les chemins
sensibles. Dependabot est configuré dans `.github/dependabot.yml`.

## 8. Déploiement

- Hébergement Vercel, production sur `hubperso.com` ; base Neon.
- `vercel.json` désactive les déploiements des branches `claude/*`, `agence/**` et
  `dependabot/**`, et lance `scripts/build-necessaire.sh` comme `ignoreCommand` : code de
  sortie 0 = build sauté (doc et tests seuls), 1 = build lancé ; au moindre doute il lance.
- Ce script ne voit que le diff git, pas la configuration Vercel : changer une variable
  d'environnement exige un redéploiement explicite (`FINANCEAI_SUMMARY_URL` est obligatoire
  sur Vercel).
- Une CI verte n'est pas une mise en ligne : après un changement de ce que le site sert
  (en-têtes, `next.config.mjs`, middleware, variables de build), vérifier un déploiement de
  production `READY` puis l'effet sur la réponse HTTP réelle.
- Retour arrière : `scripts/retour-arriere-vercel.mjs`, déclenché par `fumee-prod.yml`.

## 9. Règles de conception

- **Générique** : aucune logique propre à une app dans les composants ; ajouter une app =
  une ligne dans `lib/sources.ts` plus ses variables d'environnement.
- **Pas de fausse donnée** : état honnête (`unreachable`, `unauthorized`, `invalid`…), jamais
  un chiffre inventé.
- Toute réponse passe par `validateSummary`.
- UI : la couleur du contrat n'est jamais sous du texte sans `texteSur` ; les cibles
  tactiles utilisent `--cible` (48 px sous 560 px) ; PWA via `manifest.ts` et
  `components/ServiceWorker.tsx`.
- Modules `lib/` purs séparés de leurs pendants à entrées-sorties (`historique.ts` /
  `historiqueDb.ts`) pour rester testables sans base.
