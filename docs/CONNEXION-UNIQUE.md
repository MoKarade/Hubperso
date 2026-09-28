# Connexion unique entre les apps du hub

> ⚠️ **Ce document décrit l'état du 13/08/2026.** Ce qui concerne le **cookie de session
> partagé** reste exact et en production — c'est la brique 1 de l'
> [ADR 0001](./adr/0001-centraliser-l-authentification-dans-hubperso.md).
>
> Ce qui concerne le **client OAuth partagé et les portées par app** ne s'est pas fait, et
> ne se fera pas. La cible intermédiaire (« un client unique + un prêt de jetons depuis
> Hubperso ») a été **abandonnée elle aussi** : le coffre à jetons a été écrit puis retiré
> avant d'être livré, et « le projet Google ne contient plus qu'un client OAuth » ne doit
> plus servir de critère. Voir l'**amendement** de l'ADR 0001, pas seulement son corps.
> Ce qui a réellement été livré à la place : l'autorisation centralisée
> (`POST /api/acces`, [accès par app](./ACCES-PAR-APP.md)), chaque app gardant son propre
> client OAuth.

> Décision de Marc (2026-08-13) : se connecter à **une** app doit valoir pour **toutes**, sur
> un appareil donné, et sans redemander l'autorisation Google.
>
> Option retenue : **un seul client OAuth, chaque app gardant SES portées.**
> Option écartée : « toutes les apps demandent toutes les portées » — voir « Pourquoi pas
> l'union » plus bas.

## Le résultat visé

Tu te connectes une fois, sur n'importe quelle app. Les autres s'ouvrent sans écran de
connexion et sans écran de consentement Google.

## Les deux mécanismes, et pourquoi il en faut deux

Ils répondent à deux questions différentes. L'un sans l'autre ne suffit pas.

### 1. « Qui es-tu ? » — le cookie de session partagé

Concerne les quatre apps en **Auth.js** : Hubperso, JobAI, CarAI, BatchChef.

Leur cookie de session est déclaré sur `.hubperso.com` au lieu du seul hôte, donc le
navigateur l'envoie à tous les sous-domaines. Et comme le contenu est un JWT chiffré, il
faut **le même `AUTH_SECRET`** partout : sans lui, l'app reçoit le cookie mais ne peut pas
le lire.

Depuis l'ADR-0001 de JobAI et de CarAI (14/08/2026), seuls Hubperso et BatchChef gardent
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en variable d'env : JobAI et CarAI ne font plus
la poignée de main OAuth eux-mêmes, ils lisent le cookie de session déjà posé par le hub
(signé `AUTH_SECRET`, partagé). Le client Google Cloud reste unique pour les quatre apps ;
sa gestion active (échange de code, refresh) n'est plus portée que par Hubperso et
BatchChef.

⚠️ Seul le cookie de **session** porte un `domain`. Le cookie **CSRF** d'Auth.js s'appelle
`__Host-authjs.csrf-token`, et le préfixe `__Host-` **interdit** l'attribut `Domain` : lui
en poser un ferait rejeter le cookie par le navigateur et casserait la connexion partout.

⚠️ Le domaine vient de la variable `AUTH_COOKIE_DOMAIN`, **définie en production
seulement**. Écrit en dur, il casserait le développement local et les préversions : un
cookie portant `Domain=.hubperso.com` est *rejeté* par le navigateur sur `localhost` ou
`<projet>.vercel.app`. Et en silence — pas de cookie, retour en boucle sur `/login`, aucune
erreur nulle part. Variable absente ⇒ comportement natif, cookie limité à l'hôte.

### 2. « Que t'autorises-tu à faire ? » — le client OAuth partagé

Concerne **les six** apps, y compris DriveAI et FinanceAI qui n'utilisent pas Auth.js.

Google mémorise le consentement **par client OAuth**, pas par site. Si les six apps
partagent un seul client, tu accordes les permissions une fois ; ensuite, une app qui ne
force pas l'écran obtient ses jetons par une redirection **silencieuse**.

⚠️ **« Qui ne force pas l'écran » exclut deux apps, et ce n'est pas un détail.** Voir la
section suivante — c'est la limite réelle de ce montage.

### Ce que le client partagé ne fait PAS disparaître

Mesuré dans le code, pas déduit. Deux apps envoient `prompt=consent` à Google **exprès** :

| App | Où | Pourquoi |
|---|---|---|
| DriveAI | `api/login.ts` | `access_type=offline` + `prompt=consent` sont la seule façon **garantie** d'obtenir un `refresh_token` |
| BatchChef | `auth.ts` | idem, pour son jeton Tasks de longue durée |

Google n'émet un `refresh_token` qu'à la **première** autorisation d'un couple
client + compte — sauf si le consentement est forcé. Or partager le client rend cette
première autorisation *déjà faite* : retirer `prompt=consent` ferait donc revenir ces deux
apps sans jeton de rafraîchissement, et leur session durable casserait. Le paramètre reste.

**Conséquence à assumer : DriveAI et BatchChef continueront d'afficher l'écran de
consentement à chaque connexion.** Le client partagé ne leur apporte rien sur ce point. Ce
qu'il apporte reste réel — un seul client à gérer, un seul jeu d'URI, et la voie ouverte
pour FinanceAI dont le flux, lui, peut devenir silencieux — mais pas ça.

### L'accès Tasks, et pourquoi les quatre apps le demandent

Le JWT de BatchChef ne porte pas qu'une identité : il porte l'`access_token` Google et le
`refresh_token` du scope Tasks. Le cookie étant partagé, **c'est la dernière app où tu t'es
connecté qui décide du contenu du jeton**. Si BatchChef était seule à demander Tasks, te
connecter depuis le hub la laisserait connectée mais sans droit d'écriture — l'export
répondrait « Aucun jeton Google — clique *Reconnecter Google* », et ça reviendrait à chaque
connexion faite ailleurs.

Décision de Marc (13/08/2026) : **accès complets, aucune reconnexion.** Les quatre apps
demandent donc les mêmes portées et capturent les mêmes jetons, via `lib/jetonsGoogle.ts`
— fichier volontairement **identique dans les quatre dépôts**. Une divergence ferait
dépendre le bon fonctionnement de l'app par laquelle on est passé : le pire genre de bogue,
celui qui n'arrive qu'une fois sur quatre et ne se reproduit jamais.

Les portées restent **`openid email profile` + `tasks`**. Ni Drive, ni Agenda, ni Gmail :
DriveAI et FinanceAI n'utilisent pas ce cookie, leur ajouter leurs portées ici n'apporterait
rien et multiplierait par quatre les portes vers un Drive complet. Un test le verrouille.

Conséquence à assumer : Hubperso, JobAI et CarAI **afficheront « accéder à vos tâches »**
dans l'écran de consentement Google alors qu'aucune des trois n'y touche. C'est le prix
d'un cookie unique — et l'alternative était de recliquer « Reconnecter Google » dans
BatchChef à chaque connexion.

Le renouvellement, lui, profite à tout le monde : l'app par laquelle tu passes rafraîchit le
jeton et le réécrit dans le cookie partagé, donc les trois autres en héritent aussitôt.

## Ce que Marc doit configurer

### a) Un seul client OAuth pour tout l'écosystème

Console Google Cloud → **API et services** → **Identifiants** → client OAuth « Application
Web ». Prends-en un existant ou crée-en un neuf, puis pose son `CLIENT_ID` / `CLIENT_SECRET`
dans **tous** les projets Vercel.

**URI de redirection autorisés** — Google compare **caractère par caractère** : pas de barre
oblique finale, `https` obligatoire.

| App | URI |
|---|---|
| Hubperso | `https://hubperso.com/api/auth/callback/google` |
| Hubperso (www) | `https://www.hubperso.com/api/auth/callback/google` |
| JobAI | `https://emploi.hubperso.com/api/auth/callback/google` |
| CarAI | `https://carai.hubperso.com/api/auth/callback/google` |
| BatchChef | `https://batchchef.hubperso.com/api/auth/callback/google` |
| **DriveAI** | `https://drive.hubperso.com/api/callback` |

⚠️ Le chemin de DriveAI est **différent** : elle n'utilise pas Auth.js, son callback est
`/api/callback` et non `/api/auth/callback/google`. C'est l'erreur qui produit le
`redirect_uri_mismatch` déjà vécu.

**Origines JavaScript autorisées** — nécessaire pour **FinanceAI seulement** :

```
https://finance.hubperso.com
```

⚠️ FinanceAI n'utilise pas de redirection : son flux GIS (`initTokenClient`) obtient le
jeton **dans le navigateur**. Google exige alors que l'**origine** soit déclarée, pas une
URI de redirection. Lui ajouter une URI de redirection ne servirait à rien, et oublier
l'origine la casserait.

### b) Le même `AUTH_SECRET` sur les quatre apps Auth.js

Hubperso, JobAI, CarAI, BatchChef. Une seule valeur, posée dans les variables
d'environnement Vercel des quatre projets. Jamais dans le dépôt.

### b-bis) `AUTH_COOKIE_DOMAIN` sur les quatre apps Auth.js

```
AUTH_COOKIE_DOMAIN=.hubperso.com
```

Sur Vercel, **environnement Production uniquement** — surtout pas Preview ni Development
(décoche les deux cases), sans quoi les préversions perdraient leur connexion. C'est cette
variable qui active le partage : tant qu'elle est absente, les PR sont déployées et rien
ne change.

### c) Un sous-domaine pour BatchChef

Elle est aujourd'hui sur `batchchef-glu8-chi.vercel.app` : un cookie ne franchit pas cette
frontière, elle ne peut donc pas participer. Ajoute `batchchef.hubperso.com` dans son projet
Vercel (le nom est modifiable, il faut juste qu'il soit sous `hubperso.com`).

## L'ordre des opérations

Il compte, mais aucune étape n'est destructrice.

1. Les PR sont déployées. **Rien ne change encore** : sans `AUTH_COOKIE_DOMAIN`, le code
   se comporte exactement comme avant et chaque app continue de fonctionner seule.
2. Le client OAuth unique est configuré et posé partout.
3. Le même `AUTH_SECRET` est posé sur les quatre apps Auth.js.
4. `AUTH_COOKIE_DOMAIN=.hubperso.com` est posé sur les quatre — c'est l'interrupteur.
   Un redéploiement de chacune est nécessaire pour qu'elles la lisent.
5. Tu te déconnectes une fois de chaque app — les anciens cookies portent l'ancienne portée
   de domaine et ne seraient pas remplacés.
6. Tu te reconnectes **une** fois.

Si l'ordre est inversé, la seule conséquence est d'être déconnecté et de devoir se
reconnecter app par app. Rien ne casse.

## La contrepartie, écrite pour qu'on ne la découvre pas un mardi soir

**Une déconnexion vaut aussi pour toutes.** Se déconnecter de JobAI supprime le cookie de
`.hubperso.com`, donc déconnecte aussi le hub, CarAI et BatchChef. C'est le corollaire
logique du partage.

**Un secret pour quatre apps.** Si `AUTH_SECRET` fuit depuis une seule app, les sessions des
quatre deviennent forgeables. La rotation devra être faite sur les quatre le même jour.

**Un cookie sur `.hubperso.com` est lisible par tous les sous-domaines.** C'est acceptable
ici — toutes les apps sont à Marc — mais ça ne le serait plus le jour où un sous-domaine
servirait autre chose. À noter depuis l'étape 2 : le cookie n'est plus réservé à une seule
adresse, des invités en ont un aussi. Ce qui borne leur portée n'est plus le cookie mais
l'**autorisation par app** vérifiée à chaque lecture (`aAcces`), pas le fait qu'il n'existe
qu'une seule session possible dans l'écosystème.

**Le contrôle d'adresse suit désormais la donnée, pas la connexion.** `signIn` ne tourne
qu'à la connexion ; le cookie étant partagé, chaque app accepterait une session fabriquée
ailleurs. Le callback `jwt` revérifie donc **à chaque lecture** et invalide la session
sinon (`return null`). Sans ça, une app dont on changerait les droits continuerait
d'accepter les sessions des autres en silence.

Ce qu'il revérifie a changé le 14/08 : ce n'est plus `AUTHORIZED_EMAIL` mais
`peutSeConnecter(token.email)` côté hub, et `aAccesHub(token.email)` côté apps satellites.
La propriété qui compte est la même — le contrôle est **rejoué**, pas fait une fois — mais
la source de vérité est maintenant la base du hub, ce qui rend la **révocation réelle** :
retirer un accès dans `/administration` mord à la lecture suivante, sans déconnexion.

## Pourquoi pas l'union des portées

L'autre option envisagée était que chaque app demande **toutes** les portées de toutes les
apps. Écartée après avoir mesuré ce que ça voulait dire :

| App | Portées réelles |
|---|---|
| Hubperso, JobAI, CarAI, BatchChef | identité + `tasks` (voir la section précédente) |
| FinanceAI | **`drive.appdata`** + email |
| DriveAI | `drive` (Drive entier), `spreadsheets`, `tasks`, `calendar.events`, `calendar.readonly` |

Deux raisons de ne pas unir.

Précision : `tasks` a bien été étendu aux quatre apps Auth.js — mais c'est un cas à part.
Elles partagent **un seul cookie**, donc leurs portées ne sont pas quatre décisions
indépendantes, c'est une seule. L'union rejetée ici est celle qui traverserait vers DriveAI
et FinanceAI, lesquelles n'utilisent pas ce cookie du tout.

FinanceAI utilise `drive.appdata`, **le scope Drive le plus restreint qui existe** : il ne
donne accès qu'à son propre dossier caché. Son code le justifie explicitement — « un vol
éventuel ne donne accès qu'au dossier app ». L'union remplacerait ce choix délibéré par un
accès complet au Drive.

Et le rayon d'explosion changerait d'échelle : aujourd'hui une fuite de BatchChef livre des
tâches ; après l'union, elle livrerait le Drive entier et les agendas — depuis n'importe
laquelle des six apps. Six portes vers le même trésor au lieu d'une.

Le client partagé donne le même confort sans ce coût.

## Ce qui reste vrai après

DriveAI et FinanceAI **ne partagent pas la session** — elles ont leur propre système
d'authentification, et le cookie d'Auth.js ne leur dit rien.

Et parmi elles, seule **FinanceAI** peut vraiment gagner le silence : son flux GIS n'a pas
besoin de `refresh_token` (il renouvelle par `prompt=''` contre Google), donc rien ne
l'oblige à forcer le consentement. DriveAI, elle, garde son écran — voir « Ce que le client
partagé ne fait PAS disparaître ».

Autrement dit : le vrai gain de ce chantier est le **cookie de session partagé** entre les
quatre apps Auth.js. Le client OAuth unique est une mise en ordre utile, pas la moitié du
résultat.
