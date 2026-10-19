# ADR 0004 — Toucher une carte ouvre un onglet : ce que le hub peut et ne peut pas faire

- **Statut** : accepté (session Claude, 19/10/2026) — constat de Marc ; aucune décision de Marc à attendre
- **Portée** : Hubperso uniquement (`components/AppWidget.tsx`, `app/manifest.ts`). Aucune app n'a à changer.
- **Tâche** : Hubperso#253 (suite de #139)

## Contexte

Marc, 18/09/2026 : « lorsque j'ouvre depuis le hub ça ouvre l'application installée ». Marc, 19/10/2026
(réponse à la tournée #139) : sur son téléphone, toucher une carte ouvre un **onglet** du navigateur.

Ce que le hub fait déjà pour la bascule : le titre de la carte est un lien de premier niveau, sans
`target="_blank"` (verrou `tests/pwaLiens.test.ts`). Son manifeste porte `scope: "/"`, `id: "/"` et
`launch_handler: { client_mode: "navigate-existing" }`.

## Ce qui est établi

1. **[Certain] Une PWA installée sur Android (WebAPK) ne revendique que les URL de SON origine et de
   SON `scope`.** web.dev, « WebAPKs on Android » : elle enregistre des filtres d'intention « for all
   URLs within the scope of the app », et `scope` dit à Android d'ouvrir l'app « only if the URL matches
   the origin + scope ». Le hub est installé sur `www.hubperso.com` : son périmètre est cette origine.
2. **[Certain] Une carte pointe ailleurs.** Les liens des cartes vont vers `finance.hubperso.com`,
   `drive.hubperso.com`, `batchchef.hubperso.com`, `emploi.hubperso.com`, `carai.hubperso.com`,
   `memoryai.hubperso.com` (`lib/sources.ts`) : d'autres origines, donc hors du périmètre du hub.
   `scope` ne peut pas les y ajouter : MDN dit que la portée se définit par chemin, et la spécification du
   manifeste la veut de la même origine que le manifeste.
3. **[Certain] Hors périmètre, le navigateur n'est pas tenu de rester dans l'app.** MDN : « Off-scope
   navigations are not blocked by browsers and are allowed to be opened in a new top-level browsing
   context ». C'est ce que Marc voit : un onglet.
4. **[Certain] `launch_handler` ne change rien ici.** Il règle ce qui se passe quand le hub lui-même est
   lancé avec une URL (fenêtre existante ou nouvelle) ; il ne dit rien des liens vers d'autres origines.
5. **[À vérifier] Si l'app visée est installée, est-ce qu'Android lui passe la main depuis un lien touché
   dans le hub installé ?** Aucune source consultée ne le dit pour ce cas précis (hub installé → lien vers
   l'origine d'une AUTRE app installée). La documentation Chrome sur la capture de liens (« link
   capturing ») parle d'un réglage que l'utilisateur choisit, décrit surtout pour ChromeOS, sans traiter
   le cas Android. On ne bâtit rien sur une inférence.

## Décision

- **Rien ne change dans le code.** Aucun réglage du hub (scope, `launch_handler`, `target`) ne peut faire
  entrer une autre origine dans son périmètre ; ajouter un `target="_blank"` ou rediriger par le hub
  aggraverait le cas (onglet garanti, `tests/pwaLiens.test.ts` le refuse déjà).
- On garde la condition nécessaire qui est de notre côté : lien de premier niveau, sans `_blank`. Elle
  ne PROMET pas la bascule ; elle ne l'empêche pas.
- Le constat « un onglet s'ouvre » est donc **le comportement attendu par conception** tant qu'on n'a pas
  montré le contraire sur un téléphone, pas un défaut du hub.
- Pour trancher le point 5, le seul essai possible est sur le téléphone de Marc : app visée installée,
  puis toucher sa carte dans le hub. Ce n'est pas demandé ici (pas de geste de Marc ouvert pour ça) ;
  si Marc le fait un jour et que la bascule marche, on le note ici sans rien changer au code.

## Conséquences

- La phrase de `docs/reference-claude.md` (leçon n° 9) et le commentaire de `tests/pwaLiens.test.ts`
  gardent leur sens : `_blank` éteint la bascule quand elle existe. Ils ne disent pas qu'elle existe pour
  un lien vers une AUTRE origine ; ce document le précise.
- Alternative écartée : `scope_extensions` / association d'origines (Chrome). Elle vise à étendre le
  périmètre d'une PWA à d'autres origines d'un même éditeur, mais la prise en charge sur Android n'est
  pas établie par les sources consultées : [À vérifier], non essayée, rouvrir seulement sur demande de Marc.

## Sources

- web.dev, « WebAPKs on Android » : <https://web.dev/articles/webapks>
- MDN, manifeste `scope` : <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope>
- MDN, manifeste `launch_handler` : <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler>
- Chrome, « declarative link capturing » : <https://developer.chrome.com/docs/web-platform/declarative-link-capturing>
