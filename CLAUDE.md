# CLAUDE.md — Hubperso

Dashboard du hub perso (`hubperso.com`). Il **consomme** le contrat
[`@mokarade/hub-contract`](https://github.com/MoKarade/hub-contract) (il ne le définit pas) :
fetch server-side des `GET .../hub/summary`, validation, rendu de widgets 100 % génériques.
**Stack** : Next.js 16 (App Router) · Neon + Drizzle · Auth.js v5 · Vitest.

Ce fichier se charge à **chaque session** : il reste ≤ 60 lignes (`tests/claudeMd.test.ts`).
Le détail vit dans [`docs/reference-claude.md`](docs/reference-claude.md) — le lire par section
(Grep/Read ciblé), jamais en entier.

## Index de la référence (`docs/reference-claude.md`)

- Auth, accès, routes à jeton, SSRF, fuseau → `## 1. Principes non négociables`
- TypeScript, design, couleurs, cibles tactiles → `## 2. Conventions de code`
- Git → `## 3. Workflow git` · Commandes → `## 4. Commandes utiles`
- Gate, CI, audit → `## 5. Vérifications avant commit`
- Déploiement Vercel → `## 6. Après un merge : vérifier le DÉPLOIEMENT`
- Contrat, re-pin, constellation → `## 7. Le contrat, et ce qu'on en consomme`
- Carte des docs, ADR → `## 8. Documentation (où vit quoi)`
- Leçons (PWA, Sonar, relevés) → `## 9. Leçons apprises`
- Style et compte-rendu → `## 10.` · Ajouter une app → `## 11. Ajouter une app`

## Commandes
`npm run dev` · `test` (vitest) · `typecheck` · `lint` (ESLint CLI) · `build` · `constellation`
(6 apps, jetons requis). **Gate avant commit** : `npm run typecheck && npm run test && npm run lint && npm run build`.

## Règles propres (résumé, détail en §1 et §2 de la référence)
- **Générique** : aucune logique spécifique à une app dans les composants. **No fake data** :
  état honnête (`unreachable` / `unauthorized` / `building`), jamais un chiffre inventé.
- Toute réponse passe par `validateSummary` ; fetch et jetons **server-side only**.
- **Auth** : toute page appelle `exigerAccesHub()`, toute Server Action revérifie session ET accès.
  Ne jamais ajouter de route de données aux exclusions du matcher de `middleware.ts`.
- **Liens** : href cliquable seulement via `safeHttpUrl`. **Dates** : `timeZone: FUSEAU`.
- **Coûts** : somme par période, jamais de total global.
- **Git** : PR `--base main` explicite, jamais `--force` sur `main`, jamais `--no-verify`. Fusion : `gh pr create --base main …` puis `gh pr merge --auto --squash <n>` (GitHub fusionne seul quand les contrôles requis sont verts ; jamais de fusion à la main). Sauf chemins de `.github/CODEOWNERS` (`.github/`, `scripts/hooks/`, `qualite/`, `vercel.json`, `drizzle/`, `.env*`) : PR NON armée, l'approbation de Marc (CODEOWNERS) est requise.
- **Déploiement** : CI verte ≠ en ligne ; vérifier le déploiement `READY` après un merge qui change ce qui est servi.
- **Doc** : mettre à jour la doc touchée dans la MÊME PR que le code.

## Docs
`README.md` · `HANDOVER.md` (état réel de l'auth, à lire en premier) · `BACKLOG.md` ·
`docs/adr/` · `docs/ACCES-PAR-APP.md` · `docs/CONNEXION-UNIQUE.md` · `docs/ETAT.md` ·
`docs/SECURITE.md` · `docs/prod-automatique.md` (fumée, retour arrière) · `docs/claude-github.md`
(garde de correction) · `docs/COMPTE-RENDU.md` (convention de compte-rendu, copie synchronisée).
Convention de structure : [STRUCTURE-DEPOT](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md).
