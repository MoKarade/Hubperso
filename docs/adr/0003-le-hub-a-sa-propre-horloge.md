# ADR 0003 — Le hub a sa propre horloge, et une deuxième route authentifiée par jeton

- **Statut** : accepté (session Claude, 14/09/2026) — plan validé par Marc avant codage
- **Portée** : Hubperso uniquement. Aucune app n'a à changer.
- **Contrat** : consomme `expectedMaxAgeSec` (`hub-contract` v1.3.0), champ optionnel

## Contexte

Marc, 14/09/2026 : « les données ne sont pas à jour, le hub est assez inutile pour le
moment, je veux retravailler à fond et que tout marche tout le temps ».

Le diagnostic a trouvé trois causes distinctes. Celle-ci est la plus grave, parce qu'elle
n'est pas une panne mais une propriété de la conception :

**`enregistrerReleve` n'était appelée que depuis `app/page.tsx`.** Il n'existait aucun cron,
ni dans `vercel.json`, ni ailleurs. Rien ne s'enregistrait quand personne ne regardait :
l'observateur était requis pour l'observation.

Les conséquences, toutes invisibles à l'écran :

1. **Aucun historique en dehors des heures de consultation.** Les graphes d'évolution
   demandés (`[H-09]`) n'étaient pas seulement « pas encore faits » : ils étaient
   impossibles, faute de points.
2. **Tout l'appareil de détection de gel était mort-né.** `inchangeDepuisMs` et
   `figeDepuisMs` (`lib/historique.ts`) ont été écrits exprès pour repérer une métrique qui
   ne bouge plus — le mode de panne qui a coûté le plus cher le 20/08/2026, quand une
   campagne DriveAI arrêtée depuis deux semaines s'affichait « en pause », c'est-à-dire
   comme un état normal. Ils ont besoin de deux relevés qui ENCADRENT le gel. Ils n'en
   avaient jamais.
3. **Une app tombée le vendredi et relevée le lundi ne laissait aucune trace du week-end.**

Et une quatrième, qui est celle que Marc voyait : le hub savait dire « l'app ne répond
pas », il ne savait pas dire « l'app répond très bien et me sert le même instantané depuis
sept heures ». `lib/attention.ts` n'inscrivait que des états d'ÉCHEC. Une app en
`status: "ok"` dont la donnée est gelée ne déclenchait rien — et la liste vide avait l'air
rassurante, exactement le défaut qu'on avait corrigé pour l'app injoignable.

Mesuré le 14/09 sur CarAI : poll Smartcar déclaré `*/30` (48 passages/jour), **518 runs en
34 jours soit ~15/jour**, avec un trou de **6 h 53** le jour même. Tous les runs verts.
L'app elle-même le savait (`sante_donnees` rendait « gravité : rompue ») ; le hub, non.

## Décision

### 1. Une horloge : `POST /api/cron/releve`, appelée par GitHub Actions

Elle fait ce que faisait l'affichage, sans l'affichage : interroger les cinq apps,
enregistrer un relevé par app, élaguer ce qui dépasse la rétention.

**GitHub Actions et pas un cron Vercel** : le plan Hobby n'autorise que des crons
QUOTIDIENS, et un relevé par jour ne mesure rien.

**Budget réseau de 20 s au lieu de 9 s** (`TIMEOUT_CRON_MS`). Les 9 s de l'affichage sont
calibrées sur quelqu'un qui attend devant une page. L'horloge n'a personne devant, et ce
qui se perd quand elle coupe trop tôt est un TROU définitif dans la mémoire — il ne se
rattrape pas au passage suivant. Le cas concret : le broker de DriveAI abandonne à 8,7 s,
choisis pour rester juste sous les 9 s du hub, soit 300 ms de marge qui ne couvrent même
pas l'aller-retour réseau. Pour l'affichage le repli est le cache de résilience ; pour
l'horloge il n'y en a pas.

**Élagage déplacé ici.** C'est le seul endroit qui tourne sans personne devant : l'accrocher
à l'affichage faisait payer à une page le nettoyage d'une table.

### 2. Une DEUXIÈME route authentifiée par jeton — et le `CLAUDE.md` est corrigé

`/api/cron/releve` traverse `isPublicPath` (`lib/authGuard.ts`), comme `/api/acces`, pour
exactement la même raison : **un workflow n'a pas de cookie de session à présenter.** C'est
un serveur qui appelle un serveur.

Le `CLAUDE.md` écrivait « c'est la SEULE exception ». Il est corrigé dans la même PR. Une
règle qu'on sait fausse cesse d'être lue comme une règle, et la prochaine session qui
ajoute une route à jeton la lirait comme un interdit — donc la contournerait par le matcher,
qui est précisément ce qu'il ne faut jamais faire (leçon n°4).

**Ce qui n'a PAS changé, et qui est le vrai garde-fou** : le matcher du middleware ne gagne
aucune exclusion. La requête continue de traverser la garde globale, y compris le refus
« authentification non configurée ».

**Un secret DÉDIÉ (`CRON_SECRET`), jamais un `HUB_TOKEN_*` d'app.** `/api/acces` réutilise
le jeton d'app parce que ce jeton IDENTIFIE l'appelant, et que l'identité est le cœur de sa
réponse. Ici il n'y a rien à identifier : l'horloge n'a qu'un appelant légitime, et ce
qu'elle déclenche est une ÉCRITURE dans la mémoire du hub. Réutiliser le jeton de BatchChef
donnerait à BatchChef le pouvoir de faire écrire le hub — un pouvoir qu'elle n'a aucune
raison d'avoir, et qui se propagerait à chaque app ajoutée. `CRON_SECRET` est le même nom
que celui déjà utilisé par CarAI pour ses polls : une convention d'écosystème.

**Échec fermé, avec deux codes distincts** : 503 si `CRON_SECRET` ou `DATABASE_URL` manque
côté serveur, 401 si le secret présenté est faux ou absent. La distinction EST le
diagnostic — 401 envoie vérifier le dépôt GitHub, 503 envoie sur Vercel. Les confondre fait
chercher au mauvais endroit, et surtout ferait passer une variable oubliée pour une faute de
l'appelant.

### 3. Le seuil de gel vient de l'APP, jamais du hub

`lib/gel.ts` (PUR) compare l'âge de `dataAsOf` à `expectedMaxAgeSec`, que l'app déclare.

C'est le point d'architecture de cet ADR. Un seuil écrit dans le hub serait faux pour au
moins une app — « 40 minutes » est sain pour un véhicule qui se rafraîchit aux 30-60 min et
catastrophique pour un moteur qui passe aux 5 min — et ce serait surtout de la connaissance
d'app codée en dur dans le hub, ce que le principe n°1 interdit.

Cinq états, et ils ne se confondent pas :

| État | Ce que ça veut dire |
|---|---|
| `fraiche` | âge connu, sous la limite déclarée |
| `figee` | âge connu, au-dessus — avec le dépassement chiffré |
| `horloge-en-avance` | `dataAsOf` dans le futur au-delà d'une minute |
| `age-connu-non-juge` | `dataAsOf` publié, pas de seuil : on sait l'âge, on ne peut pas le juger |
| `non-datee` | aucun `dataAsOf` : le hub ne sait rien, et le dit |

`age-connu-non-juge` est l'état de TOUTES les apps aujourd'hui, avant leur re-pin sur la
v1.3. Il n'est ni « tout va bien » ni une panne, et c'est pour ça qu'il est nommé : le
confondre avec l'un des deux serait inventer le diagnostic.

`horloge-en-avance` existe parce qu'une app dont l'horloge avance paraît ÉTERNELLEMENT
fraîche — c'est le seul contournement connu de toute la détection, et il ne ressemble à rien
d'anormal. Le contrat ne l'interdit volontairement pas (rejeter le summary accuserait de
panne une app qui a deux secondes de dérive) : la charge est donc chez le consommateur.

### 4. Les trous de l'horloge sont AFFICHÉS, pas lissés

Arbitrage de Marc, 14/09 : garder GitHub Actions et rendre le retard visible, plutôt que de
prétendre l'avoir réglé.

`continuite` (`lib/gel.ts`) compte les relevés, les trous (un écart de plus du double de la
cadence attendue) et le pire écart. Afficher « 47 relevés, 12 trous, le pire de 6 h 53 »
plutôt qu'une courbe lisse est le principe « no fake data » appliqué au temps : une ligne
qui relie deux points par-dessus un silence de sept heures n'est pas une approximation,
c'est une affirmation fausse sur ce qui s'est passé entre les deux.

## Trade-offs

- **La cadence reste non garantie.** L'horloge répare « rien ne tourne quand personne ne
  regarde » ; elle ne répare pas l'étalement de GitHub. Les courbes auront des trous, et
  c'est désormais écrit à l'écran au lieu d'être invisible. C'est un choix assumé, pas une
  omission.
- **Deux secrets à poser à la main** (`HUB_URL`, `CRON_SECRET`, côté dépôt GitHub et côté
  Vercel). Sans eux le workflow échoue en ROUGE : un run qui n'enregistre rien ne doit pas
  ressembler à un run vert. C'est la même règle que pour `npm run constellation`.
- **Une deuxième route hors session.** La surface d'attaque grandit d'un endroit. Contrepartie
  acceptée parce que la route n'expose AUCUNE donnée (elle répond un décompte d'écritures),
  exige un secret comparé à temps constant, et que `tests/gardePages.test.ts` vérifie
  désormais que toute route à jeton prouve cette comparaison — et que les deux listes
  (`isPublicPath` et celle du test) ne peuvent pas diverger.

## Alternatives rejetées

- **Une tâche planifiée sur le PC 24/7 de Marc.** Techniquement le meilleur choix : cadence
  vraiment fiable, gratuit, local-first. Proposé et **refusé par Marc** le 14/09 au profit de
  « garder GitHub Actions et rendre le retard visible ».
- **Vercel Pro**, qui débloque les crons fréquents. Contredit « tout gratuit, zéro
  abonnement ». Listé pour être tranché, jamais recommandé.
- **Un seuil de gel par défaut côté hub** (par exemple « figée au-delà de 6 h »). C'est ce
  qui aurait été le plus rapide, et c'est ce qui aurait fait le plus de dégâts : une fausse
  alerte permanente sur les apps à rafraîchissement lent, un silence sur les apps rapides, et
  de la connaissance d'app dans le hub. Un test le verrouille : une app sans
  `expectedMaxAgeSec` n'apparaît PAS dans la liste, même vieille de trente jours.
- **Réutiliser un `HUB_TOKEN_*` pour l'horloge.** Zéro secret de plus à poser. Rejeté : voir
  la décision 2 — ça donnerait à chaque app le pouvoir de faire écrire le hub.
- **Un `GET` plutôt qu'un `POST`.** Plus simple à appeler (et ce que fait le cron de CarAI).
  Rejeté : la route écrit, et un préchargement de navigateur ou un crawler ne doit pas
  pouvoir la déclencher.
