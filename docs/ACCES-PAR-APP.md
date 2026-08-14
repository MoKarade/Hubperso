# Accès par app — qui entre où

> Complète `docs/CONNEXION-UNIQUE.md`. Là-bas : **se connecter une fois** vaut pour toutes
> les apps. Ici : une fois connecté, **où a-t-on le droit d'entrer**. Les deux questions
> sont distinctes, et les confondre revient à ouvrir six apps à qui n'en demandait qu'une.

## Le problème

Le cookie de session est partagé sur `.hubperso.com` et toutes les apps utilisent le même
`AUTH_SECRET`. Une session créée pour BatchChef est donc lisible par JobAI, CarAI, DriveAI
et le hub. Tant qu'une seule adresse existait (`AUTHORIZED_EMAIL`), ça n'avait aucune
conséquence. Dès qu'on invite quelqu'un sur **une** app, ça en a une : sans contrôle
supplémentaire, l'inviter sur BatchChef lui ouvrirait aussi JobAI — dont le dépôt est privé
parce qu'il contient une adresse de domicile, un statut migratoire et des noms de tiers.

**L'authentification (qui es-tu) et l'autorisation (où as-tu le droit d'aller) sont
séparées.** Le cookie répond à la première ; il ne répond pas à la seconde.

## Le modèle

Deux tables dans la base du hub (`lib/db/schema.ts`), et rien d'autre :

- `personnes` — une adresse, un nom facultatif, un drapeau `actif` ;
- `acces` — une ligne par couple (adresse, app). Clé composite : pas de doublon possible.
  Clé étrangère en cascade : supprimer une personne emporte tous ses accès, donc pas
  d'accès orphelin qu'aucune page n'afficherait et que personne ne penserait à retirer.

**Pas de distinction lecture/écriture.** C'est un choix : huit apps × deux niveaux, ce sont
seize cases à cocher et une occasion de se tromper à chaque invitation. On accorde une app
entière, ou rien.

**`AUTHORIZED_EMAIL` est le propriétaire**, pas « la seule adresse admise ». Il a accès à
tout, toujours, **sans passer par la base** — sinon une table vide, une base injoignable ou
une ligne supprimée par erreur l'enfermeraient dehors, y compris hors de la page qui
servirait à réparer. Voir l'en-tête de `lib/personnes.ts`.

## L'endpoint

```
POST https://hubperso.com/api/acces
en-tête : x-hub-token: <le HUB_TOKEN de l'app appelante>
corps   : { "email": "quelquun@exemple.com" }

→ 200 { "appId": "batchchef", "acces": true }
→ 401 { "error": "unauthorized" }      jeton absent ou inconnu
→ 400 { "error": "bad_request" }       corps illisible ou `email` manquant
```

Trois points qui ne sont pas des détails :

1. **`appId` vient du JETON, jamais du corps.** Chaque app partage déjà un secret avec le
   hub (`HUB_TOKEN_<APP>`, utilisé jusqu'ici dans l'autre sens pour lire son summary) ; ce
   même secret l'identifie. Une app ne peut donc pas demander les accès d'une autre, et il
   n'y a **aucun nouveau secret** à générer ni à faire tourner. Comparaison à temps
   constant (`lib/jetonApp.ts`). Deux apps configurées avec le même jeton rendent
   l'appelant ambigu : le hub **refuse** et le journalise, plutôt que d'attribuer la
   question au hasard.
2. **POST, pas GET.** L'adresse voyage dans le corps : une URL finit dans les journaux
   d'accès de Vercel et de tout intermédiaire, l'adresse des personnes invitées n'y a rien
   à faire. La réponse est `no-store`.
3. **La route n'est pas derrière la session.** C'est un appel de serveur à serveur : pas de
   navigateur, donc pas de cookie à présenter. Elle est déclarée dans `isPublicPath`
   (`lib/authGuard.ts`) — « publique pour la middleware » ne veut pas dire « ouverte » :
   sans jeton valide elle ne répond que 401. C'est la seule exception, et elle est nommée
   explicitement (un test vérifie que `/api/acces-admin` ou `/api/acces/tout` ne passent
   pas par la même porte).

## Côté app appelante

L'app connaît déjà l'adresse (elle décode le cookie partagé). Il lui reste à demander au
hub si cette adresse a le droit d'entrer **chez elle**, et à mettre la réponse en cache
**une minute** en mémoire : sans cache, chaque page ferait un aller-retour réseau ; avec un
cache plus long, une révocation mettrait trop de temps à mordre. Une minute est le
compromis assumé — retirer un accès prend effet en moins d'une minute.

**Échec fermé partout.** Hub injoignable, réponse illisible, base absente : la réponse est
`false`. Le hub devient un point de panne unique pour l'entrée dans les apps ; c'est écrit
dans l'ADR 0001 et assumé — mieux vaut une app qui refuse que six qui s'ouvrent parce
qu'une requête a échoué.

## Ce qui n'est pas encore fait

- Le **portier du hub lui-même** : `auth.ts` refuse encore toute adresse autre que le
  propriétaire dès la connexion. Tant que ce n'est pas changé, une personne invitée ne peut
  pas obtenir de session du tout — l'endpoint ci-dessus est prêt, mais personne ne peut
  encore s'en servir pour entrer.
- La **page d'administration** (ajouter/retirer quelqu'un sans toucher à Vercel).
- Le **module client** dans JobAI, CarAI et BatchChef.
