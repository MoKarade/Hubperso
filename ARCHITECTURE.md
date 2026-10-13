# Hubperso - Architecture et contrats

> Carte du dépôt pour NotebookLM (carnet du dépôt et Carnet Maître inter-apps). À mettre à jour dans la même PR quand une interface publique, une dépendance externe ou un terme métier change. Rédigé à partir de main au commit e4be3448a6fb, le 2026-10-13.

## 1. Responsabilité du dépôt
**Domaine :** tableau de bord central du hub perso (`hubperso.com`) et porte d'entrée commune des apps (connexion unique, accès par app).
**Rôle :** interroge côté serveur le `GET .../hub/summary` de chaque app, valide chaque réponse contre le contrat `@mokarade/hub-contract` et rend un widget générique par app dans une grille bento. Il ne connaît rien des apps au-delà du contrat. Il gère aussi l'authentification Google, les accès par app et une horloge de relevés.
**Déploiement :** Vercel (production sur `hubperso.com`, origine canonique servie sans redirection : `www.hubperso.com`). Cloudflare Access peut rester devant comme couche réseau, mais n'est plus la barrière.

## 2. Interfaces publiques (contrats)
*Ce que les autres dépôts, Hubperso, Claude ou l'utilisateur peuvent appeler.*
- `POST /api/acces` : répond aux autres apps « telle adresse a-t-elle accès à toi ? ». Authentifié par le jeton hub de l'app appelante ; l'identifiant d'app vient du jeton, jamais du corps. Appelé par JobAI, CarAI et BatchChef à chaque lecture de session (MemoryAI ne l'appelle jamais).
- `GET|POST /api/auth/*` : routes Auth.js (NextAuth v5), login Google et rappel OAuth.
- `POST /api/cron/releve` : horloge du hub (ADR 0003), appelée par le workflow GitHub `releve.yml` avec un secret dédié ; écrit un relevé par app (espacement minimal 15 min) ; 503 si non configurée, 500 si l'écriture échoue.
- `GET /api/sante` : sonde publique de la vigie, rend `{ ok }` ou 503 `{ ok: false, cause: "base" | "configuration" }`, `no-store`, limite 10 requêtes/min par client.
- Pages (toutes gardées par session et accès `hubperso`) : `/` (grille des apps), `/app/[id]` (détail d'une app), `/attention`, `/couts`, `/administration` (propriétaire seulement), `/login`, `/sans-acces`, `/conditions`, `/confidentialite` ; manifeste PWA (`app/manifest.ts`).
- Server Actions : `app/actions.ts` et `app/administration/actions.ts` (revérifient session et accès). Déclenchement d'action d'app depuis le hub (`lib/declencher.ts`, ADR 0002) : contrat exact [à compléter].
- Outils MCP : aucun documenté.
- Contrat Hub : **consommateur** de `@mokarade/hub-contract`, épinglé sur le tag `v1.3.1` dans `package.json`. Toute réponse passe par `validateSummary`. États honnêtes d'un widget : `unconfigured` (avec sa cause : URL et/ou jeton manquant), `unauthorized` (401), `unreachable` (réseau, 5xx, délai 9 s), `invalid` (hors contrat), `contract-too-new` (le hub doit être re-pinné). Dernier résumé valide resservi « En cache » s'il a moins de 30 min.
- Session partagée : cookie de session commun à toutes les apps sous `hubperso.com` (`docs/CONNEXION-UNIQUE.md`), lu côté apps via le sous-chemin `/session` du contrat (signature ES256 selon hub-contract). Usage exact de `lib/sessionPartagee.ts` : [à compléter].

## 3. Dépendances externes
*Ce que ce dépôt appelle.*
- **Autres dépôts de Marc :** hub-contract (paquet de contrat). Six apps sources, déclarées dans `lib/sources.ts` : FinanceAI (pas d'URL par défaut : résumé servi par un serveur MCP auto-hébergé, URL à configurer obligatoirement), DriveAI (`drive.hubperso.com/hub/summary`), BatchChef (`batchchef.hubperso.com/api/hub/summary`), CarAI (`carai.hubperso.com/hub/summary`), JobAI (`emploi.hubperso.com/api/hub/summary`), MemoryAI (`memoryai.hubperso.com/hub/summary`). Kit de portes qualité de l'atelier (S6).
- **Services externes :** Vercel (hébergement, Analytics, vérification des déploiements, retour arrière via `scripts/retour-arriere-vercel.mjs`) ; Neon Postgres (pilote serverless) avec Drizzle ; Google OAuth via Auth.js ; GitHub Actions (CI, relevés, constellation, fumée prod, doc à jour, Dependabot, fusion automatique native) ; SonarCloud (duplication) ; gitleaks et Semgrep ; Cloudflare Access (optionnel).
- **Données :** base Neon avec les tables `personnes`, `acces` et `releves` (historique des métriques). Aucune donnée d'app ni session en base (session JWT). Migrations appliquées au démarrage (`lib/migrations.ts`).

## 4. Carte structurelle
*L'arbre complet est généré automatiquement dans la source 00 ; ici, seulement le rôle des dossiers.*
```text
app/          -> pages App Router (Server Components), routes API (app/api/), Server Actions, manifeste PWA
components/   -> widgets génériques (AppWidget, métriques, alertes, actions, coûts, recommandation, sparkline, palette)
lib/          -> logique : sources, fetchSummary, usage (coûts par période), historique et gel, attention,
                 auth et accès (personnes, gardeHub, authGuard), jetons, limite de débit, fuseau
lib/db/       -> client et schéma Drizzle (Neon)
drizzle/      -> migrations SQL générées et métadonnées drizzle-kit
public/       -> icônes et service worker de la PWA
scripts/      -> fumée (prod), garde Claude, doc à jour, retour arrière Vercel, vérification de la constellation, commit-gate
qualite/      -> portes qualité de l'Atelier et seuils du cliquet
tests/        -> tests Vitest (logique, composants, garde des pages, migrations PGlite)
docs/         -> accès par app, connexion unique, sécurité, état, ADR, maquettes de refonte, référence Claude
.github/      -> workflows (CI, relevé, constellation, fumée prod, doc à jour), CODEOWNERS, Dependabot
```

## 5. Glossaire métier (anti-hallucination)
- **Hub :** ce tableau de bord ; il se traite lui-même comme une app (`APP_HUB = "hubperso"`).
- **Source :** une app déclarée dans `lib/sources.ts` (table unique `APPS`, une ligne par app depuis le 30/09/2026), avec son URL d'accueil et son URL de résumé.
- **Summary / résumé :** JSON `HubSummary` publié par une app sur `/hub/summary`.
- **Widget / carte bento :** rendu générique d'un summary ; taille dérivée de la richesse du summary, couleur tirée de `app.color`, formats fr-CA.
- **Propriétaire :** Marc ; vérifié en premier et sans réseau, entre toujours.
- **Peut se connecter / a accès ici :** deux questions distinctes (`peutSeConnecter`, puis `aAcces` via `exigerAccesHub`). Connecté sans accès au hub : `/sans-acces`.
- **Accès par app :** table `acces`, gérée dans `/administration`, interrogée par les autres apps via `POST /api/acces`.
- **Relevé / horloge :** enregistrement périodique des métriques, déclenché par GitHub Actions, même quand personne ne regarde.
- **Gel / donnée figée :** donnée plus vieille que `expectedMaxAgeSec` déclaré par l'app ; le seuil vient toujours de l'app (`lib/gel.ts`).
- **Trous d'observation :** intervalles sans relevé, affichés sur `/attention` plutôt que lissés.
- **Coûts par période :** somme des `cost` par période (`total`, `mois`, `jour`), jamais de total global (`lib/usage.ts`).
- **Constellation :** vérification des six apps de bout en bout (`npm run constellation`, jetons requis).
- **Fumée prod :** contrôle post-déploiement (`fumee-prod.yml`, non armé à ce commit).
- **Re-pin :** mise à jour du tag du contrat ; le hub d'abord, les apps ensuite.
- **Cliquet :** seuils qualité qui ne peuvent que se resserrer.
- **ID backlog :** préfixe `H-xx:` ou `HORS-BACKLOG:` en tête de commit, contrôlé par `doc-a-jour.yml`.

## 6. Pour aller plus loin
- `README.md` : architecture, authentification et configuration.
- `CLAUDE.md` : règles de travail (≤ 60 lignes) et index de `docs/reference-claude.md`.
- `HANDOVER.md` : journal des sessions (auth, accès, sources, fusion automatique) ; `docs/ETAT.md` : état courant.
- `BACKLOG.md` : tâches `H-xx`.
- `docs/adr/` : 0001 authentification centralisée, 0002 déclenchement d'action d'app, 0003 horloge propre au hub.
- `docs/ACCES-PAR-APP.md`, `docs/CONNEXION-UNIQUE.md`, `docs/SECURITE.md`, `docs/prod-automatique.md`.
