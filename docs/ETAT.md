# ETAT — Hubperso (relecture du 2026-10-14, base `e4be344`)

Photo de l'état réel du dépôt, issue d'une relecture en lecture seule. Le détail historique vit
dans `HANDOVER.md`, les chantiers ouverts dans `BACKLOG.md`. Tous les chiffres ci-dessous sont
ceux du 14/10/2026 ; ils se périment à chaque PR.

## Architecture
- Next.js 16 (`next` ^16.3.8) / React 19, Auth.js v5 (beta), Drizzle + Neon (PGlite en test),
  Vitest 5. Source : `package.json`.
- Le hub consomme `GET /hub/summary` des 6 apps via `@mokarade/hub-contract`
  (épinglé `v1.3.1`, cf. `package.json`).
- `app/` : pages (accueil, `app/[id]`, attention, couts, administration, login, sans-acces,
  conditions, confidentialite) et routes `api/acces`, `api/auth`, `api/cron/releve`, `api/sante`.
- `lib/` : 33 modules (+ `lib/db/`) ; `components/` : 25 ; `drizzle/` : 2 migrations ;
  `tests/` : 57 fichiers de test.
- CI (`.github/workflows`) : `ci`, `constellation` (quotidien), `doc-a-jour`, `releve`
  (cron `*/30`), `fumee-prod` (après chaque déploiement Production réussi, depuis #104 le
  01/10). `ci-reutilisable.yml` est un gabarit qu'aucun workflow n'appelle.
- ADR : `docs/adr/0001` à `0003`.

## État
- **Fusion native GitHub depuis le 01/10/2026** (PR #100) : `gh pr merge --auto --squash`,
  contrôles requis par ruleset, `.github/CODEOWNERS` pour les chemins humains. L'ancien
  `auto-merge.yml` et son kit sont retirés.
- Dernier commit sur `main` : 01/10/2026 (#104). Aucune fusion entre le 01/10 et le 14/10.
- Aucun `TODO`/`FIXME`/`eslint-disable`/`@ts-ignore` dans `app/`, `lib/`, `components/`.
- Le relevé d'historique écrit au plus un point par app toutes les 15 min
  (`INTERVALLE_RELEVE_MS`, `lib/historiqueDb.ts`) ; le cron GitHub passe toutes les 30 min.
- Le nombre de tests n'est pas figé ici : il se périme à chaque PR (voir la CI).

## Dette visible
- Fichiers les plus longs : `lib/carte.ts` (449 lignes), `components/AppWidget.tsx` (296),
  `lib/fetchSummary.ts` (254), `lib/gel.ts` (248). `app/app/[id]/page.tsx` est redescendu à
  132 lignes (découpe en sous-composants, `f176f3e`).
- La table des apps est unique depuis le 30/09 (`APPS` dans `lib/sources.ts`) ; le taux de
  duplication SonarCloud après ce changement reste [À vérifier].
- `BACKLOG.md` : plusieurs items H-xx ouverts ; H-25 : rien n'empêche par test de rendre un
  `href` du contrat sans `safeHttpUrl`.
- `CLAUDE.md` (≤ 60 lignes, détail dans `docs/reference-claude.md`) recoupe `HANDOVER.md` :
  risque de dérive entre les deux.

## Risques
- `FINANCEAI_SUMMARY_URL` est obligatoire sur Vercel ; une variable posée exige un redéploiement.
- Le relevé dépend d'un cron GitHub Actions (best-effort) ; `assurerMigrations()` doit être appelé
  par toute route ou action qui touche la base (garde : `tests/migrationsAppelees.test.ts`).
- `fumee-prod.yml` fait un retour arrière Vercel RÉEL si la fumée reste rouge ; il lit le secret
  `VERCEL_TOKEN`. Sa présence dans le dépôt est [À vérifier] (non lisible depuis une session).
- Dépendances : `next-auth` en beta ; `hub-contract` épinglé par tag GitHub.
- Le propriétaire passe sans réseau : « je me connecte, ça marche » ne prouve rien sur le modèle
  d'accès (voir la procédure d'invitation du README).
- À vérifier par Marc : la réponse réellement servie par `hubperso.com` (HANDOVER, session 21/09).
