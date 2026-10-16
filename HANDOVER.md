# HANDOVER — Journal des sessions du hub (auth, accès, sources ; plus récent en tête)

> État courant synthétique : voir `docs/ETAT.md`.

## 🟦 Session 2026-10-01 — **Fusion native GitHub (phase P1 du plan « stratégie PR »)**

La fusion automatique est désormais celle de GitHub (« Allow auto-merge » activé sur le dépôt, ruleset = contrôles requis).
- **Règle d'ouverture de PR** : `gh pr create --base main …` puis `gh pr merge --auto --squash <n>`. Les PR qui touchent un chemin de `.github/CODEOWNERS` ne sont PAS armées : Marc approuve.
- **Retirés** : `.github/workflows/auto-merge.yml`, `.github/auto-merge.json`, `modeles/auto-merge/`, `COPIES.md`, `tests/kitAutoMerge.test.ts`. Les paragraphes plus bas sur le kit (`fusionner.mjs`, `verifier-copies.mjs`, `COPIES.md`, `auto-merge.json`) décrivent l'ancien mécanisme : historique seulement. Les chemins sensibles de l'ancien `chemins_label_validation` (auth, middleware, `app/api/**`) n'exigent plus d'attestation ; leur revue relève des contrôles requis et de la phase 6 du plan (revue Claude sur chemins sensibles).
- **Ajoutés** : `.github/CODEOWNERS` (4 cas humains : `.github/`, scripts de porte, `drizzle/`, secrets/variables), `cooldown: default-days: 3` dans Dependabot.
- Arrêt d'urgence : décocher « Allow auto-merge » (Settings → General). La variable `AUTOMERGE_OFF` n'existe plus.


## 🟦 Session 2026-09-28 — **Kit auto-merge : deux notes qui n'ont plus d'autre foyer**

PR #92 (pole-securite, pose `securite_login`). Le retrait de `.github/workflows/armement-auto-merge.yml`
(profil `prive` — dépôt privé Free, pas d'auto-fusion native, voir `COPIES.md`) régénère ce fichier
par l'outil (`modeles/auto-merge/verifier-copies.mjs --ecrire-copies`), qui l'écrase entièrement :
la section manuelle « Écarts propres à Hubperso » posée à l'installation du kit (PR #89) a disparu
avec. Ce qui suit était son point 3 et une partie du point 4, relogés ici pour ne pas les perdre.

**Chemins sensibles propres à Hubperso.** `.github/auto-merge.json` (`chemins_label_validation`)
déclare `auth.ts`, `middleware.ts`, `lib/authGuard.ts`, `lib/gardeHub.ts`, `lib/sessionPartagee.ts`,
`lib/jetonApp.ts`, `lib/jetonsGoogle.ts`, `app/api/**`, `vercel.json`, `next.config.mjs`,
`drizzle/**`, `drizzle.config.ts`, `scripts/build-necessaire.sh` — une PR qui y touche exige le
label `validation-marc` pour se fusionner seule (`qualite/**`, lui, est dans `chemins_interdits` :
bloqué net, jamais fusionnable seul, cliquet oblige). Ces chemins remplacent l'ancienne garde
maison `scripts/gardeChemins.mjs`, supprimée avec l'installation du kit auto-merge de l'Atelier
(PR #89) : c'est désormais le kit qui les protège, pas un script propre à ce dépôt.
`tests/kitAutoMerge.test.ts` vérifie qu'aucun n'a été perdu en route.

**Perte assumée : neutralisation des échecs « quota » Vercel.** Avant le kit, une garde maison
(`estUnQuota`, dans l'ancien `scripts/autoMerge.mjs`, supprimé par la PR #89) neutralisait
spécifiquement un échec Vercel dû au quota, pour ne pas bloquer une fusion légitime sur un hoquet
de facturation plutôt qu'un défaut de code. Le kit de l'Atelier n'a pas cette neutralisation :
depuis son installation, un échec de check Vercel — quota compris — compte comme un vrai refus de
fusion, sans distinction (seul `Vercel Agent Review` est non bloquant, et ce n'est pas la même
chose). **Un futur agent qui voit une PR bloquée par un hoquet de quota Vercel doit comprendre que
c'est un choix connu et assumé, pas un bug à corriger en douce** en réintroduisant une garde locale.

## 🟦 Session 2026-09-25 — **Auto-merge : garde des chemins sensibles et course Vercel Agent Review**

PR #84 (brouillon, NON armée : elle touche `.github/**`, donc jamais auto-fusionnée — relecture
pole-securite puis Marc).

**Ce qui change**
- **Kit auto-merge de l'Atelier** (`modeles/auto-merge/`, copies EXACTES attestées par `COPIES.md`, écarts listés un par un dans ce fichier) : `.github/workflows/auto-merge.yml` lance `modeles/auto-merge/fusionner.mjs` ; la configuration est `.github/auto-merge.json` (lue sur `main`) ; `scripts/autoMerge.*` et `scripts/gardeChemins.mjs` n'existent plus. Les chemins sensibles de Hubperso (auth, jetons, `app/api/**`, `vercel.json`, drizzle…) y sont déclarés ; sans `securite_login` (à poser par la PR de pole-securite) ils restent bloqués.
- Course de la PR #83 : la fin d'un check externe (Vercel Agent Review) ne déclenche ni `workflow_run`
  ni `status`. Nouveau déclencheur `check_run: completed`, filtré (`app.slug != 'github-actions'`)
  pour ne coûter aucune minute de CI en plus. Effectif seulement une fois mergé (workflow lu sur `main`).
- `.gitattributes` `* text=auto eol=lf` (commit isolé) : l'index était déjà en LF.

**Resynchroniser le kit** : `node C:/dev/atelier/modeles/auto-merge/verifier-copies.mjs . --manifeste C:/dev/atelier/modeles/manifeste.json` doit répondre « Toutes les copies sont fidèles » ; en cas de nouvelle version du modèle, recopier puis `--ecrire-copies .`.

**Historique (avant le kit)** : — sur refus pour chemin sensible, label `validation-marc` (créé si absent) + UN commentaire à texte fixe (marqueur caché anti-doublon, chemin nettoyé en code inline) ; SHA relu juste avant la fusion et `--match-head-commit` (TOCTOU) ; `checkout` et `setup-node` épinglés par SHA ; chemins propres à Hubperso ajoutés à la liste (auth, middleware, jetons, `app/api/**`, `vercel.json`, `next.config.mjs`, `drizzle/**`, `qualite/**`, build). Depuis le kit, le contrôle requis est identifié par NOM ET par application (appId 15368).

**À vérifier au premier run réel** : `gh api ... --paginate --slurp` sur le runner, et le réveil sur
Vercel Agent Review.

## 🟦 Session 2026-09-21 — **FinanceAI n'a plus d'URL de résumé par défaut, et c'était le bug**

✅ **MERGÉ** (PR #63, `e8b1c848`). Porte de qualité SonarCloud enfin verte — **0,0 % de duplication
sur le code neuf**. Déploiement de production Vercel **créé et `READY`** sur ce SHA exact
(`dpl_57CYRjvTuUYdPrMih2Kdjwk5v1Uj`). ⚠️ La moitié « contrôler la réponse SERVIE » n'a PAS pu être
faite : `hubperso.com` répond 403 au CONNECT depuis le conteneur — c'est à Marc, depuis son
navigateur, de constater que la carte FinanceAI affiche bien ses tuiles.

Marc : la carte FinanceAI du hub n'affichait pas les métriques neuves. Serveur à jour,
déploiement `READY`, rien de rouge nulle part.

**Cause, mesurée** : `lib/sources.ts` déclarait pour `financeai`
`defaultUrl: "https://finance.hubperso.com/hub/summary"` — c'est le **site** de l'app, pas son
endpoint de contrat. FinanceAI ne publie pas son résumé depuis son site (les données financières
ne quittent pas la machine de Marc : le résumé est calculé par un serveur MCP auto-hébergé).
Cette URL répond donc **200 avec `<!DOCTYPE html>`** : le hub recevait une page web et rendait
« réponse non conforme au contrat », un diagnostic qui accuse l'app et envoie corriger le mauvais
dépôt. Marc a posé `FINANCEAI_SUMMARY_URL` et la carte est repartie ; ce lot enlève le défaut.

**Livré**
- `defaultUrl` est scindé en **deux** champs — `accueilUrl` (la page de l'app, pour la palette de
  commandes) et `defaultSummaryUrl` (l'endpoint du contrat). Ils coïncident pour cinq apps sur six,
  et c'est cette majorité qui a fait passer une déduction pour un fait.
- `financeai.defaultSummaryUrl = null` : sans sa variable, la source est `unconfigured` et le hub
  **ne part pas sur le réseau**. Pas d'adresse Cloud Run écrite en dur — un défaut
  plausible-mais-faux est pire qu'une absence.
- `unconfigured` porte sa **cause** : `manque: readonly ("url" | "jeton")[]`, les deux d'un coup.
  « Aucun jeton configuré » aurait envoyé poser la mauvaise variable, et la seconde cause ne serait
  apparue qu'une fois la première réparée (leçon n° 8).
- `posterAction` refuse aussi une source sans URL : le verrou 3 (même origine) n'a **aucune origine
  de référence** sans `summaryUrl` — donc plus de verrou du tout.

**Gardes** — `tests/sources.test.ts` (FinanceAI sans URL + contrôle négatif avec la variable posée
+ `accueilUrl` conservée + anti-vacuité « les cinq autres gardent leur défaut ») et
`tests/fetchSummary.test.ts` (aucune requête émise, cause nommée, les deux manques d'un coup,
contrôle négatif « avec URL et jeton, la requête PART »).
⚠️ **Les deux perturbations discriminent, mesuré** : remettre l'ancien `defaultUrl` → 2 rouges
dans `sources` ; retirer le contrôle d'URL de `manquesDeConfig` → 2 rouges dans `fetchSummary`.

**Vérifs** : `typecheck` vert, `test` **420/420**, `lint` 0 erreur (2 avertissements préexistants),
`build` vert.

⚠️ **La CI a rougi une fois, et elle avait raison** : SonarCloud, **4,3 % de duplication sur le code
neuf** (seuil 3 %). La phrase qui nomme ce qui manque était écrite DEUX fois (carte + page de
détail) et l'espion de `fetch` recopié dans deux cas de test. Corrigé par une source unique
(`phraseManques`, exportée à côté de `ManqueConfig`) — pas par un seuil relevé : deux surfaces qui
décrivent le même état doivent dire la même chose, et deux copies divergent au premier ajustement.
Perturbation rejouée APRÈS la refonte : toujours 2 rouges.

⚠️⚠️ **Et ça n'a pas suffi : 4,3 % → 4,1 %.** Mon relevé ne portait que sur les fichiers du diff,
alors que le détecteur compare au projet ENTIER. Rejoué au bon périmètre : 12 lignes neuves
incriminées, dont **10 dans la table `SOURCE_DEFS`** — six entrées aux mêmes champs, que le septième
champ a fait passer de 8 à 10 lignes. Deux remèdes essayés PUIS ANNULÉS après mesure (constructeur
partagé : blocs identiques ; `sonar-project.properties` : 4,1 % inchangé, même identifiant
d'analyse → l'analyse automatique ne lit pas ce fichier). Forme retenue : les adresses d'accueil
sortent dans `ACCUEIL_PAR_ID`, une ligne par app → **2,6 %**. Le type interdit une app sans adresse,
un test interdit une adresse sans app (les deux perturbations tirent). **30/09/2026** : les deux tables refondues en UNE (`APPS`, toujours une ligne par app, variables d'environnement déduites de l'id) — plus de seconde liste à synchroniser ; voir la leçon n° 11.

⚠️ **Rien ici ne change ce qui est SERVI par hubperso pour un visiteur** : c'est de la
configuration côté serveur. Mais la variable `FINANCEAI_SUMMARY_URL` doit RESTER posée sur Vercel —
elle n'est plus un « override », elle est désormais **obligatoire**.


## État

Le hub est **privé**, derrière un login Google (Auth.js v5). Il ne pose plus la question
en une fois mais en **deux**, et c'est le point à retenir :

| Question | Où | Réponse |
|---|---|---|
| **Peut-elle se connecter ?** | `peutSeConnecter` (`lib/personnes.ts`), appelée par `auth.ts` | Le propriétaire (`AUTHORIZED_EMAIL`), ou toute personne **active** ayant **au moins un accès** quelque part. Sinon : **aucune session**, `/login?error=AccessDenied`. |
| **A-t-elle le droit d'entrer ICI ?** | `aAcces(email, appId)`, via `exigerAccesHub()` (`lib/gardeHub.ts`) | Le hub se traite lui-même comme une app (`APP_HUB = "hubperso"`). Connectée mais sans cet accès → `/sans-acces`, **pas** `/login` (sinon elle se reconnecterait aussitôt pour retomber sur le même refus). |

`AUTHORIZED_EMAIL` **n'est plus « la seule adresse admise »** : c'est le **propriétaire**.
Il est vérifié **en premier et sans toucher au réseau**, pour que ni une base injoignable
ni une ligne supprimée par erreur ne puisse enfermer Marc dehors de sa propre
administration — le seul endroit d'où il pourrait se réparer.

✅ **CE MODÈLE À DEUX ÉTAGES A ÉTÉ ÉPROUVÉ CONTRE UNE VRAIE BASE LE 15/09/2026, et c'est la
première fois.** Marc a exécuté la procédure d'invitation décrite plus bas et rapporte que
les trois étapes passent : la personne invitée entre, l'accès retiré la renvoie sur
`/sans-acces`. Le hub n'est donc plus seulement gardé en théorie.

⚠️ **IL A FALLU QUATRE CAUSES, ET DEUX FAUSSES ANNONCES DE MA PART.** Chacune masquait la
suivante. La leçon à garder : **`HTTP 200` n'est pas une preuve** quand le code qui le rend
ne sait pas distinguer un succès d'un échec.

| # | Cause | Signature | État |
|---|---|---|---|
| 1 | Barre oblique finale dans `HUB_URL` | `HTTP 308` | corrigé, `[H-19]` |
| 2 | `HUB_URL` désignait l'apex, qui redirige vers `www` — `curl` retire l'en-tête `Authorization` | `HTTP 401` | corrigé, secret changé |
| 3 | `DATABASE_URL` absente du projet Vercel | `HTTP 503 « DATABASE_URL absente »` | corrigé, posée **et redéployée** le 15/09 à 12:39 Z |
| 4 | **La table `releves` n'existe pas** — `/api/cron/releve` n'appelait pas `assurerMigrations()` | `HTTP 200` **et zéro ligne écrite** | corrigé, `[H-23]` |

**La quatrième est la pire, parce qu'elle ressemblait à un succès.** Les cinq insertions
échouaient sur `relation "releves" does not exist` (Postgres `42P01`), et la route répondait
`HTTP 200` avec « aucun relevé écrit — le dernier date de moins de l'espacement minimal ».
Elle ne mentait pas par choix : `enregistrerReleve` rendait un **booléen**, donc « espacement
respecté » (sain) et « écriture échouée » (grave) arrivaient sous la même forme, et la seule
phrase disponible était celle du cas sain. **Aucune rédaction ne pouvait être juste** — c'est
le type qu'il fallait changer, pas le message.

Cause racine : `lib/gardeHub.ts` appelle `assurerMigrations()` à chaque page, mais la route
cron — **la seule conçue pour tourner sans personne devant** — ne le faisait pas. Le
regroupement des requêtes Vercel l'a prouvé : depuis le déploiement, une seule route servie,
`/api/cron/releve`. Aucune page chargée, donc aucune migration jouée, donc aucune table.
C'est la **leçon n°5 un étage plus bas** : l'observateur était requis pour l'observation,
puis pour le *schéma*.

`tests/migrationsAppelees.test.ts`, écrit pour ce trou, en a trouvé **deux autres** au
passage : `app/actions.ts` et `app/administration/actions.ts` lisaient ou écrivaient le modèle
d'accès sans assurer le schéma. Les trois sont corrigés.

⚠️ **POSER LA VARIABLE NE SUFFIT PAS : IL FAUT REDÉPLOYER (PAR UN COMMIT DE CODE).** Vercel fige les variables
d'environnement au moment où un déploiement est créé ; celui qui sert déjà ne les voit jamais
apparaître. C'est le piège de `[H-18]` — et un simple bouton « Redeploy » sur un commit ne touchant que
de la documentation ou des tests sera annulé en silence par `scripts/build-necessaire.sh` (qui ne voit que le diff git).
Pour appliquer une nouvelle variable Vercel, il faut **pousser un commit de code** (même trivial) sur `main`.
Cela a aussi coûté une mesure fausse de plus le 15/09 : le relevé lancé à 12:39:51 Z a rendu `503` alors que la variable était posée,
simplement parce que le redéploiement créé à 12:39:05 Z était encore en construction. 46 secondes
d'écart, et une conclusion « ça n'a pas marché » qui aurait été fausse.

👤 **CE QUI PROUVERA QUE C'EST RÉGLÉ, ET RIEN D'AUTRE** : un run du workflow `Relevé` à
`"ecrits": 5`. Depuis `[H-23]`, un échec d'écriture rend `HTTP 500` et **teint le run en
rouge** — il ne peut plus se déguiser en `200`.

✅ **LA PROCÉDURE D'INVITATION A ÉTÉ EXÉCUTÉE, le 15/09/2026, et elle passe.** Rapportée par
Marc, pas mesurée par moi — la distinction compte, et aujourd'hui l'a assez démontré. Les
trois étapes de la section « Comment vérifier que ça marche vraiment » sont donc vertes pour
la première fois : ajout dans `/administration`, entrée de la personne invitée, retrait de
l'accès et renvoi sur `/sans-acces`.

⚠️ **Et « je me connecte, ça marche » ne prouve toujours rien.** Le chemin du propriétaire est
resté vert pendant TOUTE la panne — base absente comprise, puisqu'il est vérifié sans réseau
par construction. C'est la leçon n°1 ci-dessous, et le 14-15/09 en est la démonstration la
plus complète qu'on ait : quatre causes successives, et aucune n'a jamais empêché Marc
d'entrer. Refaire la procédure d'invitation reste la seule vérification qui vaille après
toute modification de l'auth, du modèle d'accès ou de la base.

Le contrat, les widgets et les jetons `HUB_TOKEN_*` sont **inchangés** : l'auth est une
couche ajoutée par-dessus, elle ne touche pas au dashboard.

Vérifs vertes en local : `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build`.

### Les pièces

| Fichier | Rôle |
|---|---|
| `auth.ts` | Config Auth.js. `signIn` **et** `jwt` appellent `peutSeConnecter` : le `jwt` tourne à CHAQUE lecture de session, donc une révocation mord sans attendre l'expiration du cookie. |
| `lib/personnes.ts` | `estProprietaire`, `peutSeConnecter`, `aAcces`. Cache positif de 60 s : on mémorise un OUI, **jamais un refus** — sinon quelqu'un qu'on vient d'ajouter attendrait une minute, précisément au moment où on vérifie que ça marche. |
| `lib/gardeHub.ts` | `exigerAccesHub()` (toute page du hub) et `exigerProprietaire()` (ce qui est réservé). |
| `lib/administration.ts` + `app/administration/` | Ajouter/retirer une personne, app par app. Réservée au propriétaire. `APPS_DISPONIBLES` dérive de `SOURCE_DEFS` — pas de seconde liste à tenir. |
| `app/api/acces/route.ts` | `POST`. Répond aux **autres apps** « telle adresse a-t-elle accès à toi ? ». L'`appId` vient du **jeton**, jamais du corps : une app ne peut pas interroger les accès d'une autre. `POST` et non `GET` pour que l'adresse ne finisse pas dans les journaux d'URL. |
| `lib/db/schema.ts` + `drizzle/` | Tables `personnes` et `acces` (Neon). **Rien d'autre** : ni donnée d'app, ni session. |
| `lib/authGuard.ts` | Décision du middleware. Laisse passer `/api/acces`, `/api/cron/releve`, `/api/sante` et `/api/cout` — le matcher, lui, est inchangé. |
| `app/api/sante/route.ts` | `GET` public, sonde de la vigie : `{ ok: true }` ou 503 `{ ok: false, cause: "base" \| "configuration" }`, `no-store`. Noms des variables requises absentes au journal serveur seulement. Limite de débit : 10/min par client (429), vérifiée avant la base. |
| `app/api/cout/route.ts` + `lib/coutCumule.ts` | `GET` public (#191) : le coût API cumulé en CAD (période `total` seulement), sa `dataAsOf` (la plus ancienne mesure) et les apps `nonLisibles` (jamais 0). Lit les relevés en base, jamais une app ; 503 si la base ne répond pas ; 10/min par client (429). Lu par le relevé du suivi. Porte aussi `mois` (`lib/coutMois.ts`) : la dépense du mois en cours, par app, déduite de deux cumuls (dernier relevé moins dernier relevé d'avant le 1er, heure de Marc) — une estimation, `partiel` quand il manque le point de départ, jamais 0 pour une app non lisible ; `mois: null` si les références sont illisibles. |
| `lib/variablesAttendues.ts` | Liste des NOMS de variables attendues (requise/optionnelle, effet si absente) + contrôle de présence booléen. Jamais une valeur. |
| `middleware.ts` | Garde global : page → `/login`, `/api/*` → 401 JSON. |
| `app/sans-acces/page.tsx` | Connectée, mais pas ici. |
| `tests/` | Dont `tests/personnes.test.ts` (PGlite + les **vraies** migrations) et `tests/gardePages.test.ts`, qui fait échouer toute page ajoutée sans garde. |

## La doc ne peut plus dériver en silence

Depuis le 21/08, une PR échoue si elle touche du code sans que le backlog suive
(`.github/workflows/doc-a-jour.yml`). Deux oublis surveillés, ceux que Marc a nommés : une
tâche **faite sans que son entrée soit relue**, et une tâche **jamais inscrite**.

Ce que ça change concrètement pour toi :

- **Mets l'ID du backlog en tête du sujet de commit** : `H-04: feat: …`. C'est ce qui permet
  le rapprochement exact — sans lui, « tâche jamais inscrite » n'est pas détectable.
- **Pas de tâche ?** Écris `HORS-BACKLOG:` en tête. L'exception est nommée et greppable,
  jamais silencieuse.
- **Le contrôle exige que l'entrée soit RELUE, pas cochée.** Une tâche avancée sans être
  finie reste légitimement ⬜ — c'est la ligne qui doit être rouverte.

Il ne bloque QUE sur le backlog. Le HANDOVER, le CHANGELOG et le README ne produisent que
des avertissements, et seulement quand le diff les rend plausiblement périmés.

## Ce qu'il faut poser dans Vercel

Production **et** Preview :

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — client OAuth « Web application ».
- `AUTH_SECRET` — `npx auth secret`. **Identique** à celui des autres apps du hub : c'est
  ce qui, avec `AUTH_COOKIE_DOMAIN`, fait la connexion unique.
- `AUTH_COOKIE_DOMAIN` = `.hubperso.com` — voir `docs/CONNEXION-UNIQUE.md`.
- `AUTHORIZED_EMAIL` = l'adresse Google de Marc (variable Vercel, jamais écrite dans le dépôt) — le propriétaire.
- `DATABASE_URL` — base Neon, connection string **pooled**. Sans elle, seul le
  propriétaire entre : l'app le dit, elle n'ouvre rien « en attendant ».
- `AUTH_URL` — **optionnelle** (`trustHost` est actif). Seulement pour forcer le domaine
  canonique : `https://hubperso.com`.
- Les jetons `HUB_TOKEN_*` des apps : inchangés.
- `HUB_TOKEN_MEMORYAI` — **nouveau, 15/09/2026** (`[H-27]`). Sixième app, `memoryai.hubperso.com`.
  La MÊME valeur que `HUB_TOKEN` dans le projet Vercel `memory-ai`. Tant qu'il manque, le
  widget MemoryAI affiche « non autorisé » — c'est l'état honnête, pas une panne.
- `CRON_SECRET` — **nouveau, 14/09/2026**. Secret de l'horloge du hub (ADR 0003). La MÊME
  valeur doit être posée en **deux** endroits, sinon rien ne tourne :
  - ici, sur Vercel (production) ;
  - dans le dépôt GitHub : *Settings → Secrets and variables → Actions*, avec `HUB_URL`
    = l'**origine canonique**, celle que Vercel sert SANS redirection — soit
    `https://www.hubperso.com`.

  ⚠️ Cette ligne a dit `https://hubperso.com` jusqu'au 14/09/2026 au soir, et cette valeur
  **ne fonctionne pas** : l'apex redirige en 308 vers `www`, `curl` retire l'en-tête
  `Authorization` dès que l'hôte change, et le hub répond 401 « secret refusé » — donc on
  va régénérer un secret qui était bon. Le workflow diagnostique désormais le changement
  d'hôte AVANT de juger le statut, mais la valeur juste évite le détour.

  ⚠️ Secret **dédié**, jamais un `HUB_TOKEN_*` d'app : ce qu'il déclenche est une ÉCRITURE
  dans la mémoire du hub, un pouvoir qu'aucune app n'a de raison d'avoir.

  Sans lui, `POST /api/cron/releve` répond **503** et le workflow échoue en **ROUGE** —
  c'est voulu : une horloge qui n'enregistre rien ne doit pas ressembler à une horloge qui
  fonctionne.

**Redirect URIs Google** (client OAuth) :

```
https://hubperso.com/api/auth/callback/google
https://<projet>.vercel.app/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

## Comment vérifier que ça marche vraiment

Le test « je me connecte, ça marche » ne prouve que le chemin du propriétaire — celui qui
marcherait même si toute la base était en panne. Ce qui compte est l'autre :

1. `/administration` → ajouter une adresse → cocher `hubperso`.
2. Se connecter avec ce compte. Attendu : **il entre**.
3. Décocher `hubperso`, laisser la personne active. Attendu : il obtient toujours une
   session s'il a un autre accès, mais atterrit sur **`/sans-acces`**.
4. Retirer tous ses accès. Attendu : **plus de session du tout**, `/login?error=AccessDenied`.

Chaque étape teste une porte différente. Les confondre, c'est croire qu'on a vérifié
l'autorisation alors qu'on n'a vérifié que la connexion.

## Comment vérifier que l'HORLOGE marche vraiment

Même piège qu'au-dessus, transposé : « le workflow est vert » ne prouve presque rien. Il
serait vert aussi s'il déclenchait un relevé qui n'écrit jamais rien. Ce qui se vérifie :

1. **Un run déclenché à la main écrit.** GitHub → *Actions* → *Relevé* → *Run workflow*.
   Attendu dans le journal : `HTTP 200` et un corps portant `"ecrits":5`. Un `"ecrits":0`
   avec un avertissement est NORMAL si un relevé vient d'être écrit (l'espacement minimal
   est de 15 min) — relancer quinze minutes plus tard pour lever le doute.
2. **La page le confirme.** `/attention` → section « Ce que le hub a pu observer ». Le
   nombre de relevés doit AUGMENTER d'un run à l'autre. Si elle affiche « Aucun relevé sur
   les 7 derniers jours », les secrets ne sont pas posés ou `DATABASE_URL` manque.
3. **La détection de gel se teste par l'absence**, et c'est le contre-intuitif : tant
   qu'aucune app n'est re-pinnée sur `hub-contract` v1.3 et ne publie
   `expectedMaxAgeSec`, AUCUNE ligne « donnée figée » ne doit apparaître — même sur une
   app dont la donnée a trois jours. C'est correct : le hub sait l'âge et ne peut pas le
   juger. Voir une telle ligne avant le re-pin des apps serait le signe d'un seuil deviné
   côté hub, exactement ce que l'ADR 0003 interdit.
4. **Le retard se lit, il ne se devine pas.** Après trois jours, comparer le nombre de
   relevés à ce que la cadence promet (336 sur 7 jours). L'écart est attendu — GitHub
   étale ses `schedule` — et c'est précisément pour ça qu'il est affiché.

## Note Cloudflare Access

Le hub a sa **propre** authentification applicative. Cloudflare Access (Google OAuth + MFA)
peut rester devant comme couche réseau, mais n'est plus la seule barrière : même sans elle,
aucune donnée n'est servie sans session valide. Le sens qui coûte est l'inverse — croire
que Cloudflare protège pendant que l'app serait ouverte.

## Où lire la suite

- `docs/adr/0001-*.md` — l'ADR, **avec son amendement** : deux prémisses de l'étape 3
  étaient fausses, et le coffre à jetons a été écrit puis retiré avant d'être livré.
- `docs/ACCES-PAR-APP.md` — le modèle d'accès par app.
- `docs/CONNEXION-UNIQUE.md` — le cookie partagé entre les apps.

## Portes qualité de l'Atelier (S6, 23/09/2026)

Contrôles automatiques en CI, jobs **Qualité** et **Sécurité** : la fusion automatique les attend.
Principe du **cliquet** : `qualite/seuils.json` fige l'état du jour de la mise en place ; rien ne peut
reculer. `npm run portes` mesure en local, `npm run portes:maj` resserre après une amélioration.

| Porte | Seuil de départ |
|---|---|
| Typage (erreurs) | ≤ 0 |
| Lint (erreurs) | ≤ 0 |
| Lint (avertissements) | ≤ 2 |
| Tests en échec | ≤ 0 |
| Couverture `lib/` (% lignes) | ≥ 88.1 |
| Couverture globale (% lignes) | ≥ 40.4 |
| Couverture globale (% branches) | ≥ 92.5 |
| Code mort (knip) | ≤ 23 |
| Règles d'architecture (dependency-cruiser) | ≤ 0 |

Sécurité : gitleaks sur tout l'historique + Semgrep (TypeScript, React, Next.js, secrets, OWASP), bloquants.
Dependabot : mises à jour hebdomadaires (npm + actions), fusion automatique si tout est vert.
