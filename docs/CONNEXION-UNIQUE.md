# Connexion unique entre les apps du hub

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
partagent un seul client, tu accordes les permissions une fois ; ensuite, chaque autre app
obtient ses jetons par une redirection **silencieuse** — aucun écran.

C'est ce mécanisme qui fait entrer DriveAI et FinanceAI dans le lot : elles gardent leur
propre système d'authentification, mais cessent de te redemander l'autorisation.

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
ici — toutes les apps sont à Marc, une seule adresse est admise — mais ça ne le serait plus
le jour où un sous-domaine servirait autre chose.

**Le contrôle d'adresse suit désormais la donnée, pas la connexion.** `signIn` ne tourne
qu'à la connexion ; le cookie étant partagé, chaque app accepterait une session fabriquée
ailleurs. Le callback `jwt` revérifie donc `AUTHORIZED_EMAIL` à **chaque lecture** et
invalide la session sinon. Sans ça, une app dont on changerait l'adresse autorisée
continuerait d'accepter les sessions des autres en silence.

## Pourquoi pas l'union des portées

L'autre option envisagée était que chaque app demande **toutes** les portées de toutes les
apps. Écartée après avoir mesuré ce que ça voulait dire :

| App | Portées réelles |
|---|---|
| Hubperso, JobAI, CarAI | identité seule |
| BatchChef | identité + `tasks` |
| FinanceAI | **`drive.appdata`** + email |
| DriveAI | `drive` (Drive entier), `spreadsheets`, `tasks`, `calendar.events`, `calendar.readonly` |

Deux raisons de ne pas unir.

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
d'authentification. Ce qu'elles gagnent, c'est la disparition de l'écran de consentement
Google. Concrètement : un aller-retour silencieux au lieu d'un formulaire.
