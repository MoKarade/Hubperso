# ARCHITECTURE — Hubperso

Carte structurelle du dépôt : quel dossier fait quoi, et comment l'authentification
traverse le tout. Le « pourquoi » du hub est dans `README.md` ; les règles détaillées pour
une session Claude sont dans `docs/reference-claude.md` (par section, jamais en entier) ;
l'historique des décisions vit dans `HANDOVER.md` et `docs/adr/`.

## Stack

Next.js 15 (App Router, Server Components), React 19, TypeScript strict, Auth.js v5
(bêta), Neon (Postgres serverless) + Drizzle ORM, Vitest, déployé sur Vercel.

## Ce que le hub fait

Il **consomme** (ne définit pas) le contrat
[`@mokarade/hub-contract`](https://github.com/MoKarade/hub-contract) : `GET .../hub/summary`
de six apps (FinanceAI, DriveAI, BatchChef, CarAI, JobAI, MemoryAI — `lib/sources.ts`),
validation de chaque réponse, rendu en widgets génériques. Aucune logique propre à une app
dans les composants.

## Carte des dossiers

### `app/` — pages et routes (App Router)

| Chemin | Rôle |
|---|---|
| `app/page.tsx` | Accueil : grille bento des six apps. |
| `app/app/[id]/page.tsx` | Vue détaillée d'une app. |
| `app/attention/page.tsx` | Alertes à régler/surveiller, continuité d'observation (`lib/gel.ts`). |
| `app/couts/page.tsx` | Coûts publiés par les apps, sommés PAR PÉRIODE. |
| `app/administration/page.tsx` | Gestion des accès — réservée au propriétaire (`exigerProprietaire`). |
| `app/login/page.tsx`, `app/sans-acces/page.tsx` | Connexion Google ; accès refusé. |
| `app/confidentialite/page.tsx`, `app/conditions/page.tsx` | Pages légales publiques, sans session (`components/PagePublique.tsx`). |
| `app/api/acces/route.ts` | `POST`, serveur à serveur, `x-hub-token`. |
| `app/api/auth/[...nextauth]/route.ts` | Handler Auth.js (connexion Google). |
| `app/api/cron/releve/route.ts` | `POST`, appelé par `releve.yml`, `CRON_SECRET`. |
| `app/actions.ts` | Server Actions — revérifient session ET accès à chaque appel. |
| `app/layout.tsx` | Layout racine : police, manifeste PWA, Service Worker, Vercel Analytics. |

### `lib/` — logique pure et accès aux données (34 modules)

- **Auth et accès** : `authGuard.ts` (`isPublicPath`/`decideGuard`, lu par `middleware.ts`),
  `gardeHub.ts` (`exigerAccesHub`/`exigerProprietaire`), `authorized.ts`, `authConfigured.ts`,
  `personnes.ts` (`peutSeConnecter`), `sessionPartagee.ts`, `jetonApp.ts`, `jetonsGoogle.ts`
  (portées Google, rafraîchissement), `cronAuth.ts`.
- **Données des apps** : `sources.ts` (table des six apps, jetons, URLs), `fetchSummary.ts`
  (fetch + validation + cache de résilience), `constellation.ts` (cohérence identité/coût
  entre ce que le hub croit et ce que l'app publie).
- **Dérivés et affichage** : `attention.ts`, `alertes.ts`, `carte.ts`, `bento.ts`,
  `couleur.ts`, `status.ts`, `icones.ts`, `palette.ts`, `format.ts`, `fuseau.ts`, `usage.ts`,
  `url.ts` (filtre `http(s)` sur les `href` du contrat), `retour.ts`.
- **Historique et horloge** : `historique.ts`, `historiqueDb.ts`, `gel.ts` (détection de
  « trou » d'observation), `declencher.ts` (actions `kind: "trigger"`, verrous SSRF).
- **Base** : `db/index.ts`, `db/schema.ts` (tables `personnes`, `acces`, `historique` — voir
  plus bas), `migrations.ts`.
- **Autres** : `limiteDebit.ts` (garde-fou de débit), `administration.ts`.

### `components/` — 20 composants, tous génériques

`AppWidget`, `ActionList`, `AlertBanner`/`AlertList`, `BandeauAttention`, `BoutonTrigger`,
`CostsCard`, `Icone`, `LignesDetail`, `MetricList`, `PagePublique` (pages légales),
`PaletteCommandes`/`PaletteMontee` (palette de commandes), `Recommandation`,
`RefreshControls`, `ServiceWorker`, `SignOutButton`, `Sparkline`, `StatusBadge`,
`WidgetSkeleton`. Aucun ne connaît le nom d'une app.

### `drizzle/` et `tests/`

Migrations Postgres (`drizzle/`) et suite Vitest (`tests/`, un fichier par module ou par
garde — `gardePages.test.ts` impose `exigerAccesHub()`/`exigerProprietaire()` sur chaque
page, `ciblesTactiles.test.ts` impose `min-height: var(--cible)` sur chaque élément
cliquable, `kitAutoMerge.test.ts` verrouille le kit CI).

## Flux d'authentification

1. **Connexion** : Google, via Auth.js v5, stratégie `jwt` — aucune session ni jeton Google
   en base (`lib/db/schema.ts` ne porte que `personnes`/`acces`/`historique` ; le jeton vit
   uniquement dans le cookie de session chiffré, le temps de la connexion).
2. **Garde globale** : `middleware.ts` protège tout, SAUF ce que `isPublicPath()`
   (`lib/authGuard.ts`) déclare public — `/login`, `/confidentialite`, `/conditions`,
   `/api/auth/*`, `/api/acces`, `/api/cron/releve`, les assets statiques. **Aucune
   exclusion n'est jamais ajoutée au matcher** : une route publique passe par
   `isPublicPath`, jamais par le matcher.
3. **Qui peut se connecter** : `peutSeConnecter(email)` (`lib/personnes.ts`), au callback
   `signIn` — le propriétaire (`AUTHORIZED_EMAIL`, vérifié SANS réseau) ou une personne
   invitée active dans la table `personnes`.
4. **Qui voit quoi** : chaque page appelle `exigerAccesHub()` ou `exigerProprietaire()`
   (plus stricte) ; chaque Server Action revérifie session ET accès (`aAcces()` /
   `estProprietaire()`). `tests/gardePages.test.ts` l'impose sur `page.tsx`, `actions.ts` et
   `route.ts`.
5. **Connexion unique** : le cookie de session est partagé sur `.hubperso.com`
   (`AUTH_COOKIE_DOMAIN`, un seul `AUTH_SECRET`) entre Hubperso, JobAI, CarAI et BatchChef —
   se connecter à l'une vaut pour les quatre. Détail et nuances (client OAuth NON partagé,
   par app) : `docs/CONNEXION-UNIQUE.md`.
6. **Portées Google demandées par ce client** (`lib/jetonsGoogle.ts`) : identité
   (`openid email profile`) + Google Tasks — jamais Drive, Agenda ou Feuilles de calcul.

## Ce que le hub stocke, et ne stocke pas

- **Base** (`lib/db/schema.ts`) : `personnes` (email, nom, actif), `acces` (email × appId),
  `historique` (résumés déjà publiés par les apps, en `jsonb`, pour la détection de gel et
  les courbes).
- **Rien de plus** : aucune session ni jeton Google persisté, aucune donnée brute d'app
  (fichier, tâche, courriel) — seulement les indicateurs que le contrat expose déjà.

## CI (`.github/workflows/`)

`ci.yml` (gate typecheck/tests/lint/build, qualité, sécurité, audit, « la doc suit le
code »), `auto-merge.yml` (fusion automatique événementielle), `constellation.yml`
(cohérence quotidienne des six apps), `doc-a-jour.yml`, `releve.yml` (l'horloge du hub,
cron). Détail des vérifications : `docs/reference-claude.md` §5.

## Pour aller plus loin

`README.md` (le pourquoi, pour un lecteur extérieur) · `docs/reference-claude.md` (règles
détaillées, par section) · `docs/adr/` (décisions architecturales) · `HANDOVER.md` (état
réel, historique des sessions) · `docs/CONNEXION-UNIQUE.md` · `docs/ACCES-PAR-APP.md` ·
`docs/SECURITE.md`.
