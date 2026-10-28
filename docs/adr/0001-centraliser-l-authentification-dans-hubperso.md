# ADR 0001 — Centraliser l'authentification dans Hubperso

- **Statut** : accepté (Marc, 14/08/2026)
- **Portée** : les six apps du hub — Hubperso, JobAI, CarAI, BatchChef, DriveAI, FinanceAI
- **Remplace** : `docs/CONNEXION-UNIQUE.md`, qui décrit l'état intermédiaire du 13/08

## Contexte

Trois problèmes distincts, dont le troisième est celui qui a déclenché la décision.

**La configuration Google est éclatée.** Six URI de redirection, une origine JavaScript, et
le couple `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` recopié dans six environnements
Vercel. Chaque app peut casser sa propre authentification sans que les autres le sachent,
et chaque copie du secret est une copie à faire tourner le jour d'un incident.

**Trois apps refont un travail devenu inutile.** Depuis le 13/08, JobAI, CarAI et BatchChef
partagent le cookie de session de Hubperso (`.hubperso.com`, même `AUTH_SECRET`). Elles
gardent pourtant chacune un flux OAuth Google complet, qui ne sert plus qu'au cas où l'on
se connecte par elles. Du code vivant qui ne devrait plus l'être.

**Ajouter une personne est infaisable.** `AUTHORIZED_EMAIL` contient **une** adresse, dans
six environnements. Inviter quelqu'un demanderait six modifications et six redéploiements,
et donnerait un accès **tout ou rien**. Or JobAI contient l'adresse du domicile, le statut
migratoire et des noms de personnes tierces : un accès à la liste d'épicerie ne doit jamais
ouvrir ça.

## Décision

Hubperso devient le **portier unique** de l'écosystème. Un seul client OAuth, dans le seul
projet Google `hub-perso-494914`, et une seule adresse de retour.

Trois mécanismes, qui répondent à trois questions différentes.

### 1. « Qui es-tu ? » — le cookie de session partagé

Le cookie `__Secure-authjs.session-token` est posé sur `.hubperso.com` et lu par les quatre
apps Auth.js. **Seul Hubperso le fabrique** : les trois autres perdent leur fournisseur
Google et leur page de connexion, dont le bouton devient un lien vers `hubperso.com/login`.

### 2. « As-tu le droit ? » — la liste des personnes, en base

Deux tables dans une base Neon appartenant à Hubperso : les personnes, et leurs accès
**par app**. Une page d'administration remplace les six variables d'environnement.

Chaque app interroge `POST /api/acces` avec son jeton `x-hub-token` et **met la réponse en
cache 60 secondes**.

> **Deux précisions écrites après coup, parce que ce paragraphe s'est révélé faux à la
> livraison** (le reste du §2 est conforme) :
>
> - **`POST`, pas `GET`.** Une adresse en `GET` finit dans les journaux d'URL — les nôtres,
>   ceux de Vercel, et de tout ce qui se trouve entre les deux. Le corps ne porte que
>   l'adresse : l'`appId`, lui, est déduit du **jeton**, jamais lu dans la requête, sinon
>   une app pourrait interroger les accès d'une autre.
> - **`AUTHORIZED_EMAIL` ne disparaît pas.** Il **change de rôle** : de « la seule adresse
>   admise » à « le propriétaire — accès à tout, toujours, et vérifié SANS réseau ». Le
>   supprimer aurait fait de la base un point de panne dont la clé est à l'intérieur :
>   base injoignable ou table vide au premier déploiement, et plus personne ne peut ouvrir
>   l'administration pour y ajouter la première personne. Il reste aussi la condition
>   fail-closed du middleware (`lib/authConfigured.ts`).

### 3. « Que peux-tu faire chez Google ? » — le prêt de jetons

> ⚠️ **NON RÉALISÉ, et volontairement.** Ce paragraphe décrit l'intention du 14/08 au matin.
> Voir l'amendement en fin de document : l'exploration du code de DriveAI a montré que la
> moitié qui compte ne peut pas emprunter de jeton, et que la justification donnée plus bas
> pour la base était fausse. Ne pas lire ce qui suit comme un état des lieux.

Le `refresh_token` vit chiffré dans la base de Hubperso. Les apps qui appellent une API
Google l'empruntent par `GET /api/google/jeton`, authentifié par le même jeton partagé.
DriveAI perd tout son système d'authentification propre ; FinanceAI gagne deux fonctions
serveur pour que son jeton cesse de vivre dans le navigateur.

### Livraison

Quatre étapes indépendantes, chacune mergeable seule et sans casser l'état précédent :
apps Auth.js d'abord, puis la base et les accès, puis le prêt de jetons et DriveAI, puis
FinanceAI.

## Pourquoi

**Un secret à faire tourner au lieu de six.** Le jour d'une fuite, la rotation est un geste,
pas une chasse au trésor dans six tableaux de bord.

**L'ajout d'une personne devient une ligne, avec le choix des apps.** C'est la raison
première de ce chantier, et aucune solution moins centralisée ne l'obtient : tant que
l'autorisation vit dans une variable d'environnement, elle est binaire et multipliée par
six.

**Le contrôle d'accès suit la donnée, pas la connexion.** Un appel avec cache court rend la
révocation réelle en moins d'une minute — c'est vérifiable, contrairement à une variable
qu'on croit avoir changée partout.

## Trade-offs

**Les portées fusionnent, et Google ne permet pas de les réduire.** Un client OAuth égale un
jeu de portées unique. Le jeton prêté à BatchChef portera aussi Drive et Agenda, même si
elle n'en fait rien. Hubperso peut refuser de prêter un jeton à une app ; il ne peut pas lui
en prêter un plus étroit. C'est une limite de la plateforme, pas un choix de conception.

**Hubperso devient un point de panne unique.** S'il tombe, DriveAI ne peut plus obtenir de
jeton. Atténuation : chaque app conserve son jeton d'accès pendant l'heure de sa validité et
affiche un état honnête au-delà — jamais une donnée périmée présentée comme fraîche.

**Une porte au lieu de six, mais elle ouvre tout.** Aujourd'hui une fuite de BatchChef livre
des tâches. Après, le contenu de la base de Hubperso livre Drive, Agenda, Sheets et Tasks.
Le pari est qu'une porte unique se blinde vraiment, là où six se surveillent mal — mais
c'est un changement de nature, pas seulement de rangement.

**Hubperso gagne une base de données.** Il n'en avait aucune, et c'était une qualité. Elle
devient nécessaire parce que le `refresh_token` doit survivre aux redémarrages **et** être
lisible sans navigateur : DriveAI construit son summary à trois heures du matin.

**Le consentement Google mentionnera des portées inutilisées.** Se connecter au hub demandera
l'accès aux tâches, au Drive et à l'agenda, alors que Hubperso n'appelle aucune de ces API.
C'est le corollaire direct du client unique.

## Alternatives rejetées

**Ne rien changer.** Écartée par la demande initiale : ajouter une personne resterait
impossible. Les deux autres problèmes seuls n'auraient pas justifié ce chantier.

**Un client par app, avec le cookie partagé (état du 13/08).** C'est l'état actuel. Il donne
la connexion unique mais laisse la configuration éclatée et l'autorisation binaire. Il a
aussi une conséquence qu'on n'avait pas vue : le cookie étant partagé, c'est la *dernière*
app où l'on s'est connecté qui décide du contenu du jeton — d'où l'obligation, corrigée le
13/08, de faire demander les mêmes portées par les quatre apps. Un symptôme de plus du
problème de fond.

**Mettre la liste des accès dans le JWT.** Séduisant — aucun appel réseau. Écartée parce
qu'un JWT est une photo prise à la connexion : les autres apps ne peuvent pas le
rafraîchir, et un accès retiré resterait valide jusqu'à l'expiration de la session, soit
des jours. Une révocation qui ne révoque pas est pire qu'une absence de révocation, parce
qu'on la croit faite.

**Réutiliser le client OAuth de DriveAI plutôt que d'en désigner un.** Proposé d'abord, au
motif qu'il aurait « déjà passé » la vérification de Google pour la portée restreinte
`drive`. Vérification faite, ce raisonnement ne tenait pas : rien ne prouve que ce client
soit vérifié, et une application non vérifiée fonctionne parfaitement pour son propre
auteur — un avertissement à passer une fois. Le choix du client est donc libre, et le
ranger dans le projet Hubperso est plus cohérent.

**Un fournisseur d'identité tiers (Auth0, Clerk, Keycloak).** Écartée sur deux règles
fixées : tout doit rester gratuit, et les données ne quittent pas l'écosystème. Un IdP
géré ajouterait un abonnement au-delà d'une poignée d'utilisateurs et un tiers dans le
chemin d'authentification, pour résoudre un problème qui tient en deux tables.

## Conséquences vérifiables

Le chantier est terminé quand, et seulement quand :

- le projet Google ne contient plus qu'**un** client OAuth, avec un seul URI de redirection
  et aucune origine JavaScript ;
- l'écran de consentement est **En production** — en état Test, Google expire les
  `refresh_token` au bout de sept jours, ce qui déconnecterait DriveAI et BatchChef chaque
  semaine sans message d'erreur ;
- se connecter à JobAI n'affiche jamais d'écran Google ;
- l'export vers Google Tasks de BatchChef fonctionne après une connexion faite **depuis le
  hub** — c'est le test qui prouve le prêt de jetons ;
- ajouter une personne dans la page d'administration lui ouvre l'app choisie, et seulement
  celle-là.

---

## Amendement du 14/08 — l'étape 3 se réduit à l'autorisation

Écrit après avoir lu le code de DriveAI, et non avant. Trois constats qui contredisent le
texte ci-dessus ; ils sont consignés plutôt que corrigés en silence, parce qu'un ADR dont on
réécrit les prémisses ne sert plus à comprendre pourquoi on a tranché.

### DriveAI n'est pas une app, c'en est deux

Deux identités Google **totalement séparées**, qui ne partagent aucun jeton :

| | Front (SPA + fonctions Vercel) | Moteur (Apps Script) |
|---|---|---|
| Authentification | OAuth de Marc, cookie `driveai_rt` | `ScriptApp.getOAuthToken()` |
| Portées | 5 + identité | 9, **dont Gmail** |
| Déclenchement | clic dans le navigateur | **toutes les 5 minutes, sans personne** |

Le moteur ne détient **aucun** jeton : Google l'autorise au niveau du projet Apps Script.
Il n'a ni navigateur, ni cookie, ni `refresh_token` à remplacer. Lui faire emprunter un
jeton au hub voudrait dire le sortir d'Apps Script — un autre chantier, d'un autre ordre de
grandeur, et qui toucherait le seul composant détenant Gmail.

### La justification donnée à la base était fausse

Les trade-offs affirment que le `refresh_token` doit être lisible sans navigateur « parce
que DriveAI construit son summary à trois heures du matin ». C'est faux sur le mécanisme :
cette chaîne est `hubperso.com` → `/api/hub/summary` → broker Vercel → web app Apps Script
(`?secret=…`) → une Property pré-calculée. **Aucun jeton Google de Marc n'y intervient.**

La base reste pleinement justifiée — mais par le mécanisme n° 2 seul (la liste des personnes
et leurs accès), qui est réel et livré. Pas par celui-ci.

### Fusionner les clients OAuth coûterait plus cher que ce qu'on croyait

Le client du hub devrait demander `drive` **complet** et `gmail.modify` : des portées
**restreintes**. Deux conséquences que « les portées fusionnent » ne rendait pas :
vérification Google (avec son audit de sécurité pour les portées restreintes), et surtout
l'exigence déjà écrite plus haut — passer l'écran de consentement **En production**, sans
quoi les `refresh_token` meurent tous les sept jours. On échangerait un système qui marche
contre une dépendance à un processus de validation externe, pour un gain qui ne concerne que
la moitié « front » de DriveAI.

### Décision (Marc, 14/08)

**L'étape 3 se limite à l'autorisation.** DriveAI remplace son verrou `ALLOWED_EMAIL` par un
appel à `POST /api/acces`, exactement comme JobAI, CarAI et BatchChef. Elle **garde son
propre client OAuth Google**, et le moteur Apps Script n'est pas touché.

Ce qui est abandonné, et qu'il ne faut pas aller rechercher dans l'historique en croyant que
c'était fini : le coffre à jetons côté hub (chiffrement AES-256-GCM, table `jetons_google`,
endpoint de prêt) a été écrit puis **retiré avant d'être livré**, parce que rien ne
l'utiliserait. Livrer de l'infrastructure inerte aurait donné l'illusion d'une étape franchie.

Ce que ça change concrètement pour DriveAI, en plus de l'invitation depuis
`/administration` : la session porte désormais l'adresse en plus du `refresh_token`, et
`/api/config` comme `/api/refresh` revérifient l'accès **à chaque appel**. Sans ça, retirer
un accès n'aurait mordu qu'à l'expiration du cookie — un an plus tard. Le coût est une
reconnexion unique, les cookies de l'ancien format étant refusés faute de savoir à qui ils
appartiennent.

### Ce qui reste vrai des « conséquences vérifiables »

Le premier point — « le projet Google ne contient plus qu'un client OAuth » — **ne sera pas
atteint**, et ne doit plus servir de critère. Les autres restent valables. FinanceAI reste
au backlog, sans lien avec ce constat.

---

## Amendement du 28/10 — la lecture de Drive entre dans les portées partagées

Décision de Marc (28/10/2026, deux cartes, « Oui, 4 apps quand même »), pour l'onglet Bilans du
hub (Hubperso#543) : le hub doit lire les bilans que la routine range dans Drive.

- Les quatre apps qui partagent le cookie demandent `drive.readonly` en plus de l'identité et de
  Tasks (`lib/jetonsGoogle.ts`, identique dans les quatre dépôts). Lecture seule : aucune écriture.
- Ce que ça renverse : la ligne « Ni Drive » de l'ADR et de `docs/CONNEXION-UNIQUE.md`. L'alternative
  d'une connexion Drive propre au hub (jeton en base, bouton dans l'administration) a été proposée
  et écartée par Marc.
- Coût assumé : `drive.readonly` est une portée **restreinte**. Sans vérification Google, l'écran de
  connexion affiche « application non vérifiée » ; et si l'écran de consentement est en mode Test, le
  jeton expire au bout de sept jours (voir « Conséquences vérifiables »). Les sessions déjà ouvertes
  n'ont pas le droit : une reconnexion est nécessaire dans chaque app.
