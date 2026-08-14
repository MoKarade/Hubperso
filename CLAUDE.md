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
npm run typecheck && npm run test && npm run lint && npm run build
```

*(`lint` = ESLint CLI : `next lint` est déprécié et retiré dans Next 16. Le bloc
`ignores` de `eslint.config.mjs` est indispensable — l'ESLint CLI n'ignore pas
`node_modules`/`.next` implicitement, contrairement à `next lint`.)*

La **CI** (`.github/workflows/ci.yml`) rejoue exactement ce gate, plus un job `audit`
séparé (`npm audit --omit=dev`, aussi en hebdomadaire). Séparé volontairement : un avis
de sécurité paraît sans qu'une ligne n'ait changé — mêlé au gate, il peindrait le dépôt
en rouge sans rapport avec le code, et on prendrait l'habitude du rouge.

## Après un merge : vérifier le DÉPLOIEMENT, pas seulement la CI

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

## Style (hérité du CLAUDE.md global de Marc)

- Réponses, commits et docs **en français** (`feat:`, `fix:`, `docs:`, …).
- TypeScript strict, pas de `any` silencieux.
- Erreurs honnêtes : `fetchSummary` distingue chaque mode d'échec, ne les avale pas.
- Design : direction **bento** assumée (voir `app/globals.css`), pas de template
  générique. Ne pas imposer le dark mode : les deux thèmes suivent `prefers-color-scheme`.
