# ETAT — Hubperso (relecture du 2026-09-25, base `92d0446`)

Photo de l'état réel du dépôt, issue d'une relecture en lecture seule. Le détail historique vit
dans `HANDOVER.md`, les chantiers ouverts dans `BACKLOG.md`.

## Architecture
- Next.js 15 / React 19, Auth.js v5 (beta), Drizzle + Neon (PGlite en test), Vitest.
- Le hub consomme `GET /hub/summary` des 6 apps via `@mokarade/hub-contract` (épinglé `v1.3.0`).
- `app/` : pages (accueil, `app/[id]`, attention, couts, administration, login, sans-acces) et
  routes `api/acces`, `api/auth`, `api/cron/releve`.
- `lib/` : ~48 modules (accès, sources, dérivés, historique, base) ; `components/` : 17 ;
  `drizzle/` : 2 migrations ; `tests/` : ~44 fichiers.
- CI (`.github/workflows`) : ci, auto-merge, constellation, doc-a-jour, releve (cron `*/30`).
- ADR : `docs/adr/0001` à `0003`.

## État
- Fusion auto active (`auto-merge.yml`). Aucun `TODO`/`FIXME`/`eslint-disable`/`@ts-ignore`
  dans `app/`, `lib/`, `components/`.
- Le relevé d'historique écrit au plus un point par app toutes les 15 min
  (`INTERVALLE_RELEVE_MS`, `lib/historiqueDb.ts`) ; le cron GitHub passe toutes les 30 min.
- Le nombre de tests n'est pas figé ici : il se périme à chaque PR (voir la CI).

## Dette visible
- Fichiers les plus longs : `app/app/[id]/page.tsx` (412 lignes), `lib/carte.ts` (268),
  `components/AppWidget.tsx` (266), `lib/fetchSummary.ts` (254), `lib/gel.ts` (248).
- Duplication Sonar proche du seuil (table `SOURCE_DEFS`, six entrées quasi identiques).
- `BACKLOG.md` (~475 lignes) : plusieurs items H-xx ouverts ; H-25 : rien n'empêche par test de
  rendre un `href` du contrat sans `safeHttpUrl`.
- `CLAUDE.md` (44 lignes, détail dans `docs/reference-claude.md`) recoupe `HANDOVER.md` : risque de dérive entre les deux.

## Risques
- `FINANCEAI_SUMMARY_URL` est obligatoire sur Vercel ; une variable posée exige un redéploiement.
- Le relevé dépend d'un cron GitHub Actions (best-effort) ; `assurerMigrations()` doit être appelé
  par toute route ou action qui touche la base (garde : `tests/migrationsAppelees.test.ts`).
- Dépendances : `next-auth` en beta ; `hub-contract` épinglé par tag GitHub.
- Le propriétaire passe sans réseau : « je me connecte, ça marche » ne prouve rien sur le modèle
  d'accès (voir la procédure d'invitation du README).
- À vérifier par Marc : la réponse réellement servie par `hubperso.com` (HANDOVER, session 21/09).
