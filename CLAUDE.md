# CLAUDE.md — Hubperso

Dashboard central du hub perso. Il **consomme** le contrat
[`@mokarade/hub-contract`](https://github.com/MoKarade/hub-contract) ; il ne le définit
pas. Rôle unique : fetch server-side des `GET .../hub/summary`, validation, rendu de
widgets 100 % génériques.

## Principes non négociables

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
- **Hub privé, protégé par auth.** Le hub affiche des données personnelles réelles :
  il est derrière un **login Google (Auth.js v5), une seule adresse admise**
  (`AUTHORIZED_EMAIL`). `middleware.ts` garde tout sauf `/api/auth/*`, `/login` et les
  assets. **Toute nouvelle route affichant des données doit rester derrière la
  middleware** (ne jamais l'ajouter aux exclusions du matcher) et, si elle porte des
  jetons, revérifier la session côté serveur (défense en profondeur, cf. `app/page.tsx`).
  Voir la section « Authentification » du README.
- **Sécurité des liens.** Les `href` du contrat ne deviennent cliquables que via
  `safeHttpUrl` (http/https uniquement). Ne jamais rendre un href brut.

## Ajouter une app

1. Une entrée dans `lib/sources.ts` (`id` kebab-case = `app.id` publié, `name`,
   `defaultUrl`, `urlEnv`, `tokenEnv`).
2. La variable de jeton correspondante dans l'environnement (jamais en dur).
   C'est tout : le widget est rendu automatiquement à partir du summary.

## Évolution du contrat

Quand `hub-contract` publie un nouveau tag, re-pinner ici
(`npm install github:MoKarade/hub-contract#vX.Y.Z`) seulement si on veut consommer un
nouveau champ. Un champ additif optionnel est ignoré sans re-pin (les schémas strippent
les clés inconnues).

## Vérifications avant commit

```bash
npm run typecheck && npm run test && npm run build
```

## Style (hérité du CLAUDE.md global de Marc)

- Réponses, commits et docs **en français** (`feat:`, `fix:`, `docs:`, …).
- TypeScript strict, pas de `any` silencieux.
- Erreurs honnêtes : `fetchSummary` distingue chaque mode d'échec, ne les avale pas.
- Design : direction **bento** assumée (voir `app/globals.css`), pas de template
  générique. Ne pas imposer le dark mode : les deux thèmes suivent `prefers-color-scheme`.
