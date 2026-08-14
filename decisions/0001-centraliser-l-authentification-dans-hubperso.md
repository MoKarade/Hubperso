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

Chaque app interroge `GET /api/acces` avec son jeton `x-hub-token` et **met la réponse en
cache 60 secondes**. `AUTHORIZED_EMAIL` disparaît partout.

### 3. « Que peux-tu faire chez Google ? » — le prêt de jetons

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
