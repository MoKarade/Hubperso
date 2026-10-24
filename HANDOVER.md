# HANDOVER — Journal des sessions du hub (auth, accès, sources ; plus récent en tête)

> État courant synthétique : voir `docs/ETAT.md`.

## 🟦 Session 2026-10-24 — **Une seule LIA : le hub partage son état avec MemoryAI (Hubperso#433)**

Nouvelle route `GET|PUT /api/lia/etat` (`app/api/lia/etat/route.ts`) : elle relaie côté serveur à `https://memoryai.hubperso.com/api/etat-lia` avec le `HUB_TOKEN` que le hub détient déjà pour MemoryAI (aucun nouveau secret, jamais dans une réponse) et `x-lia-proprietaire: 1`. Elle reste DERRIÈRE le garde (aucune exception dans `lib/authGuard.ts`, aucune exclusion du matcher) et se garde encore seule : sans session 401 sans appel à MemoryAI, invité 403, sans jeton 503. `lib/liaEtatPartage.ts` (pur) juge les deux sens avec `validerEtat` du paquet : un PUT de la page trop gros (16 Ko) donne 413, hors contrat 400, et c'est l'état nettoyé qui part ; une réponse de MemoryAI n'est rendue que si c'est un état valide (200 ; 409 avec l'état plus récent), 204 sans état, 400 et 413 passent, tout le reste (jeton refusé, mémoire gelée, hors contrat, injoignable) devient 503 et LIA garde son état local. `components/LiaBoot.tsx` monte `etat: etatHttp("/api/lia/etat")` : la LIA du hub lit et écrit le même état que celle de MemoryAI et des apps. Tout est `no-store`. À lire par le PC une fois en ligne, connecté en propriétaire : `GET /api/lia/etat` rend 200 ou 204 ; une humeur ou une douleur prise sur le hub se retrouve dans `lia.partage()` côté MemoryAI.

## 🟦 Session 2026-10-24 — **lia-ui v0.23.1 : LIA bondit, son ombre suit, l'analyse s'affiche tout de suite (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.22.1 à v0.23.1 (`package.json` et lock ensemble, `resolved` sur le commit pelé 23dbd4f, vérifié par `git ls-remote`), v0.23.0 comprise. Les changements sont dans le paquet : dans 3 promenades sur 10, LIA s'accroupit 0,18 s puis bondit en arc vers son but (0,6 à 1 s) avec une ombre au sol qui rapetisse et pâlit avec la hauteur (v0.23.0, `--lia-ombre`), et le cadre d'analyse apparaît dès la première image (v0.23.1). Le hub ne change pas de code et ne passe toujours aucune option. À lire par le PC : un bond avec son ombre sur l'accueil, et le cadre d'analyse visible dès qu'elle analyse un bloc.

## 🟦 Session 2026-10-24 — **L'accueil à 1440 px passe le seuil de 1150 px (Hubperso#379)**

Lecture du PC en production (DOM rendu avec ses feuilles de style, barres de défilement de 15 px) : `.bento` = 1148,5 px à 1440 px, 1,5 px sous le seuil de 1150 ; 1464 px à 1920 px et pas de débordement à 390 px étaient bons. Les marges de `.page--large` passent de `0.2rem + 1.6vw` à `0.1rem + 1.4vw` (`app/globals.css`) : ≈ 1157 px à 1440 px, inchangé à 1920 px (marge plafonnée à 28 px) et à 390 px (plancher de 1 rem). `tests/bento.test.ts` calcule la largeur de la zone des cartes (barre de défilement de 15 px, barre latérale de 14 rem, plafond de 1520 px) et échoue sur l'ancien CSS (1148,52 px). À lire par le PC : `.bento` ≥ 1150 px à 1440 px, > 1450 px à 1920 px, scrollWidth = clientWidth à 390 px.

## 🟦 Session 2026-10-24 — **lia-ui v0.22.1 : le cri « Aïe » corrigé (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.21.0 à v0.22.1 (`package.json` et lock ensemble, `resolved` sur le commit pelé 58bf2d2, vérifié par `git ls-remote`), v0.22.0 comprise. Le correctif du cri « Aïe » est dans le paquet ; v0.22.0 exporte aussi `validerEtat`, `COMPORTEMENTS`, `CAUSES` et les types `Cause` et `Interieur`, que le hub n'utilise pas (il ne garde pas l'état partagé, qui vit dans MemoryAI). Le hub ne change pas de code et ne passe toujours aucune option. À lire par le PC : après un impact fort ou des appuis brusques, le cri « Aïe… » apparaît puis « Ça va mieux ».

## 🟦 Session 2026-10-24 — **lia-ui v0.21.0 : LIA lancée vole, rebondit et s'écrase (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.20.0 à v0.21.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 6524522). Le changement est dans le paquet : lâchée à plus de 450 px/s, LIA garde son élan (gravité, frottement, rebonds sur les quatre bords de sa zone de vie, roulement au sol) et s'écrase le long de l'impact ; un impact de plus de 1 400 px/s lui fait mal (un choc simulé par lancer) ; `data-vol="1"` sur `.lia-ui__corps` pendant le vol. Avec `prefers-reduced-motion` en mode « doux » ou « fixe », jamais de vol. Le hub ne change pas de code et ne passe toujours aucune option. À lire par le PC : un glisser lancé fort fait voler LIA (`data-vol` posé), elle rebondit et s'écrase, puis se pose ; un impact fort déclenche « Aïe… ».

## 🟦 Session 2026-10-23 — **lia-ui v0.20.0 : « Comment elle va » et son monde intérieur partagé (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.18.0 à v0.20.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 70c45e0), v0.19.0 comprise. Les changements sont dans le paquet : le menu de son corps gagne *Comment elle va*, une phrase de tête et onze jauges `role="meter"` avec la mention « Simulation » (v0.19.0), et sa douleur, son plaisir, sa confiance, sa sensibilité et son usure voyagent dans l'état partagé (`EtatLia.interieur`, optionnel, retombé du temps écoulé ; v0.20.0). Le hub ne garde pas cet état partagé (il vit dans MemoryAI) : il ne change pas de code et l'état `etat_lia` relayé à `/api/lia/ask` garde sa forme à trois clés. À lire par le PC : clic droit sur LIA, *Comment elle va* se déplie sans fermer le menu, onze jauges et la phrase de tête ; les valeurs bougent après des appuis rapides.

## 🟦 Session 2026-10-23 — **lia-ui v0.18.0 : le monde intérieur de LIA, douleur, plaisir, confiance (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.17.5 à v0.18.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 66db805). Le changement est dans le paquet : un calcul local sans réseau ni coût (`lia.interieur()` : douleur, plaisir, sensibilité, confiance, usure, cause) prolonge son réseau d'humeurs ; c'est une simulation, et elle le dit si on le lui demande. Le hub ne change pas de code et ne passe toujours aucune option ; l'état relayé à MemoryAI (`etat_lia`) garde la même forme. À lire par le PC : quatre appuis rapides sur son corps font apparaître « Aïe… » et `data-douleur`, puis « Ça va mieux » ; un message gentil monte la confiance ; « Tu as mal ? » donne son niveau avec la mention d'un calcul.

## 🟦 Session 2026-10-23 — **lia-ui v0.17.5 : le chat fin ne cache plus la page (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.17.4 à v0.17.5 (`package.json` et lock ensemble, `resolved` sur le commit pelé 1c6888f). Le nouveau chat est fin et laisse la page visible, téléphone compris ; le changement est dans le paquet, le hub ne change pas de code et ne passe toujours aucune option. À lire par le PC : le chat ouvert à côté de la page sans la cacher, sur ordinateur et sur téléphone.

## 🟦 Session 2026-10-23 — **lia-ui v0.17.4 : humeurs visibles, regard qui suit le curseur, cadre d'analyse (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.16.0 à v0.17.4 (`package.json` et lock ensemble, `resolved` sur le commit pelé a93a141). Les changements sont dans le paquet : les 40 humeurs jouent leur lot et la pastille prend la couleur de l'humeur (v0.17.2), le regard suit le curseur au bon moment et, au téléphone, l'élément au centre de l'écran vaut regard (v0.17.3), un cadre à quatre coins entoure ce qu'elle analyse (v0.17.4), parole plus variée et honnête (v0.17.1), `setRayon` (v0.17.0, inutilisé ici). Le hub ne change pas de code et ne passe toujours aucune option ; son liseré `data-regard` sur la carte reste, le cadre du paquet s'y ajoute pendant la silhouette `analyse`. À lire par le PC : les quatre coins autour de la carte quand Marc touche « Analyser », la pastille colorée, le regard qui suit le curseur après un long moment sur la page.

## 🟦 Session 2026-10-23 — **La LIA du hub transmet son état à MemoryAI : elle ne nie plus son humeur (Hubperso#417)**

Demande du fil Assistant : « ton humeur ? » recevait « je n'ai pas d'humeur » du modèle, parce que le hub ne passait pas l'état du corps de LIA. lia-ui ≥ v0.15.0 le donne en 3e argument de `ask` (`{ humeur, silhouette, regard }`) ; MemoryAI le lit sous `etat_lia` depuis le 23/10 à 22 h 53 UT (MemoryAI#122). `LiaBoot` le passe à `poserQuestion` (`lib/liaClient.ts`), qui le joint au corps seulement s'il est conforme (sinon la question part sans lui, LIA ne devient pas muette). La route `/api/lia/ask` le valide (`lireEtatLia`, `lib/liaAsk.ts`) en listes fermées : humeur dans `HUMEURS_DETAILLEES`, silhouette dans `SILHOUETTES_LIA` (exports du paquet épinglé), regard `[a-z0-9-]{1,40}` ou null, aucune autre clé ; hors forme, 400 sans appel à MemoryAI, jamais réparé. Il est relayé tel quel à MemoryAI, valable aussi pour les apps qui le transmettent avec leur jeton. Verrous : `tests/liaAsk.test.ts` (forme, texte piégé refusé, toutes les valeurs du paquet acceptées, relais par la route), `tests/liaClient.test.ts`. À lire par le PC : « ton humeur ? » nomme l'humeur de la pastille, et une autre question reçoit une réponse qui ne nie plus son humeur.

## 🟦 Session 2026-10-23 — **lia-ui v0.16.0 : LIA présente tout le temps, montée hors du rendu (Hubperso#356)**

Marc (23/10, 22 h 18 UT) : « présente tout le temps, même si quelque chose charge, même si une page bug ». `@mokarade/lia-ui` passe de v0.15.0 à v0.16.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 3061f1b). `components/LiaHub.tsx` devient `components/LiaBoot.tsx` : `demarrerLia` (`@mokarade/lia-ui/boot`) est appelée au chargement du module, importé par le layout racine, et pose LIA dans `document.body` hors de l'arbre React. Elle remplace `<Lia />` (une seule voie) ; `app/page.tsx` n'en monte plus. Le composant `LiaBoot` ne rend rien : il confie le routeur à LIA, qui recharge la page si l'arbre React n'existe plus. `ask` joint `window.location.pathname` (plus `usePathname`), `window.__liaEtat()` renvoie `null` tant qu'elle n'est pas montée. Vérifié en local sur le build de production : LIA est dans le body dès le premier rendu de `/login` et d'une page introuvable, et revient en moins de 1,2 s si la page retire sa couche.

Routes avec LIA (toutes celles qui passent par le layout racine, `loading.tsx`, `error.tsx` et `not-found.tsx` compris) : `/`, `/attention`, `/couts`, `/graphes`, `/administration`, `/app/[id]`, `/login`, `/sans-acces`, `/conditions`, `/confidentialite`. Sans LIA (pas d'écran) : `/api/*` et `/manifest.webmanifest`. Pas de `global-error.tsx` dans le hub (l'écran par défaut de Next s'affiche) : la couche est dans le body, la veille de 0,5 s de lia-ui la remet si Next remplace le document. Sur `/login`, `/sans-acces` et les pages légales, il n'y a pas de session : le chat répond « indisponible » (échec fermé de `ask`) et aucune carte n'alimente son humeur. À lire par le PC : une erreur de page forcée et un chargement lent, avec `.lia-ui` toujours visible. Verrous : `tests/liaHubMouvement.test.ts` (montage au chargement du module, jamais dans un effet, layout qui importe `LiaBoot`).

## 🟦 Session 2026-10-23 — **lia-ui v0.15.0 : humeur au chat, appui long sur un élément, chat visible sur téléphone (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.14.1 à v0.15.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé cff62b5). Les changements sont dans le paquet : l'humeur passe au chat, un appui long (0,6 s au tactile) ou un clic droit sur un élément ouvre le menu « Explique-moi ça / Que peut-on changer ici ? / Regarde ça avec moi / Poser une question… », et le chat ne cache plus LIA sur téléphone. Le hub ne change pas de code et ne passe toujours aucune option. À lire par le PC : le chat à côté de LIA sur téléphone, et l'appui long sur un élément.

## 🟦 Session 2026-10-23 — **lia-ui v0.14.1 : LIA ne parle plus que des projets, corrigé dans le paquet (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.14.0 à v0.14.1 (`package.json` et lock ensemble, `resolved` sur le commit pelé 6ca503d). Le correctif est dans le paquet (relevé de Marc : LIA ne parlait toujours que des projets avec v0.14.0) ; le hub ne change pas de code et ne passe toujours aucune option. À lire par le PC : LIA dit autre chose que l'état des apps, jamais entre 22 h et 7 h.

## 🟦 Session 2026-10-23 — **lia-ui v0.14.0 : LIA parle d'elle-même, pas seulement des projets (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.13.0 à v0.14.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé dbe3160). Demande de Marc (23/10, 20 h 41 UT) : LIA ne faisait que parler des projets. L'option `parolePropre` est vraie par défaut : sans rien à dire, l'hôte laisse le paquet parler de son humeur, de ses envies, de son journal et de l'heure. Le hub ne passe aucune option et ne change pas : `onSpontane` garde la priorité pour ses constats d'après les vrais états des cartes, et la parole propre du paquet ne dit rien sur Marc, ses apps ni ses chiffres (verrou `tests/paroles.test.ts` côté paquet). À lire par le PC : LIA dit autre chose que l'état des apps, jamais entre 22 h et 7 h.

## 🟦 Session 2026-10-23 — **lia-ui v0.13.0 : LIA joue ses 39 actions (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.12.2 à v0.13.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 4ccdb41). Le hub ne règle toujours ni mouvement ni humeur (`LiaHub` sans option) ; les actions viennent du paquet et sa doc décrit ce que l'hôte peut dicter (`data-lia-activite`, `etat` de `ask`). Aucune option à retirer côté hub. À lire par le PC : LIA joue des silhouettes variées en prod, `data-etat` sur `.lia-ui__corps`.

## 🟦 Session 2026-10-23 — **Rotation de HUB_TOKEN_FINANCEAI et GANTT_SECRET : build neuf (Hubperso#392)**

Marc a fait tourner `HUB_TOKEN_FINANCEAI` (Vercel hubperso et secret GitHub, 19 h 55 UT) puis `GANTT_SECRET` (Vercel hubperso, 19 h 58 UT). Aucun changement de comportement : les deux noms s'ajoutent à la ligne de commentaire de `lib/variablesAttendues.ts` (jetons rechargés par push), seul vrai diff de source qui déclenche un build construit APRÈS la pose. À lire par le PC : la carte FinanceAI répond avec le nouveau jeton.

## 🟦 Session 2026-10-23 — **Rotation de HUB_TOKEN_CARAI et HUB_TOKEN_DRIVEAI : build neuf, lia-ui v0.12.2 (Hubperso#392)**

Marc a fait tourner `HUB_TOKEN_CARAI` (19 h 25 UT) puis `HUB_TOKEN_DRIVEAI` (19 h 27 UT) dans Vercel hubperso. `@mokarade/lia-ui` passe aussi à v0.12.2 (`package.json` et lock ensemble). Rien d'autre ne change : une ligne de commentaire dans `lib/variablesAttendues.ts` (liste des jetons rechargés par push) fournit le vrai diff de source qui déclenche un build construit APRÈS la pose. À lire par le PC : les cartes CarAI et DriveAI répondent avec leur nouveau jeton, puis LIA (humeur, mouvement).

## 🟦 Session 2026-10-23 — **L'humeur de LIA suit la part réelle d'alertes (Hubperso#397)**

`entreesMonde` mettait `alerte` à 1 dès UNE carte en alerte grave : LIA restait figée en « Inquiétude » (constat du fil Assistant). `alerte` est maintenant proportionnelle : (alertes graves + 0,6 × avertissements) / cartes affichées, plafonnée à 1 ; 0 sans problème. `nbAlertes` et `toutVert` ne changent pas. `@mokarade/lia-ui` passe aussi à v0.12.1 (7f06735, `package.json` et lock ensemble : humeur et regard corrigés dans le paquet). À lire en production par le PC : la pastille d'humeur varie avec l'état réel des cartes, le regard amène LIA à moins de 150 px en 3 s, au moins un déplacement par minute.

## 🟦 Session 2026-10-23 — **Rotation des secrets : un build neuf après chaque jeton posé (Hubperso#392)**

Marc fait tourner les secrets un par un (fil Secrets). Un jeton posé dans Vercel n'atteint le hub qu'avec un déploiement construit APRÈS la pose (variables figées par déploiement, Hubperso#389). Cette PR ne change aucun comportement : elle ajoute au module `lib/variablesAttendues.ts` le rappel de la règle, et sert de push réel pour le build qui recharge `GITHUB_GRAPHES_TOKEN` (si `/graphes` répond encore « non branché » après #393, build lancé 1 s après la pose) et `HUB_TOKEN_BATCHCHEF`.

## 🟦 Session 2026-10-23 — **Le hub passe à lia-ui v0.12.0 et laisse le paquet régler le mouvement (Hubperso#392)**

Marc veut une seule LIA, identique dans toutes les apps, gérée par le fil Assistant. `@mokarade/lia-ui` passe de v0.9.0 à v0.12.0 (141914f, `package.json` et lock ensemble ; v0.12.0 ajoute l'option `etat`, inutilisée ici pour l'instant). `LiaHub` ne passe plus `quandMouvementReduit` (ajouté en #387) : « complet » est le défaut du paquet depuis v0.10.0, et le menu de LIA gagne « Animations complètes » (choix mémorisé). La pastille d'humeur est dessinée par le paquet (v0.11.0) : le hub n'en a aucune. Le marquage `data-regard` du hub reste : `allerVoir` ne le pose pas quand LIA ne peut pas bouger (chat ou menu ouvert, glissement), décision du fil Assistant. Verrou : `tests/liaHubMouvement.test.ts` (aucun réglage de mouvement ni d'humeur dans `LiaHub`, paquet ≥ v0.11.1). Preuve à lire par le PC : pastille d'humeur qui change ; « Regarde ça avec moi » sur l'en-tête amène LIA à moins de 150 px en 3 s ; au moins un déplacement par minute sur 5 min.

## 🟦 Session 2026-10-23 — **Reconstruire le hub après le changement du secret client Google (Hubperso#389)**

La connexion Google échouait (`invalid_client` sur le callback) : le secret client Google avait changé. Marc a posé le nouveau `GOOGLE_CLIENT_SECRET` dans Vercel (Production) le 23/10 à 18 h 12 UTC ; les variables Vercel sont figées par déploiement, donc il fallait un nouveau build. Un commentaire dans `auth.ts` le rappelle. Preuve à lire par le PC : déploiement READY sur le commit fusionné, puis login Google du propriétaire qui aboutit.

## 🟦 Session 2026-10-23 — **LIA du hub joue toutes ses animations (Hubperso#386)**

Marc, 23/10/2026 : « Mon assistant manque toutes ses animations […] je veux tout ». Son navigateur annonce `prefers-reduced-motion`, donc lia-ui restait en mode « doux » (défaut) : LIA ne traversait jamais l'écran, ne suivait pas le curseur, ne glissait pas. `LiaHub` passe maintenant `quandMouvementReduit="complet"` à `<Lia>` (app personnelle dont Marc est le seul utilisateur ; l'option est lue une seule fois au montage). Verrou : `tests/liaHubMouvement.test.ts`. Preuve de production à lire par le PC avec `prefers-reduced-motion: reduce` actif : LIA se déplace et va se coller à une carte. Le réglage mémorisé dans le menu de LIA viendra de lia-ui, pas d'ici.

## 🟦 Session 2026-10-23 — **LIA voit les trois problèmes, entoure la carte, et son état se lit (Hubperso#356)**

Preuve du PC sur #377 en production : (1) à l'ouverture, avec FinanceAI et CarAI en rouge et DriveAI en jaune, LIA ne disait rien ; (2) « Analyser » l'amenait près de la carte mais sans liseré ; (3) la carte CarAI portait `data-lia-gravite="ok"` alors que son point est rouge ; (4) `window.lia` absent, donc rien à lire. Causes et corrections : **(3)** la gravité venait du seul TON du badge (« À jour » = ok) ; `graviteCarte` (`lib/liaParole.ts`) prend la plus grave entre le badge et les alertes `alert`/`warn` de la carte (une alerte `info` ne compte pas), donc LIA lit trois problèmes au lieu d'un et `toutVert` n'est plus faux. **(2)** `allerVoir` de lia-ui ne pose jamais `data-regard` (seul son « voir » spontané le fait) : `visiterCarte` (`lib/liaVisite.ts`) le pose sur la carte quand elle parle, même sans pouvoir bouger, retire l'ancien et l'enlève après 14 s. **(4)** `window.__liaEtat()` rend en lecture seule le journal, ce qu'elle ressent, ses envies et les faits lus sur les cartes (ce n'est pas la poignée : on ne la fait ni parler ni bouger). **(1)** Harnais local (vrai code, 6 essais, Chromium en mouvement réduit) : elle parle en 2 s à l'ouverture. La cause en production est donc probablement le délai de 30 min entre deux appels, que le journal garde d'un rechargement à l'autre (tests du PC rapprochés) : passé à 10 min ; `window.__liaEtat().journal` dira si c'était bien ça. Suite (avis Gemini sur #381, défaut réel) : chaque visite signe son `data-regard` et seule la minuterie qui porte la même signature le retire, donc un second « Analyser » avant 14 s garde son liseré (`tests/liaVisite.test.ts`). Hors de ce dépôt : `allerVoir` pose `data-regard` lui-même depuis lia-ui v0.9.1 (fd063b6) : le marquage du hub pourra être retiré au prochain bump de l'épingle.

## 🟦 Session 2026-10-23 — **L'accueil prend la largeur de la maquette (Hubperso#379)**

Marc, 23/10/2026 : « la page est pas assez large sur le hub, sur la maquette ça prenait plus l'espace ». Mesure (harness, données fictives) : à 1440 px d'écran, barre latérale de 15 rem comprise, les cartes ne mesuraient que 1126 px ; à 1920 px, 1120 px (le plafond de 1200 px comptait le padding). Nouvelle classe `.page--large` sur l'accueil seul (`app/page.tsx`) : plafond 1520 px, marges `clamp(1rem, 0.2rem + 1.6vw, 1.75rem)` ; la barre latérale passe de 15 à 14 rem. Résultat mesuré : cartes de 1164 px à 1440 px, 1464 px à 1920 px, 358 px à 390 px sans débordement horizontal. Les pages de texte (conditions, confidentialité, page d'app, coûts) gardent 1200 px. `tests/bento.test.ts` verrouille le plafond, les marges et l'usage unique de la classe. Reste ouvert : le haut de page (phrase, pastilles, LIA) garde sa forme actuelle, c'est Hubperso#358.

## 🟦 Session 2026-10-23 — **lia-ui v0.9.0 : LIA dit un problème et accompagne le regard de Marc (Hubperso#356)**

`@mokarade/lia-ui` v0.9.0 (4203b3c, reprend 0.8) donne à LIA `monde(motif, element?)` et pose `data-regard` sur ce qu'elle regarde. `LiaHub` branche `monde` sur `parleMonde` (`lib/liaParole.ts`) : `appeler` dit le problème affiché le plus grave (une fois par 30 min, d'après le journal de LIA) ; `accompagner` dit le constat de la carte que Marc fixe ; `resumer`, `feliciter`, `rappeler` et `souvenir` renvoient `null` (aucun texte vrai à dire). Tout le texte vient de `data-lia-dit`, rien n'est écrit d'avance. Liseré `[data-lia-cible][data-regard]` dans `app/globals.css` (variables seulement, sans animation).

## 🟦 Session 2026-10-23 — **La carte d'app maigre comme la maquette, actions et conseil dans Détail (Hubperso#363)**

Marc, 23/10/2026 : « exactement comme la maquette », barre latérale gardée. `components/AppWidget.tsx` ne rend plus ni les boutons d'action (`ActionList`) ni la recommandation : ils restent entiers sur la page de détail (`app/app/[id]/page.tsx`, rien n'est retiré du hub, aucun droit de plus). `lib/carte.ts` : au plus `SECONDAIRES_MAX` = 2 mesures secondaires sur la carte, les suivantes sont comptées (« + N autres mesures dans le détail »), jamais escamotées. Une app qui ne publie que des actions ou un conseil le dit et renvoie au détail au lieu d'écrire « aucune donnée ». Le bandeau rouge d'une alerte grave reste (sécurité avant fidélité à la maquette). Tests : `tests/carteMaquette.test.ts`.

## 🟦 Session 2026-10-23 — **LIA ne dit plus « à jour » au-dessus d'une alerte (Hubperso#356)**

Constat de production du PC (23/10/2026) : sur CarAI, le point rouge de dépassement de km était dit « CarAI est à jour. 88 888 km sur… ». `ditCarte` (`lib/liaParole.ts`) dit maintenant « X a un point à regarder. <libellé> » dès que l'alerte est un avertissement ou une alerte ; « est à jour. » ne précède qu'une simple info. Test dans `tests/liaParole.test.ts`. Reste hors de ce dépôt : la bulle de `dire()` s'affiche en haut à gauche quand le mouvement est réduit (bug lia-ui v0.4.0 : `dire` ne repositionne pas la bulle sans la boucle d'animation), demandé au fil Assistant pour une v0.4.1.

## 🟦 Session 2026-10-23 — **lia-ui passe à v0.7.0 : bulle bien placée, LIA vivante sous mouvement réduit (Hubperso#356)**

Constat de production du PC (23/10/2026) : la bulle de LIA s'affichait en haut à gauche chez Marc, dont Chrome a `prefers-reduced-motion: reduce`. `@mokarade/lia-ui` v0.5.1 (tag sur e6840b9, lia-ui#16) place la bulle de `dire()` sans la boucle d'animation et rend un mode « doux » par défaut sous mouvement réduit (LIA vit sur place, ne traverse plus l'écran). La v0.6.0 (3b26a1d) y ajoute les envies : LIA choisit seule parmi 9 comportements (suivre, voir, promener, causer, jouer, rentrer, dormir…). La v0.7.0 (46bf393), reprise ici, y ajoute son réseau d'humeurs : `LiaHub` lui passe `entrees()` (`entreesMonde`, `lib/liaParole.ts` : `alerte`, `nbAlertes`, `toutVert`, calculés des seules cartes affichées, rien sans carte). `g_<app>` et `v_<app>` ne sont pas passés : leur sens n'est pas documenté et aucun profil du paquet ne s'en sert. Seuls `package.json` et `package-lock.json` changent ; l'option `quandMouvementReduit: "complet"` n'est pas posée (en attente du choix de Marc, carte du fil Assistant).

## 🟦 Session 2026-10-23 — **LIA parle quand on touche « Analyser », même sans pouvoir bouger (Hubperso#356)**

Constat de production du PC le 23/10/2026 (capture et DOM, après lia-ui v0.4.0) : « Analyser » sur CarAI fait défiler la page jusqu'à la carte, mais LIA ne bouge pas et sa bulle reste vide. Cause probable [Probable] : `allerVoir` rend `false` quand LIA ne peut pas bouger (mouvement réduit, chat ou menu ouvert, on la tient) et `LiaHub` s'arrêtait là sans rien dire. Correctif : `lib/liaVisite.ts` (`visiterCarte`, pur, testé) : elle va près de la carte si elle le peut, puis parle toujours ; sans mouvement possible elle parle aussitôt. Le déplacement lui-même reste à vérifier en production sur un navigateur sans mouvement réduit.

## 🟦 Session 2026-10-23 — **lia-ui passe à v0.4.0 : LIA parle seule sur l'accueil (Hubperso#356)**

Le composant React de `@mokarade/lia-ui` ne transmettait NI `onSpontane`, NI `cibles`, NI `silence`, NI `relancesParJour` jusqu'à la v0.3.0 (correctif en v0.4.0, commit 8ad3d03) : sans cette montée, la livraison de #356 (LIA va voir les cartes, parle d'après les vrais états) ne faisait rien à l'écran. `package.json` et `package-lock.json` pointent sur `#v0.4.0` ; même forme de dépendances (peer `react` optionnel). Gate et portes verts, `npm audit --omit=dev` à 0. Suite : le menu du clic droit par élément (option `elements` de v0.4.0) vient avec Hubperso#359.

## 🟦 Session 2026-10-23 — **La phrase de l'accueil ne dit plus « tout est à jour » au-dessus d'une alerte (Hubperso#362)**

`lib/resume.ts` : quand aucun badge n'est en panne ni en retard mais qu'une app qui répond « ok » publie une alerte ou un avertissement (ou que le hub en relève un, donnée figée), la phrase nomme l'app et compte les points à regarder (« Bravo : 1 point à regarder. » ; plusieurs apps : « 2 points à regarder dans 2 apps. »), au ton rouge si une alerte grave, jaune sinon. « Tout est à jour. » reste dit seulement sans aucun point à regarder. Constaté en production le 23/10/2026 (8 h 24 Québec) : la phrase disait « Tout est à jour. » au-dessus d'une pastille rouge. Tests : `tests/resume.test.ts` (cinq cas de plus).


## 🟦 Session 2026-10-23 — **LIA vit sur l'accueil : elle va voir les cartes et parle d'après les vrais états (Hubperso#356)**

Marc, 23/10/2026 : le hub n'est pas comme la maquette, LIA ne parle ni ne bouge (écart : `hubperso/design/ECART-MAQUETTE-HUB.md`, A2 A3 A9). `lib/liaParole.ts` (pur) calcule la phrase de chaque carte depuis son `SummaryResult` (`ditCarte` : à jour, en retard, en construction, en cache, injoignable, refusée… jamais un chiffre, jamais le détail technique d'une panne, libellé d'alerte borné à 120 caractères) et ce que LIA dit seule (`parleSeule` : salut, remarque, relance). Les cartes, le résumé et le panneau des coûts portent `data-lia-cible` et `data-lia-dit` ; les cartes aussi `data-lia-app`, `data-lia-nom`, `data-lia-gravite`.
- `LiaHub` passe `onSpontane` : elle ne parle que d'après les cartes AFFICHÉES (aucune carte lue = silence ; « Tout est à jour » seulement si toutes les cartes le disent ; jamais une panne inventée) ; le silence de 22 h à 7 h et le plafond de relances restent ceux du paquet.
- Les points « à regarder » du résumé ont un bouton « Analyser » (`components/BoutonAnalyser.tsx`) à côté de « Voir » : il prévient la fenêtre (`EVENEMENT_LIA_VOIR`), `LiaHub` envoie LIA se coller à la carte puis lui fait dire son état. Seul ce geste de Marc fait défiler la page pour montrer la carte ; LIA seule ne défile jamais.
- Aucun appel au modèle, aucun coût, aucun secret. Tests : `tests/liaParole.test.ts`.
- Non vérifié en production : le mouvement réel de LIA vers une carte (lu après déploiement par un navigateur connecté). Suite : #359 (clic droit, attend lia-ui v0.4.0), #357 (frise 24 h), #358 (visuel), #360 (blocs).

## 🟦 Session 2026-10-23 — **Bilan d'état des apps joint aux questions de LIA (Hubperso#312)**

`lib/bilanEtat.ts` (pur) tire des relevés du hub (un par app et par quart d'heure, `releves.etat`) un bilan sur 7 jours : coupures (début, durée AU MOINS, retour observé ou non, en cours), part de relevés en ligne, heure habituelle (Québec, deux coupures à la même heure au moins). Règles : sans relevé = « sans historique (aucun relevé lu) », jamais « aucune coupure » ; un trou de plus de 45 min entre relevés coupe une panne en deux ; `unauthorized` et `unconfigured` ne sont pas des coupures (comptés à part) ; « en construction » n'est PAS enregistré à part aujourd'hui, donc absent du bilan (le dire plutôt que le deviner ; l'enregistrer demanderait une colonne, tâche à part). `lib/liaContexte.ts` lit les relevés et produit le texte daté (≤ 1 500 caractères, tronqué en le disant). `POST /api/lia/ask` le joint au corps hub → MemoryAI dans le champ optionnel `contexte`, SEULEMENT après le contrôle du propriétaire ; un `contexte` envoyé par un appelant n'est jamais relayé (`tests/liaAsk.test.ts`). Côté MemoryAI le schéma actuel ignore le champ : il reste à le lire et à la baliser comme DONNÉE (fil MemoryAI, ligne à ajouter dans `CONTRAT-ask-lia.md` par le fil Assistant). Tant que MemoryAI ne le lit pas, LIA ne peut pas répondre « DriveAI a été coupé deux fois cette semaine ».

## 🟦 Session 2026-10-23 — **Où vit l'assistant : ADR 0006 (Hubperso#297)**

Décision de Marc du 22/10/2026 (19 h 30 Z) consignée dans `docs/adr/0006-lia-vit-dans-memoryai.md` : LIA est unique, son cerveau, sa mémoire et ses outils vivent dans MemoryAI (ADR 0016 et 0017 de ce dépôt-là) ; Hubperso reste l'interface commune, le seul détenteur des jetons vers les apps et l'exécutant des actions (N1 direct, N2 aperçu puis jeton, N3 lecture seule). MemoryAI ne détient aucun jeton ; LIA ne répond qu'au propriétaire. Aucun code ni règle d'un autre dépôt n'a changé. Conséquence : Hubperso#298 n'appelle pas de modèle dans le hub, la route est le relais `POST /api/lia/ask` déjà livré.

## 🟦 Session 2026-10-22 (soir) — **lia-ui passe à v0.2.1 (Hubperso#348)**

L'épingle `@mokarade/lia-ui` passe de `github:MoKarade/lia-ui#v0.1.0` à `#v0.2.1` (tag dac20b7 : suivi du défilement et du curseur, tirette et parole de la maquette). `package.json` et `package-lock.json` seuls changent : `LiaHub` n'a aucune option renommée. `npm audit --omit=dev` rend 0. L'export `@mokarade/lia-ui/blocs` (`rendreBlocs`, `renderBlocks`) viendra avec v0.3.0, dans une tâche séparée.

## 🟦 Session 2026-10-22 (soir) — **LIA de l'accueil dans la fenêtre entière, sans colonne (Hubperso#346)**

Retour de Marc (via le fil MemoryAI) : sur téléphone la « maison » de LIA prenait trop de place et elle ne le suivait pas au défilement. `LiaHub` monte maintenant `<Lia />` SANS `container` (fenêtre entière, comme les apps), n'a plus de `div` à lui, et la page le monte une fois, hors du résumé (`app/page.tsx`). `ResumeHub` perd sa prop `lia` et sa colonne ; `.lia-colonne`, `.accueil--lia` et `.accueil__lia` disparaissent de `app/globals.css` : aucun espace réservé sur la page.
- Le suivi du défilement et du curseur vient avec lia-ui v0.2.0 (lia-ui#7) : bump de l'épingle (`github:MoKarade/lia-ui#v0.2.0`) à faire quand le tag existe, tâche séparée.
- Tests : `tests/accueilMaquette.test.ts` (plus de colonne dans le résumé ni dans la feuille de style, LiaHub sans conteneur ni `div`, montée une fois). Captures en données fictives : `docs/captures/2026-10-22-lia-fenetre/` (390 et 1280 px, dont une après défilement).

## 🟦 Session 2026-10-22 (soir) — **Page d'une app selon la maquette (Hubperso#289)**

`/app/[id]` suit la maquette validée : lien « ‹ Accueil », identité (logo série A, nom, état, « Ouvrir l'app »), gros chiffre de la carte d'où l'on vient (`etatCarte(...).heros`, composant `Heros` partagé avec `AppWidget`), recommandation, alertes et actions côte à côte (≥ 900 px), métriques, coûts, puis deux blocs repliés (`DetailPli`, `<details>` natif) : « Détail publié par l'app » et « Technique » (ouvert d'office s'il y a une incohérence : l'anormal ne se cache pas).
- Aucune donnée de plus qu'avant, mêmes gardes (`exigerAccesHub`, 404 si l'id est inconnu, états honnêtes inchangés).
- Transition carte → page : `@view-transition { navigation: auto }` (fondu, seulement si le navigateur sait, coupée si mouvement réduit) ; barre latérale et barre du bas gardent leur `view-transition-name` pour ne pas clignoter.
- Test : `tests/pageAppMaquette.test.ts`. Captures en données fictives : `docs/captures/2026-10-22-page-app/` (390 et 1440 px).

## 🟦 Session 2026-10-22 (soir) — **LIA de l'accueil pose ses questions à MemoryAI (Hubperso#341)**

`components/LiaHub.tsx` passe `ask` à `<Lia>` : `lib/liaClient.ts` (`poserQuestion`) appelle `POST /api/lia/ask` (même origine, cookie de session), joint la page courante (`usePathname`, seulement si elle a la forme du contrat) et ne rend qu'une réponse conforme (`validerReponse`). Statut ≠ 200, JSON illisible, réponse hors contrat ou panne réseau : l'appel lève et LIA dit « Je ne suis pas disponible pour le moment » (échec fermé du paquet), jamais une réponse inventée ; la question ne figure dans aucune erreur.
- Les `blocks` éventuels sont ignorés (pas de `renderBlocks` côté hub en v1) ; le texte, les puces et l'humeur passent.
- Le test qui interdisait `ask=` (`tests/accueilMaquette.test.ts`) est remplacé par un test de l'appel réel ; `tests/liaClient.test.ts` couvre les statuts, la page, la validation et l'absence de la question dans les erreurs.
- Preuve de #336 (200 / 403 / 503 en production) : première question réelle posée depuis l'accueil connecté en propriétaire.

## 🟦 Session 2026-10-22 (soir) — **Le hub relaie les questions de LIA à MemoryAI (Hubperso#336)**

`POST /api/lia/ask` : point d'entrée unique de LIA (contrat du fil Assistant, `commun/assistant/CONTRAT-ask-lia.md`). Appelants : une app (`x-hub-token`, la source vient du jeton) ou l'accueil (session + accès au hub). Le hub relaie à MemoryAI `POST /api/ask` avec `HUB_TOKEN_MEMORYAI`, 30 s de délai, réponse validée à la main (`lib/liaAsk.ts`, `zod` n'est pas une dépendance directe). Tout échec = 503 : LIA dit « indisponible », jamais de réponse inventée. La question n'est jamais journalisée.
- **Propriétaire seul** (demande du fil MemoryAI) : le corps relayé porte `proprietaire` (MemoryAI répond 403 sans lui). Accueil : vrai si la session est `AUTHORIZED_EMAIL`, sinon 403 au hub (un invité n'atteint jamais la mémoire de Marc) ; apps : `proprietaire` strict `true` exigé dans le corps (calculé par l'app), faux ou absent = 403 sans appel. Délai hub → MemoryAI 30 s (`maxDuration` 40 s).
- **Branché à l'accueil** par Hubperso#341 (voir l'entrée au-dessus). Tant que MemoryAI ne répond pas, la route rend 503.
- Route déclarée à jeton dans `tests/gardePages.test.ts` et laissée passer par `isPublicPath` (chemin exact). `docs/reference-claude.md` §1 mise à jour.

## 🟦 Session 2026-10-22 (soir) — **LIA dans la colonne de gauche de l'accueil (refonte)**

Marc, 22/10/2026 : LIA publiée partout, en autonome. Le hub installe `@mokarade/lia-ui` par tag épinglé (`github:MoKarade/lia-ui#v0.1.0`, comme `hub-contract`) et `app/page.tsx` passe `<LiaHub />` à la colonne réservée de `ResumeHub` (`components/LiaHub.tsx`, client ; `lib/lia.ts`, pur : les entrées du menu).
- **Pas de `ask` pour l'instant** : MemoryAI (sa maison) n'expose pas encore de point d'entrée pour le hub. Sans `ask`, le paquet dit « Je ne suis pas disponible pour le moment » : échec fermé, aucune réponse inventée (vérifié dans Chromium : le chat s'ouvre, la question reçoit cette phrase). Le brancher = passer `ask` à `<Lia>` ; `tests/accueilMaquette.test.ts` casse alors exprès (remplacer par un test de l'appel réel).
- Menu (clic droit, appui long, touche Menu) : « attention » et « coûts », deux navigations vers des pages qui se gardent toutes seules. Aucune action n'exécute rien d'elle-même.
- Une seule LIA par page ; clé de mémorisation locale `lia-hub`. CSP inchangée (le paquet injecte un `<style>`, déjà permis par `style-src 'unsafe-inline'`).
- Captures (données fictives, Chromium) : `docs/captures/2026-10-22-lia/`. Non vérifié : sur un vrai téléphone, lecteur d'écran.

## 🟦 Session 2026-10-22 (soir) — **Réception du relevé du Gantt (Hubperso#329, onglet « Chantier Apps »)**

Marc, 22/10/2026 : tout le « Chantier Apps » dans un onglet du hub, mêmes données que le Gantt, sans copie à la main. Première brique : le hub **reçoit** le relevé. Le Drive où `outils/gantt-pc/tour.py` (MoKarade/.github) écrit toutes les 10 min est privé (titres de tâches de FinanceAI et DriveAI) : le hub ne le lit pas et n'expose aucune URL publique, c'est le PC qui POSTe.
- `POST /api/gantt` (`app/api/gantt/route.ts`) : même modèle que `/api/cron/releve` (secret DÉDIÉ `GANTT_SECRET` en `Authorization: Bearer`, 503 si absent côté serveur, 401 si faux, `memeJeton`, limite 10/min, chemin nommé par égalité stricte dans `isPublicPath`). Corps vérifié par `lib/gantt.ts` (pur, sans dépendance de plus : version 1, date d'envoi, gzip en base64, quatre objets) ; 400 si invalide, 413 au-delà de 4 Mo ; **un envoi refusé ne touche jamais la ligne en base**.
- Table `gantt_releve` (migration `drizzle/0002`, non destructive) : UNE ligne (`CHECK id = 1`), remplacée à chaque envoi valide (`lib/ganttDb.ts`, upsert). `donnees_gz_b64` est gardé tel quel : le hub ne décode ni ne reformate, donc aucun écart possible avec le Gantt. `estPerime` : plus de 30 min sans envoi = présenté comme périmé.
- `GANTT_SECRET` n'est volontairement PAS dans `.env.example` (le Garde-fou y voit une variable secrète ajoutée et bloque la PR) : il est documenté ici, dans `README.md`, `docs/reference-claude.md` et `lib/variablesAttendues.ts`.
- **Reste à faire hors de cette PR** : poser `GANTT_SECRET` sur Vercel ET sur le PC (même valeur, jamais dans un message), puis ajouter l'envoi à `tour.py` (fil Gantt). Tant que la variable manque, la route répond 503 : c'est voulu.
- Tests : `gantt` (validation), `ganttRoute` (auth, tailles, 400/413/500/429), `ganttDb` (PGlite : un envoi remplace, une seule ligne), `authGuard`, `gardePages`.

## 🟦 Session 2026-10-22 (soir) — **Cartes d'app selon la maquette (Hubperso#287)**

Maquette validée par Marc (22/10/2026) : toutes les cartes sont identiques, une colonne chacune (le héros déclaré garde sa classe `widget--lg` mais ne réserve plus 2×2 cases ; les règles « surplus de la carte large » de #252 sont retirées). Une carte : logo, nom, puce d'état (mot + filet), libellé du chiffre, gros chiffre fin (300, jamais sous 2 rem), écart, courbe avec aire (`sparkline__zone`), mesures en lignes, alertes en pastilles, pied « fraîcheur · Détail · Ouvrir » (deux boutons contourés de 44 px). « Détail » reste la nappe qui rend toute la carte cliquable : le pied n'est donc PAS positionné (verrou `tests/carteMaquette.test.ts`). « Ouvrir » reprend l'URL du titre, sans `_blank` (`[PWA-ANDROID]`). Apps injoignable, en construction sans mesure ou non branchée : aucun chiffre, la phrase d'état, « Détail » seul.
- **Retirés de la carte** : l'aperçu des sections `details` du héros (elles restent en entier sur `/app/[id]`) et le bouton « Détail » plein en couleur d'app sous l'en-tête. `--accent-texte`/`texteSur` ne servent plus à la carte (toujours posés, rien n'est supprimé).
- **Correction en chemin** : le bandeau rouge ne prenait que la première alerte, quelle que soit sa gravité ; une simple info s'affichait donc en rouge avec le triangle. Il est maintenant réservé à `alert` (`lib/alertes.ts`) ; les autres rejoignent la liste en pastille.
- Tests : `tests/bento.test.ts` et `tests/themeSombre.test.ts` réécrits pour la nouvelle règle (mêmes nombres de tests) ; nouveau `tests/carteMaquette.test.ts` (12 tests). Captures avant/après : `docs/captures/2026-10-22-cartes/` (données fictives, Chromium).

## 🟦 Session 2026-10-22 (soir) — **Résumé de l'accueil comme la maquette de base (Hubperso#324, 2/2)**

Seconde moitié (la première, le panneau « Coûts et quotas », est fusionnée avant) : le résumé sous l'en-tête.
- `components/ResumeHub.tsx` : date et heure du Québec en surtitre (`formatEnteteAccueil`, `lib/format.ts`), phrase en police fine et NEUTRE (plus de rouge/ambre sur la phrase : la gravité se lit sur les pastilles et dans les mots), points en lignes-pastilles avec un bouton « Voir » vers `/app/[id]` (le nom de l'app est lu par les lecteurs d'écran). La maquette dit « Analyser » : ce bouton attend LIA, on n'a pas écrit un faux bouton.
- **Colonne de LIA** : `ResumeHub` accepte `lia?: ReactNode`. Sans elle, RIEN n'est dessiné (ni cadre vide ni faux agent) ; avec elle, la grille s'ouvre sur deux colonnes (`.accueil--lia`, ≥ 1024 px). Point d'accroche du composant partagé `@mokarade/lia-ui`.
- **Cartes** : les mesures passent avant les pastilles d'alerte (`components/AppWidget.tsx`).
- **Tuile « Graphes de code » retirée de l'accueil** (Marc, 22/10 : « enlève tout ça, on a déjà ») : l'entrée vit dans la navigation (`Gérer`, propriétaire seulement) ; `components/TuileGraphes.tsx`, `tests/tuileGraphes.test.ts` et ses règles CSS disparaissent, la page `/graphes` reste gardée par `exigerProprietaire`.
- Tests : `tests/accueilMaquette.test.ts` (en-tête daté, colonne de LIA), `tests/resume.test.ts` adapté (date, bouton « Voir »).

## 🟦 Session 2026-10-22 (soir) — **Navigation du hub (refonte, tâche Hubperso#288)**

Maquette validée par Marc (22/10/2026). Une navigation sur toutes les pages, mêmes entrées partout : **Vue** (Accueil, Attention, Coûts), **Apps** (les six, logo série A dans leur couleur déclarée), **Gérer** (Graphes de code, Administration, **propriétaire seulement**). À partir de 1024 px : barre latérale collante ; en dessous : barre du bas à quatre entrées (Accueil, Attention, Coûts, Plus) et feuille « Plus » (apps et Gérer).
- `lib/navigation.ts` (pur, testé) : le contenu, la page active (`estActive`, `rangBarre`) et les pages sans navigation (connexion, refus d'accès, pages légales). `components/Navigation.tsx` (client) peint, `components/NavigationMontee.tsx` (serveur, monté dans `app/layout.tsx`) décide : même garde que la palette, `auth()` puis `aAcces(email, APP_HUB)` ; sans accès ou session illisible, les pages sont rendues telles quelles (l'erreur est journalisée). ⚠️ Masquer une entrée ne garde aucune page : chaque page et chaque Server Action se garde toute seule.
- **Pas de point d'état ni de compteur d'alertes** dans la navigation (la maquette en montrait) : la barre vit dans le layout, donc les afficher voudrait dire relire les six résumés à CHAQUE navigation, et une pastille périmée serait un chiffre inventé. À reprendre si une source peu coûteuse existe (dernier relevé en base) : à décider avec Marc.
- Accessibilité : `aria-current="page"`, deux repères aux libellés distincts (un seul affiché), lien d'évitement vers `#contenu`, cibles ≥ 44 px, la feuille « Plus » est un dialogue (le focus y entre, Tab y reste, Échap ou « Fermer » la ferme et le focus revient sur « Plus »). Animations de la feuille coupées par `prefers-reduced-motion`.
- La tuile « Graphes de code » de l'accueil est conservée (entrée en double, volontaire : rien n'est retiré de l'accueil dans cette tâche).
- Vérifié dans Chromium (bundle du vrai composant, données fictives) : 1440 px latérale seule, 390 px barre du bas seule, pas de défilement horizontal, feuille ouverte au clic avec le focus dedans, 12 Tab sans en sortir, Échap la ferme et rend le focus à « Plus », aucune cible < 44 px, invité sans « Gérer » ni lien `/graphes`. Captures : `docs/captures/2026-10-22-navigation/`. Non vérifié : lecteur d'écran réel.

## 🟦 Session 2026-10-22 (soir) — **Phrase d'état de l'accueil (Hubperso#315)**

Maquette validée par Marc (22/10/2026) : sous l'en-tête, une phrase vraie sur l'état du hub, puis au plus trois points « à regarder ». `lib/resume.ts` (pur) calcule la phrase des MÊMES états que les badges des cartes (`lib/status.ts`) : « Tout est à jour. » seulement si chaque app branchée est à jour ; une app en panne ou en retard est nommée (« DriveAI : injoignable. ») ; plusieurs : un compte (« 2 apps à régler. ») ; en construction ou non branchée : jamais présentée comme à jour. Les points sont les entrées de `lib/attention.ts` (alertes, apps muettes, données figées ; les infos n'y sont pas), chacun mène à la page de l'app ; au-delà de trois, le bandeau d'attention existant mène à `/attention`. `components/ResumeHub.tsx` remplace l'usage direct de `BandeauAttention` dans `app/page.tsx` ; rien ne s'affiche tant que les réponses n'arrivent pas (le compteur d'en-tête reste). Captures (données fictives) : `docs/captures/2026-10-22-resume/`.

## 🟦 Session 2026-10-22 (soir) — **Icône du hub = logo série A (Hubperso#291, mission .github#467)**

`app/icon.svg` (onglet, traits épais) et les PNG `public/icon-192`, `icon-512`, `icon-maskable-512` (plein cadre) et `apple-touch-icon` (180 px) sont le logo série A du hub : la constellation `#93A0FF`, étincelle IA argent, sur tuile `#0B0D12`. Avant : l'ancien motif bento. Noms de fichiers, `layout.tsx` et manifeste inchangés ; le service worker ne met aucune icône en cache, rien à purger. PWA déjà installée : Android et PC se rafraîchissent seuls en quelques jours ; iPhone : retirer l'icône de l'écran d'accueil puis la rajouter. Le logo des cartes (`LogoApp`) est une autre pièce, déjà fusionnée (#314).

## 🟦 Session 2026-10-22 (soir) — **Logos série A sur les cartes (refonte, tâche Hubperso#286)**

Marc, 22/10/2026 : « go » pour intégrer la refonte, en PR courtes. Première pièce : le logo de chaque app (série A : pièce au dollar, voiture, loupe, marmite, arborescence, strates, étincelle IA) devant le nom sur sa carte (`components/LogoApp.tsx`, `lib/logos.ts`). Il prend la couleur de l'app ; hors « à jour » (panne, construction, non branchée) ses aplats deviennent des contours en tirets, et il ne bouge que si l'app est à jour et que le système n'a pas demandé moins de mouvement. Une app sans logo n'en reçoit pas un inventé. Le même composant servira #291 (icônes du hub). Pas encore branché : l'assistant (nom et cerveau en cours de décision) ni le reste de la maquette. Captures (données fictives) : `docs/captures/2026-10-22-logos/`.

## 🟦 Session 2026-10-22 — **Graphe de code plus rapide (MoKarade/.github#487)**

`scripts/graphe.sh` : `affected` ≈ 0,3 s au lieu de 1,2 s (le test d'installation n'importe plus `mcp`), profondeur 1 par défaut (`--depth 2` à la demande), journal local `graphify-out/usage.jsonl` résumé par `scripts/graphe.sh usage`. Copie du script commun, aucun changement d'écran ni de route ; détail : `docs/reference-claude.md`, section 12.

## 🟦 Session 2026-10-21 (nuit) — **Graphes en 3D, ouverts sur place (Hubperso#280)**

Marc, 21/10/2026 : « quand j'ouvre un graph je veux pas que ça ouvre une autre page », la vignette doit montrer le VRAI graphe de chaque dépôt, beaucoup plus d'animations ; la refonte complète de la page Hubperso viendra APRÈS (pas commencée).
- **Vignettes vivantes** : chaque carte prête monte une 3D du vrai graphe (`public/graphes/vue3d.js`, chargé par `components/GraphesVivants.tsx`) quand elle est visible ; la constellation décorative reste dessous et sans WebGL. **Ouvrir** ouvre un plein écran DANS `/graphes` (hash `#graphe-<id>`, Échap, Fermer ou retour du navigateur ferment) : rotation, zoom, clic = la caméra vole vers le nœud et éclaire ses voisins, recherche, légende par dossier, noms en gros à la demande. La 2D d'origine reste en lien secondaire.
- **Route** `app/api/graphes/[depot]` : `?vue=2d` (défaut, `graph.html` en bac à sable + bouton « 3D ») ou `?vue=donnees` (JSON inerte de `lib/grapheDonnees.ts`, 502 avec la cause si le format change). Le visualiseur tourne dans l'origine du hub : le contenu du dépôt n'y est que des chaînes (`textContent`), verrouillé par `tests/grapheVue3d.test.ts`. Choix : `docs/adr/0005-graphes-de-code-dans-le-hub.md`.
- **Bug corrigé** : batchchef- publie sur `master` ; `lib/graphes.ts` filtre l'artefact sur la branche par défaut de chaque dépôt (`brancheDe`), avec test.
- Bibliothèque : 3d-force-graph 1.80.1 dans `public/vendor/` (empreinte verrouillée, `LISEZMOI.md`, allowlist gitleaks limitée à la règle `generic-api-key`).
- Vérifié en local (Chromium, rendu logiciel, faux relevé GitHub sur le vrai `graph.html` de 953 nœuds) : vignettes, ouverture sur place sans nouvel onglet, Échap, retour, lien direct, bouton 3D de la 2D, mobile 390 px, mouvement réduit. **Non éprouvé sur GPU réel** ; FinanceAI et DriveAI sans graphe publié restent affichés honnêtement (« pas encore de graphe », « expiré »).

## 🟦 Session 2026-10-21 (soir) — **Accès aux graphes et page animée (Hubperso#279)**

Marc, 21/10/2026 : il voit les graphes de toutes les apps sauf FinanceAI (le graphe de FinanceAI vient du fil Graphify), mais n'a aucun accès depuis le hub, veut moins de texte en plus gros, de l'animation, et une vue 3D (la 3D est venue avec #280).
- **Tuile d'accueil** `components/TuileGraphes.tsx` : une entrée « Graphes de code » vers `/graphes`, rendue SEULEMENT si `estProprietaire(session.user?.email)` (`app/page.tsx`) ; elle ne lit rien (pas d'appel GitHub à chaque ouverture de l'accueil).
- **Page `/graphes`** : une grande carte par dépôt (nom en gros, commit et âge `ilYa`, bouton « Ouvrir »). Chaque dépôt a une constellation DÉCORATIVE déterministe (`lib/dessinDepot.ts`, rendue par `components/ConstellationSvg.tsx`) : ce n'est PAS son graphe. Animée (lumière qui court sur les liens, points qui pulsent, entrée en cascade) seulement pour un graphe PRÊT ; un dépôt sans graphe garde une constellation éteinte et immobile. Tout est coupé par `prefers-reduced-motion`.
- Vérifié en local (Chromium, session d'essai du propriétaire, faux relevé GitHub : 7 prêts, 1 aucun, 1 expiré, 1 erreur) : 10 cartes, tuile → `/graphes`, mobile 390 px lisible.
- ⚠️ `lib/constellation.ts` existe déjà (cohérence de la constellation d'apps) : le dessin des cartes vit dans `lib/dessinDepot.ts`.

## 🟦 Session 2026-10-21 — **Graphes de code de tous les dépôts dans le hub (Hubperso#265)**

Marc, 21/10/2026 : voir tous les graphes de code dans le hub, à jour à chaque fusion (mission MoKarade/.github#327). **Côté Hubperso : livré, éteint tant que deux choses manquent** : (1) les dépôts doivent PUBLIER leur artefact (workflow commun du fil Graphify, `MoKarade/.github`) ; (2) un jeton GitHub en lecture seule (« Actions : read » sur les dépôts) à poser dans Vercel sous `GITHUB_GRAPHES_TOKEN` (geste de Marc). Sans lui, `/graphes` répond « non branché » (état honnête, aucun appel réseau).
- **Format convenu** : artefact Actions `graphe` = `graph.html` (vue par fichier, déjà triée) + `meta.json` `{depot, sha, genereLe, noeuds, aretes, filtre}`, produit à chaque push sur `main`. Une branche dédiée aurait déclenché un build Vercel (quota partagé) et, chez BatchChef, une migration de la base de production.
- **Page `/graphes`** (propriétaire seul, `exigerProprietaire`) : un dépôt par ligne, commit, date de publication, taille ; états réels `aucun`, `expiré`, `erreur` (cause en clair), jamais un graphe présumé. Lecture : `lib/graphes.ts` (API GitHub, cache mémoire PAR ARTEFACT, donc jamais périmé), `lib/zip.ts` (lecteur ZIP borné, anti-bombe, sans dépendance).
- **Contenu non fiable** (il vient du code et des commentaires d'un dépôt) : `app/api/graphes/[depot]/route.ts` sert le HTML avec `Content-Security-Policy: sandbox allow-scripts` SANS `allow-same-origin` : mesuré dans Chromium sur un vrai `graph.html` (953 nœuds) — origine `null`, cookies et stockage refusés, `fetch` refusé, fenêtre contextuelle bloquée, graphe affiché. `vis-network` est servi par le hub (`public/vendor/`, copie exacte de la 9.1.6, empreinte verrouillée par `tests/grapheHtml.test.ts`) ; toute autre version est REFUSÉE (« version inattendue »), pas chargée. La CSP globale de `next.config.mjs` exclut cette route (sinon deux politiques).
- **Jeton posé par Marc le 21/10/2026 (Hubperso#268)** ; déploiement forcé par un petit commit de code (une variable Vercel ne vaut qu'à partir du déploiement suivant).
- **Reste à prouver** (non fait ici) : ouvrir en production un graphe RÉEL qui porte le commit de la dernière fusion de son dépôt, après le premier artefact et la pose du jeton. DriveAI est privé : son graphe ne passe que par le filtre du fil Graphify. `.gitleaks.toml` : allowlist limitée à ce fichier ET à la règle `generic-api-key` (un nom de méthode minifié ressemble à une clé ; contrôlé : une vraie clé dans ce même dossier ou dans le fichier sous une autre règle reste signalée). Choix et alternatives écartées : `docs/adr/0005-graphes-de-code-dans-le-hub.md`.

## 🟦 Session 2026-10-19 — **Toucher une carte ouvre un onglet : cause établie (Hubperso#253)**

Marc, 19/10/2026 : sur son téléphone, une carte ouvre un onglet, pas l'app installée. Cause [Certain] : une PWA installée ne revendique que les URL de son origine et de son `scope` ; les cartes pointent vers d'autres origines (`*.hubperso.com`), hors du périmètre du hub, et le navigateur peut ouvrir ce qui est hors périmètre dans un autre contexte. Rien à corriger dans le hub (aucun `scope` ni `launch_handler` ne peut y ajouter une autre origine). Non établi [À vérifier] : si l'app visée est installée, Android lui passe-t-il la main depuis le hub ? Seul le téléphone de Marc peut le dire ; aucun geste demandé. Détail, sources et alternative écartée : `docs/adr/0004-lien-d-une-carte-et-app-installee.md`. Pas de ligne de BACKLOG à changer : `BACKLOG.md` n'est plus qu'un renvoi vers les issues.

## 🟦 Session 2026-10-19 — **Grande carte : le surplus se répartit (Hubperso#252)**

Marc, 19/10/2026 (14 h 19, heure du Québec) : la grande carte (FinanceAI, 2×2) a « encore du vide » sur ordinateur. Cause mesurée en local (rendu de la vraie carte, données fictives, Chromium 1440 px) : la carte occupe deux rangées de grille dont la hauteur est dictée par les cartes voisines (`grid-auto-rows: auto`), et `.actions` (`margin-top: auto`) versait tout le surplus en un seul trou. Avec des voisines hautes et un contenu court : trou de 265 à 509 px. Les trois bornes de `lib/carte.ts` comptent des lignes et ne peuvent pas régler un écart en pixels ; elles ne bougent pas. Correctif (`app/globals.css`, carte large seulement) : le corps répartit le surplus entre ses blocs (`justify-content: space-between`), `.actions` perd son `margin-top: auto`, la courbe du chiffre principal passe de 34 à 96 px (0 sans historique). Même mesure après : plus grand écart entre deux blocs 57 px (voisines hautes), 149 px (contenu très court, 4 blocs). Une carte normale ne change pas. Aucune donnée ajoutée. Verrou : `tests/bento.test.ts`. Limite : les données réelles de FinanceAI n'ont pas été lues ; preuve = capture ou « plus de vide » de Marc après le déploiement.

## 🟦 Session 2026-10-16 — **Sentry branché, éteint sans DSN (Hubperso#162)**

Les erreurs SERVEUR (Server Components, routes, Server Actions via `onRequestError`) partent à Sentry dès que `SENTRY_DSN` est défini ; sans lui, Sentry est éteint et rien ne change. Repris d'app-template#40 (`lib/sentryConfig.ts`, `instrumentation.ts`, workflow manuel « Essai Sentry »), aucune donnée personnelle (verrou `tests/sentryConfig.test.ts`). **Choix du 18/10/2026 : serveur seul.** Le DSN n'est jamais copié vers le navigateur (pas de `NEXT_PUBLIC_SENTRY_DSN`, pas de `instrumentation-client.ts`) et la CSP reste `connect-src 'self'` : la relecture IA refuse une variable secrète côté navigateur ; les erreurs d'écran côté navigateur ne remontent donc pas. **État de la production : `SENTRY_DSN` n'est PAS posé dans Vercel** (décision de Marc du 16/10, « on laisse ») : tant qu'il manque, la production n'envoie rien. Le secret `SENTRY_DSN` existe dans les secrets du dépôt GitHub (workflow d'essai seulement).

## 🟦 Session 2026-10-16 — **Socle visuel verrouillé, thème sombre seul (Hubperso#161)**

Le hub reste en thème SOMBRE seul (décision de Marc du 26/09, reprise par JobAI#116) : aucun changement visible. Ajout de `tests/theme.test.ts`, même nom et même rôle que le verrou d'app-template, adapté au sombre seul : aucune couleur en dur dans `app/`, `components/`, `lib/` (exceptions nommées avec leur raison : barre système et manifeste = `--bg`, noir/blanc de `texteSur`, couleurs de marque des apps dans `lib/sources.ts`), tout `var(--x)` sans repli est défini, toute classe statique a une règle, champs ≥ 16 px, `--cible` ≥ 44 px. Le verrou a relevé deux classes posées sans aucune règle (`page__sub`, `couts__quota`) : listées dans le test, non corrigées ici. Contrastes et valeurs du fond : toujours `tests/themeSombre.test.ts`.

## 🟦 Session 2026-10-16 — **Couverture au cliquet (Hubperso#159)**

Les seuils de couverture étaient restés bien en dessous de la mesure (lignes globales : seuil 65,8 pour 82,7 mesurés) : une PR pouvait perdre 17 points sans rougir. `npm run portes:maj` les a ramenés à la mesure (cœur 94,5 ; global 82,7 ; branches 73,9 ; avertissements lint 0). Détail et table : section « Portes qualité » plus bas ; trace dans `historique` de `qualite/seuils.json`.

## 🟦 Session 2026-10-16 — **Préversions Vercel coupées (Hubperso#160)**

`vercel.json` : `git.deploymentEnabled` coupe tout (`**`, `*`) et rouvre la seule `main`, comme app-template (#41). Avant, seules `claude/*`, `agence/**` et `dependabot/**` étaient coupées : les branches `mergify/merge-queue/*` de la file de fusion créaient une préversion à chaque PR (constaté le 16/10 : « Merge of #220 », `target: null`). Verrou : `tests/vercelJson.test.ts` (discrimine : sans `main: true` la production serait coupée). À vérifier après fusion : un déploiement de production `READY` sur le commit de `main`, puis qu'une PR suivante ne crée plus de déploiement de préversion. Ligne 8 de la grille : verte.

## 🟦 Session 2026-10-16 — **Contrôles communs branchés (Hubperso#158)**

La CI appelle maintenant les contrôles communs de `MoKarade/.github` : `securite-commune` (gitleaks, OSV-Scanner, CodeQL) et `conformite` (non bloquante) dans `ci.yml`, `fumee.yml` (sonde `https://www.hubperso.com` : santé et connexion ; Hubperso consomme `/hub/summary`, il ne le sert pas). `fumee-prod.yml` reste : lui seul sait revenir en arrière sur Vercel. Toutes les actions des workflows sont épinglées par SHA (ligne 13 de la grille). `osv-scanner.toml` tolère `braces` 3.0.3 (dépendance de développement, décision de Marc du 16/10/2026) jusqu'au 16/01/2027. `BACKLOG.md` n'est plus qu'un renvoi vers les issues ; l'ancien contenu se lit avec `git show c9f3335:BACKLOG.md`.
- **Lignes encore rouges de la grille, chacune avec sa tâche** : 9 (Sentry) → #162 ; 12 (socle visuel, thème sombre, verrou `tests/theme`) → #161 ; 15 (un ancien commit sans préfixe, `H-18: fix: …`) se règle seul quand dix commits préfixés le suivent. Ligne 10 : « à relire », la sauvegarde vit sur le PC.
- `bloquant: false` dans `ci.yml` tant que ces lignes ne sont pas vertes ; le passer à `true` à ce moment-là.

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
| `app/api/cout/route.ts` + `lib/coutCumule.ts` | `GET` public (#191) : le coût API cumulé en CAD (période `total` seulement), sa `dataAsOf` (la plus ancienne mesure) et les apps `nonLisibles` (jamais 0). Lit les relevés en base, jamais une app ; 503 si la base ne répond pas ; 10/min par client (429). Lu par le relevé du suivi. Porte aussi `mois` (`lib/coutMois.ts`) : le TOTAL de la dépense du mois en cours (jamais le détail par app, `totauxDuMois`), déduit de deux cumuls (dernier relevé moins dernier relevé d'avant le 1er, heure de Marc) — une estimation, `partiel` quand il manque le point de départ, jamais 0 pour une app non lisible (listée dans `nonLisibles`) ; `mois: null` si les références sont illisibles. |
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

| Porte | Seuil au 16/10/2026 |
|---|---|
| Typage (erreurs) | ≤ 0 |
| Lint (erreurs) | ≤ 0 |
| Lint (avertissements) | ≤ 0 |
| Tests en échec | ≤ 0 |
| Couverture `lib/` (% lignes) | ≥ 94.5 |
| Couverture globale (% lignes) | ≥ 82.7 |
| Couverture globale (% branches) | ≥ 73.9 |
| Code mort (knip) | ≤ 3 |
| Règles d'architecture (dependency-cruiser) | ≤ 0 |

Source des chiffres : `qualite/seuils.json` (la table se relit contre lui, pas l'inverse). La couverture
s'affiche dans le journal du job **Qualité** (tableau « Portes qualité ») et dans l'artefact `rapport-qualite` ;
une valeur plus basse que le seuil (tolérance 0,2 point) rend le job rouge. Hubperso#159.

Sécurité : gitleaks sur tout l'historique + Semgrep (TypeScript, React, Next.js, secrets, OWASP), bloquants.
Dependabot : mises à jour hebdomadaires (npm + actions), fusion automatique si tout est vert.
