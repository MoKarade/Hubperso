# HANDOVER — Authentification et accès du hub

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

⚠️ **AU 14/09/2026, CE MODÈLE À DEUX ÉTAGES N'EST PAS ACTIF EN PRODUCTION.** Ce n'est pas
un défaut du code — c'est une variable d'environnement absente, et c'est pire, parce que rien
ne le montre. Mesuré (run 4 du workflow `Relevé`, 20:34 Z) : `POST /api/cron/releve` répond
`503 « DATABASE_URL absente »`. `baseConfiguree()` étant une fonction pure de
`process.env.DATABASE_URL`, le constat est sans ambiguïté — le projet Vercel du hub ne
fournit pas de base à son exécution de production.

Conséquence : `peutSeConnecter` et `aAcces` retombent sur le **repli propriétaire**, celui
qui ne touche pas au réseau. Marc entre, tout fonctionne pour lui, et **personne d'autre ne
peut entrer** — pas parce qu'on le lui refuse, mais parce que la table n'est pas lisible.
Aucun relevé n'est enregistré non plus, d'où un historique vide et aucune détection de gel.

C'est la section **« Comment vérifier que ça marche vraiment »** ci-dessous, en conditions
réelles : « je me connecte, ça marche »
n'exerce que le chemin du propriétaire, le seul qui fonctionne base en panne. Il a été vert
tout du long.

👤 **Le geste qui répare** : poser `DATABASE_URL` dans le projet Vercel du hub (Settings →
Environment Variables → environnement *Production*). Rien à faire côté dépôt GitHub. Voir
`[H-23]` au backlog. La vérification qui compte ensuite n'est PAS « je me connecte » : c'est
la procédure d'invitation décrite plus bas.

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
| `lib/authGuard.ts` | Décision du middleware. Laisse passer `/api/acces` — le matcher, lui, est inchangé. |
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
- `AUTHORIZED_EMAIL` = `marc.richard4@gmail.com` — le propriétaire.
- `DATABASE_URL` — base Neon, connection string **pooled**. Sans elle, seul le
  propriétaire entre : l'app le dit, elle n'ouvre rien « en attendant ».
- `AUTH_URL` — **optionnelle** (`trustHost` est actif). Seulement pour forcer le domaine
  canonique : `https://hubperso.com`.
- Les jetons `HUB_TOKEN_*` des apps : inchangés.
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
