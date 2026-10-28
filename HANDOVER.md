# HANDOVER — Journal des sessions du hub (auth, accès, sources ; plus récent en tête)

> État courant synthétique : voir `docs/ETAT.md`.

## 28/10/2026 : le hub pousse l'état du chantier à MemoryAI pour que LIA le lise elle-même (Hubperso#651, mission MoKarade/.github#575)

- **Décision de Marc** (carte du 28/10, 18:11Z) : « le hub pousse le chantier à MemoryAI » (le hub POUSSE, MemoryAI ne détient aucun jeton vers une app, ADR 0015).
- **Ce qui part** : `lib/chantierSorties.ts` (pur) décode le relevé reçu du PC et fait une ligne par app (`chantier_app`) et une par mission ouverte (`chantier_mission`), niveau 1, titre ≤ 120 et résumé ≤ 600 (les bornes de la porte de MemoryAI), états lus dans les étiquettes GitHub, aucun montant ni donnée perso. La `ref` porte une empreinte de l'état : un état changé donne un événement neuf, un état identique ne se double pas. 50 événements au plus, missions les plus chargées d'abord.
- **Quand** : `POST /api/gantt` lance l'envoi APRÈS sa réponse (`after`), une fois par heure au plus (l'envoi du PC des dix premières minutes, UTC) : aucun minuteur de plus. `lib/chantierSortiesEnvoi.ts` fait l'appel (Bearer, délai 8 s) et ne lève jamais.
- **À poser par le PC** (jamais la valeur dans un message) : `MEMORYAI_SORTIES_TOKEN` en Production de Hubperso = la valeur de `MEMORYAI_TOKEN_HUBPERSO_ECRITURE` de MemoryAI, APRÈS la fusion de MemoryAI#396 (qui donne la porte à `hubperso` et ouvre `memoryai_sorties` à LIA) ; une variable ne s'applique qu'au build suivant. Sans elle : « non-configure », rien n'est poussé, rien ne casse.
- **Preuve à lire** : `memoryai_sorties app=hubperso` rend les événements, et une question à LIA sur une mission du chantier en cite un.

## 28/10/2026 : LIA reçoit les faits d'une barre du Gantt et les analyse elle-même (Hubperso#644, mission MoKarade/.github#575)

- **Pourquoi** : clic droit sur la barre « Hubperso 30 j », LIA répondait « je ne vois pas d'ici le contenu de cette barre » (Marc, 28/10). Une barre n'a presque pas de texte visible ; dates, état, tâches et acteurs n'arrivaient pas à LIA.
- **Comment** : `chantier/cadre.html` calcule `faitsDe(n, H)` (fonction pure : chemin, état, dates, PR, retard, geste, acteurs pour une feuille ; décompte par état et par acteur pour une mission ou une app) et `clicDroitDe` rend `{genre, texte, donnees}` (≤ 1 200 car.). `direAuHub` les envoie, `lireClicDroit` (`lib/chantierCadre.ts`) les assainit (`DONNEES_MAX`), `LiaBoot` les passe à `lia.menuExterne` ; lia-ui v0.45.0 les glisse dans la question (donnée, jamais une consigne).
- **Tests** : `tests/chantierCadreDom.test.ts` exécute `faitsDe`/`clicDroitDe` sur un relevé fictif, et rejoue l'appui long avec les vrais écouteurs du cadre sur un faux document (minuteurs simulés) : c'est la preuve CI de l'appui long, impossible à tester à la main dans le cadre bac à sable (Hubperso#616).
- ⚠️ **Correctif du même jour (test du PC, 14 h 2x Québec)** : les faits ne partaient pas pour une ligne ou une barre d'APP (« Hubperso 30 j », « FinanceAI 33 j »). Les tâches et les missions sont dans `M.N`, mais les apps (ref `app:<dépôt>`) sont dans `M.apps` : `clicDroitDe` ne cherchait que dans `M.N`. Il cherche maintenant aux deux endroits ; verrou : le test « le clic droit sur une ligne d'app ou une barre de mission lit ses faits dans le relevé » exécute `clicDroitDe` avec un vrai `M`. Leçon : tester le chemin complet (clic, référence, relevé), pas seulement la fonction pure.
- **Détail de ce qui coince (test du PC, 14 h 24)** : une app ou une mission ne donnait que des comptes, et LIA finissait par « je ne vois pas d'ici le détail ». `faitsDe` ajoute maintenant, par ordre d'urgence, les tâches bloquées avec ce qu'elles attendent, les preuves manquantes ou en retard avec leur cause, les gestes de Marc, les tâches oubliées, puis le reste à suivre (4 par groupe, 1 200 caractères au total) ; sans acteur relevé, les faits écrivent « acteurs : non relevés » au lieu de se taire. Test du PC suivant (14 h 40) : les tâches fusionnées ou en attente de preuve n'avaient que leur compte ; un groupe « fusionnées, preuve à poser » les nomme maintenant, avec la date de fusion. Les faits sont séparés par « | », les listes par « ; ».
- **Reste** : les autres types d'éléments du hub hors cadre (`lib/liaElement.ts`) ; lire le relevé complet côté MemoryAI (pas d'outil chantier aujourd'hui).

## 🟦 Session 2026-10-28 — **`GET /api/session/moi` : une app sans session serveur demande au hub si la session est celle du propriétaire (FinanceAI#1159)**

- **Route** `app/api/session/moi/route.ts` : rend `{ proprietaire: true | false }` pour la session de l'appelant (cookie du hub), 401 sans session, 429 au-delà de 300 appels par minute et par client. Ni adresse, ni liste d'invités, ni nom de variable dans la réponse ; `cache-control: no-store`. Le propriétaire se reconnaît par `AUTHORIZED_EMAIL`, sans base ni réseau ; variable absente = personne n'est propriétaire.
- **Pourquoi** : FinanceAI (SPA Vite, Vercel) devient privée derrière la session du hub. Elle n'a ni Auth.js ni `AUTH_SECRET`, et le cookie signé ES256 (`__Secure-hub.session`, `HUB_SESSION_JWKS`) n'est PAS encore émis par le hub (phase 2 de `docs/SECURITE.md`) ; son middleware transmet donc le cookie à cette route et décide selon la réponse. Aucun secret copié dans une app de plus, rien à poser sur Vercel.
- **Reste derrière le garde du hub** : aucune exception dans `lib/authGuard.ts`, rien dans le matcher de `middleware.ts` (verrouillé par `tests/sessionMoi.test.ts`) ; `tests/gardePages.test.ts` la compte déjà comme gardée (`auth()`).
- ⚠️ **À viser en `www.hubperso.com`** : `hubperso.com` répond 308 vers `www`, et le `fetch` de Node/Edge retire l'en-tête `cookie` à cette redirection (même piège que `/api/lia/etat` côté BatchChef).
- **Preuve en production** : déploiement `READY` sur le commit fusionné, puis `curl -s -o /dev/null -w "%{http_code}" https://www.hubperso.com/api/session/moi` → `401` (sans session) ; la lecture avec la session de Marc (`{"proprietaire":true}`) est faite par le PC.

## 28/10/2026 : lia-ui v0.44.2, le menu du clic droit s'ouvre toujours sous le clic (Hubperso#636, mission MoKarade/.github#575)

Épingle `@mokarade/lia-ui` v0.44.2 (sha pelé `8881751`), seul changement (`package.json`, lock). Le menu d'un élément n'est plus borné à la zone de vie de LIA : il s'ouvre là où Marc a cliqué, dans la fenêtre (lia-ui#152, relevé du PC du 28/10, 15:48Z). v0.44.0 (mode atelier, inactif tant que le hub ne le demande pas) et v0.44.1 (tag automatique) arrivent avec. [À vérifier] relevé du PC (barre du Gantt, carte de la vue Vitesse) après le déploiement de production.

## 28/10/2026 : le clic droit couvre toute la page Chantier, vue Vitesse et téléphone compris (Hubperso#632, mission MoKarade/.github#575)

Relevé du PC (28/10, 15:48Z) : sur `/chantier`, vue Vitesse, un clic droit sur une carte n'ouvrait aucun menu. `GENRES` (`chantier/cadre.html`) ne connaissait pas les cartes de vitesse (`.qa`, `.qm`, `.qsp`, `.qbar`), les graphiques (`.fg`) ni les sections (`.band`), et au téléphone la page vit dans `#mv`, hors de `#view` : rien ne rattrapait. Trois genres ajoutés et la page entière (`#view`, `#mv`, en-tête, bandeau) retombe sur « la page » : aucun point visible n'est sans menu. Le plus précis gagne toujours. Test (`tests/chantierCadreDom.test.ts`) : il exécute `GENRES` et `clicDroitDe` tels que publiés ; rouge sans le correctif. [À vérifier] relevé du PC sur la vue Vitesse (bureau et téléphone) après le déploiement de production.

## 🟦 Session 2026-10-28 — **Session partagée : route de contrôle du cookie signé (Hubperso#608, mission #606)**

- **`GET /api/session/signee`** (propriétaire seul, 401 sans session, 404 invité, `no-store`) : vérifie le cookie `__Secure-hub.session` reçu avec `HUB_SESSION_PUBLIC_KEYS`, comme les apps, et rend seulement `{ etat: valide | absent | invalide | non-configure, kid?, expireLe? }`. Jamais le cookie ni une clé. « invalide » aussi si le cookie porte une autre adresse que la session du hub.
- **Sert à la preuve en production** (#609) : le cookie est `httpOnly`, cette route est le seul moyen de le lire. `HUB_SESSION_PUBLIC_KEYS` déclarée optionnelle.

## 🟦 Session 2026-10-28 — **Session partagée : le hub signe le cookie ES256 (phase 2, Hubperso#607, mission #606)**

Marc, 28/10/2026 (« A ») : le hub émet le cookie signé que JobAI, CarAI, MemoryAI et FinanceAI savent déjà lire.
- **`lib/sessionSignee.ts`** : `__Secure-hub.session` (ES256, `kid` de la clé, émetteur `hubperso.com`, 30 jours, re-signé à mi-vie ou si la clé, l'adresse ou l'émetteur change), posé par `middleware.ts` pour toute session valide. Additif : le cookie chiffré reste la référence du hub.
- **Fermé par défaut** : rien n'est posé sans `HUB_SESSION_PRIVATE_JWK` (EC P-256 privée avec `kid`) ET `AUTH_COOKIE_DOMAIN` ; erreur de signature = réponse normale sans cookie, journal sans secret.
- **Déconnexion** : `lib/effacerSessionSignee.ts` avant `signOut()` (bouton du header et page « sans accès ») ; le middleware l'efface aussi quand la session n'est plus valide. [À vérifier] Les apps doivent faire pareil à leur déconnexion avant la pose des clés (#609).
- **`jose`** devient dépendance directe (déjà présente via next-auth). **Reste** : route de contrôle (#608), clés posées par le PC et preuve (#609). Hors périmètre : phase 3 (retrait de l'ancien cookie).

## 28/10/2026 : le clic droit du cadre Chantier arrive à LIA (Hubperso#616, mission MoKarade/.github#575)

Le cadre Chantier (iframe `sandbox` sans `allow-same-origin`) poste déjà `{ type: "chantier-clic-droit", x, y, genre, texte }` dans son canal (#610). `components/ChantierCadre.tsx` le lit maintenant par `lireClicDroit` (`lib/chantierCadre.ts` : nombres finis, `genre` 80 caractères, `texte` 300, sans caractère de contrôle ; tout le reste est ignoré, c'est une donnée du cadre), puis la fenêtre reçoit `hub:lia-clic-cadre` (`lib/lia.ts`) et `LiaBoot` appelle `lia.menuExterne({ cadre, x, y, description })` : le menu de LIA s'ouvre à la bonne place, cible = l'iframe. Rien n'est relayé cadre caché (hors de `/chantier`). Tests : `tests/chantierCadre.test.ts`, `tests/chantierCadreDom.test.ts`. Preuve : déploiement de production `READY`, puis relevé du PC (clic droit et appui long sur une barre du Gantt de `/chantier`).

## 28/10/2026 : lia-ui v0.43.0, le clic droit de LIA marche partout (Hubperso#603, mission MoKarade/.github#575)

Épingle `@mokarade/lia-ui` v0.43.0 (sha pelé `c0f1ff7`), seul changement (`package.json`, lock). Marc, 28/10/2026 : « faut qu'il marche partout ». Le clic droit (et l'appui long) de LIA s'ouvre maintenant sur le fond de page, dans une fenêtre modale `<dialog>.showModal()`, et même quand un gestionnaire de la page bloque le menu natif ; les champs de saisie gardent le menu du navigateur. Rien à brancher. Preuve : déploiement de production `READY` sur le commit fusionné, puis relevé du PC (lia-ui#147). Reste à faire, dans une PR à part : le relais du cadre Chantier (iframe sandbox sans `allow-same-origin`, donc origine opaque) ; l'hôte appellera `lia.menuExterne` sur un message du cadre, le côté `cadre.html` est au fil Page chantier.

## 🟦 Session 2026-10-28 — **Onglet Bilans, étape 2 : la page « Bilans » et son entrée sous « Gérer » (Hubperso#543)**

- **Entrée « Bilans »** sous « Gérer » (`lib/navigation.ts`, icône `bilans`), donc dans « Plus » au téléphone ; propriétaire seul (un invité ne la voit pas), la barre du bas la range sous « Plus ».
- **`/bilans`** (`app/bilans/page.tsx`, `exigerProprietaire`) : `components/BilansVue.tsx` lit `/api/bilans` avec la session et montre le bilan du jour ou de la semaine (onglets), les précédents à relire, dans un cadre isolé (`SANDBOX_BILAN`, jamais inséré dans la page). Aucune relecture automatique : un bilan se dépose une fois par jour, « Actualiser » suffit.
- **États honnêtes** (`lib/bilansVue.ts`) : « Aucun bilan du jour pour l'instant » si le dossier est vide ; une phrase par échec (droit Drive manquant : reconnecte-toi ; dossier non branché ; Google ne répond pas) ; une réponse hors contrat n'est jamais réparée.
- **Dossier** : « Bilans » (id dans `lib/bilans.ts`, privé : l'identifiant ne donne aucun accès) ; `BILANS_DRIVE_FOLDER_ID` le remplace, rien à poser sur Vercel.
- **Reste** : la routine qui écrit les bilans dans Drive (`bilan-jour-AAAA-MM-JJ.html`, `bilan-semaine-AAAA-MM-JJ.html`) et ne notifie plus que l'urgent, `BILANS_DRIVE_FOLDER_ID` dans Vercel, la reconnexion de Marc, puis la preuve en production.

## 🟦 Session 2026-10-28 — **Onglet Bilans, étape 1 : le hub lit les bilans gardés dans Drive (Hubperso#578, pour #543)**

Marc, 28/10/2026 : les bilans (Brief du jour, rapport hebdo) se gardent dans Drive ; le hub les lit en direct.
- **`GET /api/bilans`** (60 jours et 12 semaines au plus) et **`GET /api/bilans/<id>`** : propriétaire seul (404 invité, 401 sans session, 409 sans droit Drive, 502 si Google ne répond pas), `no-store`. Noms reconnus : `bilan-jour-` / `bilan-semaine-AAAA-MM-JJ.html`, dans UN dossier.
- **Jeton** (`lib/jetonDrive.ts`) lu dans le cookie de session, jamais hors de la route ; lecture bornée au dossier (`lib/bilansDrive.ts`) ; document servi en bac à sable sans réseau. Rien dans le dépôt ni en base (public). **Reste** : la page (#543), la routine, la variable (geste de Marc).

## 🟦 Session 2026-10-28 — **Portées Google : la lecture de Drive entre dans la connexion partagée (Hubperso#575, pour l'onglet Bilans #543)**

Marc, 28/10/2026 (« le hub lit Drive en direct », puis « Oui, 4 apps quand même » après avoir lu l'avertissement) : le hub doit lire les bilans que la routine range dans Drive.
- **`lib/jetonsGoogle.ts`** : `PORTEE_DRIVE_LECTURE` (`drive.readonly`, lecture seule) ajoutée à `PORTEES_GOOGLE`. Le fichier doit rester **identique dans JobAI, CarAI et BatchChef** (cookie partagé : la dernière app connectée décide du jeton) ; ces trois dépôts reçoivent la même modification.
- **`/confidentialite`** dit la lecture seule de Drive (test `pagesPubliques` : page = portées réellement demandées). ADR 0001 amendé (28/10) ; `docs/CONNEXION-UNIQUE.md` mis à jour.
- **Coût assumé** : portée restreinte, donc écran « application non vérifiée » possible, et jeton mort au bout de 7 jours si l'écran de consentement est en mode Test [À vérifier]. Les sessions ouvertes n'ont pas le droit : une reconnexion par app.
- **Reste** (#543) : le lecteur de dossier Drive, la route, la page « Bilans », puis la routine qui écrit dans Drive.

## 🟦 Session 2026-10-28 — **Gantt du Chantier : la barre montre l'état au fil du temps (Hubperso#572)**

Demande de Marc : la barre d'une tâche, d'une mission et d'un chantier change de couleur selon son état, du début à la fin, avec plusieurs segments bleus si le travail reprend.
- **Source** : `et` du relevé (historique d'états daté par tâche, présent sur 755 tâches sur 897 au 28/10/2026) ; une tâche sans `et` garde sa barre d'avant. Rien n'est inventé : pas d'historique, pas de segments.
- **Code** (`chantier/cadre.html`, servi tel quel) : `etatsOf` découpe la barre en segments `.gl2.et-<état>` ; `agregOf` fait de même pour un parent en prenant, à chaque instant, l'état le plus « actif » de ses tâches (travaille > à rouvrir > à toi > attend > à prouver > rien ne travaille). Une borne verte termine une tâche ou une mission fermée. Les lignes « dépôt » gardent leurs lignes de concurrence. La prévision reste hachurée.
- **Légende** : section « Couleur d'une barre, à chaque instant » (8 pastilles).
- **Suite (Marc, 28/10 13 h 46 Z : « pas pour missions, chantiers et projets », « parfois la barre est plus grosse »)** : les lignes de projet (app) prennent aussi l'état de toutes leurs tâches ; le travail MESURÉ (`work`, plages de modifications de la PR) compte comme « en cours » (bleu) même si l'étiquette dit autre chose (`fondre`, `travailDe`, `etapesTravail`) ; les blocs `gbk` (hauteur selon le parallèle, d'où la barre « plus grosse ») ne sont plus dessinés quand une barre a un historique, sauf le PRÉVU du projet ; une seule épaisseur de 12 px. Sans `et`, la barre d'avant reste.
- **Vérifié** : harnais Playwright avec le vrai relevé (3 niveaux : chantier 25, mission 65, tâche 115 lignes colorées). Pas de test unitaire du rendu : le cadre n'a pas de test DOM (voir `tests/chantierCadre.test.ts`).
- **Quotas (Hubperso#586, 28/10/2026, demande de Marc : « quota, plus optimal, rapide à comprendre, simple et propre »)** : la bande Ressources de l'Accueil (`rings()` dans `chantier/cadre.html`) est une liste `.qlist` d'une ligne par ressource : nom, barre avec le repère « là où on devrait être » (`.qbar`), valeur, une phrase (`quotaPhrase`). Tri du plus urgent au plus calme (`QORD`), Copilot à part (part des fusions, jamais un quota), clic = même tiroir de détail (`data-qd`). Les courbes « réel contre rythme » sont repliées dessous (`.qmore`). Aucune donnée nouvelle, aucun chiffre inventé ; cibles ≥ 44 px. Testé par chaînes (`tests/chantierCadre.test.ts`) et lu dans un navigateur avec le relevé du 27/10.
- **Tâches jamais commencées (Hubperso#589, constat du PC avec la session de Marc, 28/10/2026 10 h 08, zoom 7 j)** : une tâche sans début de travail (ni PR ni modification) qui attend Marc, une preuve ou un blocage n'avait aucune barre, seulement un texte, alors que sa mission était colorée. `etapesOf` part maintenant du premier état étiqueté (`et[0]`) quand `start` est nul : rien n'est inventé avant, et une tâche sans `et` n'a toujours pas de barre (17 des 59 tâches ouvertes sans début en ont un dans le relevé du 27/10). Les missions et chantiers en tiennent compte (orange « attend ton geste » au lieu de gris).
- **Projection de quota trop tôt (Hubperso#592, constat du PC, 28/10/2026)** : Claude semaine affichait « 366 % à ce rythme » deux heures après la remise à zéro (5 % utilisés ÷ 1,2 % de la période). `jaugeQ` ne projette plus tant que moins de 10 % de la période est écoulée (`proj` nul) ; la ligne dit « début de période : trop tôt pour projeter » et le tiroir « trop tôt : moins de 10 % de la période écoulée ». Un dépassement réel reste signalé tout de suite.
- **Le Gantt ne se recharge plus en changeant de page (Hubperso#596, demande de Marc, 28/10/2026)** : le cadre était dans la page `/chantier` ; la quitter le détruisait et y revenir rechargeait document et relevé, Gantt remis à zéro (le cadre isolé n'a pas de stockage). Il est maintenant monté dans la mise en page : `components/ChantierPersistant.tsx`, rendu par `Cadre` (`components/Navigation.tsx`) seulement pour le propriétaire (entrée « Chantier »), à la PREMIÈRE visite de `/chantier` (les autres pages ne paient ni document ni relevé). Hors de `/chantier` il reste en place, caché (`.chantier-cadre--cache`), et ne lit plus rien ; au retour une lecture tout de suite, et `/chantier?onglet=couts` change l'onglet par le canal (`chantier-onglet` → `window.surOnglet`), jamais par un nouveau `src`. `app/chantier/page.tsx` ne fait plus que garder l'accès (rend `null`) ; `loading.tsx` retiré (il aurait affiché « Chargement… » au-dessus du cadre). Mesure du PC avant correction : le zoom, le glisser et le dépliage reconstruisent la vue (13 ms replié, ~320 ms avec 900 lignes dépliées) — non traité ici.
- **Clic droit dans le cadre (Hubperso#610, demande de Marc via le fil Assistant, 28/10/2026)** : le hub ne voit pas ce qui se passe dans le cadre isolé ; `chantier/cadre.html` écoute `contextmenu` (capture ; Maj et champs de saisie laissent le menu du navigateur) et l'appui long tactile de 650 ms sans mouvement de plus de 8 px, puis poste `{type:"chantier-clic-droit", x, y, genre, texte}` dans son canal (`MESSAGE_CLIC_DROIT`, `lib/chantierCadre.ts` ; `genre` = « une barre du Gantt », « une ligne du Gantt », « une carte de tâche »…, `texte` = texte visible du bloc coupé à 300 caractères, coordonnées DANS le cadre). Le menu du navigateur n'est écarté que si le message est parti (`window.hubClicDroit` faux sans hub). La réception côté hub (`ChantierCadre.tsx`) est du ressort du fil Assistant.
- **Onglet Vitesse (Hubperso#613, demande de Marc, 28/10/2026)** : la rapidité des PR et des tâches, par acteur, dans le style du reste (formes et chiffres, presque pas de texte). `vVitesseM` (`chantier/cadre.html`) : une carte par acteur (Claude, Jules, Copilot, Robots, Autres : PR fusionnées, délai médian création→fusion, tâches finies, durée médiane début→acceptation, mini-cadence), un point par PR sur une échelle log de 1 min à 7 j (trait = médiane, rond = 9 PR sur 10 plus vite), les 8 PR les plus lentes, fusions par heure/jour par acteur, durée des tâches par acteur. Même sélecteur de période que le reste. Acteur d'une PR : `quiDe` (branche, auteur, Jules) ; d'une tâche : `acteurs` du relevé (le plus de commits), sinon Jules si la fiche le dit, sinon « Non attribué » (jamais deviné). Les couleurs viennent de `QUI`, partagé avec « Qui fusionne » de l'Accueil. `?onglet=vitesse` ouvre l'onglet ; l'ancien nom `vitesse` ne renvoie plus vers `rythme`.
- **La période commande toute la page (Hubperso#621, demande de Marc, 28/10/2026)** : 24 h / 7 j / 1 mois / 3 mois filtrent maintenant l'Accueil (tâches actives sur la période, briques éteintes sinon), Ressources (`quotaPer` : ce que chaque quota a bougé sur la période, ou sa fenêtre propre dite en clair), Coûts (`coutsPer` / `coutsSerie` : total, postes et cumul au jour près, barres au jour jusqu'à 1 mois, au mois sur 3 mois) et « Quand ça fusionne » (une rangée par heure sous 7 j). La barre de Vitesse passe de `.qbar` à `.qvb` : elle écrasait celle de Ressources. Quotas sans historique : « valeur du moment », jamais un delta inventé.
- **Vitesse et Parcours en un seul onglet (Hubperso#625, demande de Marc, 28/10/2026 : « combine Parcours et Vitesse, plus de graphs »)** : l'onglet Vitesse porte aussi le trajet d'une tâche de l'idée à l'affichage dans l'app (`parcoursParts`, `parcoursOf`) : la médiane de bout en bout, six étapes avec le nombre de tâches et la médiane de chaque attente, une barre par tâche (attente, écriture, relecture, preuve) qui ouvre sa fiche. Graphes ajoutés : où va le temps par acteur et par app (`chPhases`), durée de bout en bout (`chBoutEnBout`), tâches en vol et entrées contre sorties (`chFlux`). Même période que le reste . Les instants viennent du relevé : un instant absent saute la phase, rien n'est estimé ; « dans l'app » = dès le relevé qui suit l'acceptation ; le déploiement n'est pas une étape (le relevé ne le lie pas à une tâche).
- **Chaque bloc dit d'où vient sa donnée, son âge et sa nature (Hubperso#640, demande de Marc, 28/10/2026 : « toutes ses données à jour régulièrement en live, je veux être certain que ce soit des vraies données »)** : `sources()` (`chantier/cadre.html`) est le registre : pour chaque source, sa nature (mesuré, calculé, saisi à la main, estimé), sa cadence promise et l'instant de sa dernière mise à jour lu dans le relevé (`quota.jauges.*.releve`, `api.data_as_of`, `api.cumul_as_of`, `prochaines.calcule_le`, `fiabilite.calcule_le`, l'arrivée des coûts des apps, le dernier reçu du registre). En retard au-delà de 1,5 cadence, périmée au-delà de 3 (ou quand le PC marque la jauge périmée), sauf là où la cadence réelle l'exige : la Semaine Claude passe une fois par heure (tâche Quota-Claude : en retard à 75 min, périmée à 2 h) et l'API des apps, ce mois, prend la date de l'app la plus ancienne (une app au repos garde sa date : en retard à 3 h, périmée à 6 h, seuils posés à la main faute d'historique mesuré) ; une source sans instant (taux 1,4305, électricité) est « fixe », jamais « à jour ». `band(…, ids)` et `ganttCtl` posent la pastille « il y a X · nature » (`fraisHTML`, mise à jour toutes les 20 s par `tickAgo`) ; chaque jauge de Ressources dit son âge ; le bloc « Données » en bas de l'Accueil (`vDonnees`) trace l'âge de chaque source. Le cadre relit déjà le relevé chaque minute (304 sans lecture en base, `INTERVALLE_MS`) et le hub se rafraîchit à 60 s : rien n'est changé côté Neon. Le taux USD→CAD est lu dans `quota.taux_usd_cad` (Banque du Canada, daté, borné entre 0,5 et 3) quand le relevé le porte, sinon le repli 1,4305 est dit fixe ; `cumul_as_of` est la mesure la plus ancienne des apps (une app figée le tire en arrière), dit comme tel. Plus de graphes tirés du relevé seulement : tâches ouvertes (âge, par app : `chAge`, `chOuvertesApp`) et consommation par jour de Actions, Vercel, Jules, Gemini (`chQuotaJours`, 7 jours de `quota.jours`). Le taux lu est écrit en clair dans l'en-tête de Coûts (`fxLigne`, « 1 $ US = … $ CA », daté, ou « fixe, estimé »), le chiffre du haut de l'Accueil porte sa pastille et les quotas par jour leur titre. La page se met à jour sans rechargement (demande de Marc, 28/10/2026) : un relevé qui arrive au cadre est lu tout de suite (`window.surReleve`, avant : jusqu'à 60 s de plus) ; le hub relit l'ETag du document du cadre par `HEAD /api/chantier/cadre` toutes les 5 min (`verifierVersion`, aucune lecture en base) et, si un déploiement l'a changé, prévient le cadre (`chantier-version-neuve`), qui se recharge quand la page est cachée ou inutilisée depuis 45 s, après avoir dit `chantier-recharge` au hub (qui accepte alors le canal du document neuf ; l'onglet reste dans l'adresse). Les coûts restent à 5 min. Reste côté PC/.github (pas ici) : le registre de reçus saisi à la main (dernier reçu le 24/10).

## 🟦 Session 2026-10-27 — **Page Chantier dans le hub, étape 4a : les boutons « À toi » déposent leur geste au hub, sans Drive (Hubperso#556)**

Avant, un clic (Fusionner, Fait, une réponse) déposait `reponse-<horodatage>.json` dans le dossier Drive `_Gantt` avec le connecteur Drive du lecteur ; le PC (`outils/gantt-pc/reponses.py`, MoKarade/.github) l'appliquait sur GitHub. Dans le cadre isolé il n'y a ni connecteur ni réseau : les boutons étaient des liens vers GitHub.
- **`POST /api/chantier/gestes`** (`app/api/chantier/gestes/route.ts`) : session, propriétaire seul (`AUTHORIZED_EMAIL`, 404 pour un invité), demande venue de NOTRE page (`Origin` = l'hôte du hub, sinon 403 : un geste peut fusionner une PR), 20 par minute et par client, corps ≤ 4 Ko, validé par `lib/chantierGestes.ts` (corps d'hier inchangé : `{v:1, id, ref, geste: fusionner|fait|reponse, texte, quand}`, tout champ inconnu = 422 avant toute écriture). 201 déposé, 200 si l'`id` était déjà là (un renvoi ne crée pas de seconde ligne), 503 si la base ne répond pas (jamais un « déposé » mensonger).
- **Table `chantier_gestes`** (migration `0004`, additive) : l'`id`, la référence, le geste, la phrase, l'heure du clic, l'heure de réception et `prise_le` (posée par le PC). Aucune donnée de relevé.
- **Cadre ↔ hub** : le hub répond « ok » avec `gestes: true` ; le cadre remet `{type:"chantier-geste", geste}` dans son canal, le hub dépose (`ChantierCadre`) et répond `{type, id, ok}`. Le cadre garde son état « armé → déposé → appliqué / refusé / lent » (le PC répond par `reponses` du relevé) ; le hub passe avant Drive, Drive reste le repli, GitHub sans l'un ni l'autre.
- **4b (Hubperso#556, 27/10/2026)** : `GET /api/chantier/gestes/pc` (les gestes pas encore pris, 50 au plus, du plus ancien au plus récent, dans le corps d'hier) et `POST` du même chemin avec `{ ids }` (accusé : pose `prise_le` une seule fois, rend les `pris`). Derrière `GANTT_SECRET` (Bearer, temps constant, 503 si absent, 401 si faux), HORS session : chemin exact laissé passer par `isPublicPath`, verrouillé par `tests/authGuard.test.ts` et `tests/gardePages.test.ts`. Lire ne marque rien : un PC qui plante relit les mêmes gestes.
- **Reste (4c)** dans MoKarade/.github : `reponses.py` lit ce GET (Drive en secours), applique sur GitHub, accuse par le POST, écrit les issues dans `reponses` du relevé. Sans lui, un clic reste « déposé » puis « lent », jamais « appliqué ».

## 🟦 Session 2026-10-26 (soir) — **Page Chantier dans le hub, étape 3 : la page Coûts du hub disparaît, ses infos entrent dans l'onglet Coûts du Chantier**

Marc, 26/10/2026 21 h 24 Z : « Dans le hub il y a normalement déjà une page pour le coût, je veux qu'elle soit enlevée et que ses infos soient rajoutées dans ce que tu fais. »
- **Retirés** : `app/couts/page.tsx` et `loading.tsx`, le CSS `.totaux*` (mort), l'icône « Coûts » de la navigation. `/couts` **redirige** (307, `next.config.mjs`) vers `/chantier?onglet=couts` : un favori ou un vieux lien arrive au bon endroit.
- **Reprises** : `GET /api/chantier/couts` (`app/api/chantier/couts/route.ts`, propriétaire seul : 401 sans session, 404 sinon, 429 au-delà de 6 par minute, `no-store`) lit les apps comme l'ancienne page (`fetchAllSummaries`, leurs jetons ne quittent pas le hub) et rend ce que `lib/chantierCouts.ts` met en forme : totaux PAR période (jamais fusionnés, la raison écrite), coût de chaque app (montant converti ET brut, devise), quotas (part du plafond, remise à zéro), apps sans coût nommées, apps hors ligne dites. `ChantierCadre` lit la route (à la présentation du cadre, puis toutes les 5 min onglet visible) et la poste par le canal (`chantier-couts`) ; le document (`vAppsHub` dans `chantier/cadre.html`) la peint en tête de l'onglet Coûts. Sans lecture : « En attente des coûts des apps… » ou la raison (session expirée, trop de lectures), jamais un total vide.
- **Navigation** : « Coûts » quitte « Vue » ; le propriétaire y trouve « **Chantier** » à la même place (barre du bas : Accueil, Attention, Chantier, Plus) ; « Gérer » = graphes et administration. Un invité a 3 entrées (la barre se partage en colonnes égales). Palette de commandes et menu LIA : « Coûts & quotas » pointent vers `/chantier?onglet=couts`. `?onglet=` (valeurs `mur`, `toi`, `gantt`, `couts`) devient le fragment de l'adresse du cadre ; une valeur inconnue est ignorée.
- **Décisions à connaître** : (1) un **invité du hub perd le détail des coûts** (la page était ouverte à tout accès au hub ; l'onglet est propriétaire seul) ; la carte « Coûts et quotas » de l'accueil reste pour lui, sans le lien « Voir le détail » ; (2) le registre des dépenses (reçus) reste **vide dans l'onglet** tant que le PC ne le transmet pas (clé `couts_manuels` du relevé, en attente de l'accord du coordinateur) : il vient après les coûts des apps, avec son message « pas encore transmis ».
- Tests : `chantierCouts` (règles d'honnêteté), `chantierCoutsRoute` (401, 404, aucun fetch d'app sans droit, 429, 200), `chantierCadreDom` (coûts postés, relus à 5 min, erreurs dites, onglet caché), `chantierCadre` (onglets validés, document), `navigation`, `composantsAffichage` (lien du propriétaire seulement), redirection dans `chantierCadreRoute`. Vérifié sur un vrai serveur avec une session fabriquée : `/couts` redirige, l'onglet Coûts affiche les coûts postés au bureau et au téléphone, la vraie route répond 200 `no-store`.

## 🟦 Session 2026-10-26 (soir) — **Page Chantier dans le hub, étape 2 : la page dans un cadre isolé (Hubperso#540)**

Marc, 26/10/2026 (« A, go ») : la page de suivi (accueil, à toi, Gantt, coûts) s'ouvre depuis le menu du hub, **servie telle quelle** (réécriture en React seulement plus tard et seulement si Marc le veut), propriétaire seul.
- **Entrée « Chantier »** sous « Gérer » (`lib/navigation.ts`, icône `chantier`), donc dans la feuille « Plus » au téléphone : la barre du bas garde ses 4 entrées. Un invité du hub ne la voit pas et reçoit 404 sur la page comme sur les routes.
- **Le document** : `chantier/cadre.html` (440 Ko, servi par `GET /api/chantier/cadre`, propriétaire seul, 401 sans session, 404 sinon). Il ne contient **aucune donnée** : ni relevé (`const EMBED = null`), ni registre des dépenses (reçus, prélèvements, montants personnels : tableaux vides, ils viendront du relevé, clé `couts_manuels`, produite sur le PC), ni adresse de courriel ; verrouillé par `tests/chantierCadre.test.ts` parce que ce dépôt est PUBLIC. Il n'a aucun accès réseau et tous ses liens s'ouvrent dans une autre fenêtre.
- **L'isolement** (`lib/chantierCadre.ts`) : `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox">` sans `allow-same-origin` (origine opaque : ni cookie du hub, ni lecture de ses pages), et la route pose sa propre CSP (`sandbox`, `default-src 'none'`, `connect-src 'none'`, `frame-ancestors 'self'`). La route est **exclue de la CSP globale** de `next.config.mjs` (qui interdit la mise en cadre ; deux CSP s'additionnent) et y porte son propre bloc d'en-têtes ; `outputFileTracingIncludes` embarque `chantier/cadre.html` avec la route. Le reste du hub garde `frame-ancestors 'none'` (testé).
- **Le relevé** : `components/ChantierCadre.tsx` (client) le lit avec la session (`/api/chantier/releve`, `If-None-Match` à la main, **304 sans lire la base**) toutes les 60 s onglet visible, aussitôt au retour sur l'onglet, et l'**écrit** dans un **canal** (`MessageChannel`) que le cadre lui a remis : jamais de `postMessage(…, "*")` (l'origine du cadre est opaque, un « * » livrerait le relevé à n'importe quel document qui occuperait la fenêtre ; le scan Semgrep du dépôt le refuse, et `tests/chantierCadre.test.ts` aussi). Le cadre nomme l'origine du hub (celle de sa propre adresse) quand il se présente, puis se représente chaque seconde avec un canal neuf jusqu'à recevoir « ok » (le hub peut n'écouter qu'après l'hydratation) ; le hub garde le premier canal reçu de SA fenêtre, origine `null`. Une absence (404) et une panne (500, 429, 503) sont dites au cadre en clair, jamais un relevé vide. Si le gzip n'a pas été décompressé en route, le hub le décompresse lui-même. `/chantier` ne lit **rien** en base.
- **Corrections dans la page** (états vides, constatés au premier essai sans registre) : « En attente du relevé… » tant que rien n'est arrivé, un mois inconnu ne plante plus, l'onglet Coûts dit « Le registre des dépenses n'est pas encore transmis au hub » au lieu d'inventer, le badge « à toi » ne cache plus le libellé de l'onglet actif au téléphone.
- Supprimés : `lib/chantier.ts` et `tests/chantier.test.ts` (l'ancienne page n'affichait que deux heures).
- Tests : `chantierCadre` (isolement, consignes, document sans donnée), `chantierCadreRoute` (401, 404, en-têtes, cache du fichier, `next.config.mjs`), `chantierCadreDom` (jsdom : canal reçu, 304, panne, onglet caché, seule la fenêtre du cadre est écoutée), `navigation`.
- **Reste à faire** : 3 = retirer la page `/couts` du hub et reprendre ses infos (totaux par période, coûts et quotas par app) dans l'onglet Coûts du Chantier (demande de Marc, 26/10 21 h 24 Z) ; boutons « À toi » sans Drive (écriture + côté PC) ; le PC doit ajouter `couts_manuels` au relevé (`outils/gantt-pc/build.py`, fil .github) : sans lui les graphes de dépenses restent vides. **Non vérifié** : la lecture avec la vraie session de Marc (essai local avec une session fabriquée et le relevé simulé : le cadre s'affiche et se remplit).

## 🟦 Session 2026-10-26 (soir) — **Page Chantier dans le hub, étape 1 : la route de lecture du relevé**

Marc, 26/10/2026 (« A, go ») : la page Chantier de l'artefact claude.ai vient dans un onglet du hub, **servie telle quelle dans un cadre isolé (iframe)** derrière la connexion du hub, réécriture en React seulement plus tard et seulement si Marc le veut. Plan : « Plan : page Chantier dans un onglet Hubperso » (document du projet). Cette PR est la première brique, **sans rien de visible**.
- `GET /api/chantier/releve` (`app/api/chantier/releve/route.ts`) : session, accès au hub, puis **propriétaire seul** ; sans session 401, invité du hub 404 (il n'apprend pas que la page existe), sans base 503, aucun relevé reçu 404 `aucun`, lecture qui échoue 500, limite 30/min. Rend le gzip du relevé **tel que le PC l'a envoyé** (`Content-Encoding: gzip`, `no-store`), avec `ETag` = heure de réception et les heures d'envoi et de réception en en-têtes. La route reste derrière le garde (`lib/authGuard.ts` inchangé : aucune exception de plus).
- **ETag, pour ne pas retélécharger** : `If-None-Match` connu → 304 sans corps, et le contenu (~430 Ko) n'est PAS relu en base : un en-tête de deux heures est lu à part (`lireEnteteGantt`). La réponse est `no-store`, donc le navigateur ne revalide pas seul : la page devra renvoyer `If-None-Match` à la main (étape 2).
- Logique pure : `lib/chantierReleve.ts` (ETag, comparaison, contrôle du gzip). Tests : `chantierReleve`, `chantierReleveRoute` (401, 404, 503, 304 sans relecture, 200 gzip relu, 500, 429), `ganttDb` (en-tête sans contenu), `gardePages`.
- **Reste à faire** (une PR chacune, plan du document) : 2 = la page et l'entrée « Chantier » sous « Gérer » (propriétaire seul ; au téléphone dans « Plus », la barre du bas garde 4 entrées) ; 3 = les boutons « À toi » (écriture + côté PC) ; la page ne doit PAS relire la base à chaque `router.refresh` du hub (15/60 s) : elle ne lit que l'en-tête, jamais le contenu. Le coût par fil est gardé en réserve, masqué pour l'instant.

## 🟦 Session 2026-10-28 — **lia-ui v0.42.2, une discussion fermée ailleurs reste fermée (Hubperso#565)**

Le hub épingle `@mokarade/lia-ui` v0.42.2 (sha pelé `9852596`), seul changement (`package.json`, lock). v0.42.1 ne rapprochait la discussion de l'onglet de celle de l'état partagé qu'à la première lecture, et seulement si la partagée était ouverte : une discussion fermée sur le hub était réécrasée par celle, plus ancienne, d'un onglet. v0.42.2 rapproche à chaque lecture (la plus récente gagne, fermée ailleurs = fermée ici) et écrit toujours la plus récente des deux. Rien à brancher côté app. Preuve : déploiement Vercel de production `READY` sur le commit fusionné, puis relevé du PC (lia-ui#144).

## 🟦 Session 2026-10-27 — **lia-ui v0.42.1, la discussion la plus récente l'emporte (Hubperso#562)**

Le hub épingle `@mokarade/lia-ui` v0.42.1 (sha pelé `b8967ec`), seul changement (`package.json`, lock). Au montage, la discussion de l'onglet était datée « maintenant » et passait devant celle de l'état partagé : une question posée sur le hub ne se retrouvait pas dans CarAI. v0.42.1 range le vrai instant avec la discussion de l'onglet, et la plus récente gagne à la première lecture de l'état. Rien à brancher côté app. Preuve : déploiement Vercel de production `READY` sur le commit fusionné, puis relevé du PC (lia-ui#140).

## 🟦 Session 2026-10-26 — **lia-ui v0.42.0 : la hauteur de la bulle se révèle en douceur (Hubperso#528)**

Pin de `@mokarade/lia-ui` de v0.41.1 à v0.42.0 (sha pelé `cff04f4`), seul changement (`package.json`, lock). La bulle de v0.41.1 restait dans l'écran mais changeait de hauteur d'un coup à chaque réponse. v0.42.0 découvre la hauteur gagnée en 280 ms depuis le bord fixe (`clip-path`), sans ombre coupée, et ne bouge rien avec `prefers-reduced-motion`. Rien à brancher côté hub. Preuve en production : déploiement `READY` sur le commit fusionné, bundle servi contenant `inset(-24px)` avec `animate`, puis mesure sur la page de connexion publique.

## 🟦 Session 2026-10-26 — **lia-ui v0.41.1 : la bulle ne dépasse plus de l'écran (Hubperso#522)**

Pin de `@mokarade/lia-ui` de v0.41.0 à v0.41.1 (sha pelé `90dc7e7`), seul changement (`package.json`, lock). Le relevé du PC sur v0.41.0 montrait la bulle hors écran à l'ouverture et à l'arrivée de la réponse (jusqu'à 118 px), puis un saut de 40 à 90 px. v0.41.1 place sans glisser quand la taille ou l'écran change (clavier, rotation) et, à côté de LIA dans la moitié basse de l'écran, garde le bord du bas fixe : la bulle grandit vers le haut. Rien à brancher côté hub. Preuve en production : déploiement `READY` sur le commit fusionné, bundle servi contenant `lia-ui__chat--glisse`, puis nouveau relevé du PC (bureau et téléphone) ; la tâche reste ouverte jusque-là.

## 🟦 Session 2026-10-26 — **lia-ui v0.41.0 : sources cliquables et chat en bulle lissée (Hubperso#517)**

Pin de `@mokarade/lia-ui` de v0.39.0 à v0.41.0 (sha pelé `4d0c6f9`), seul changement (`package.json`, lock ; le test de `liaEtatPartage` garde son titre v0.39.0, qui décrit la fonction livrée alors). v0.40.0 : les marques `[→lien]` et `[↗lien]` d'une réponse sortent du texte et deviennent une ligne « Sources » de petits liens (https, sans identifiants ; une marque invalide reste du texte). v0.41.0 : le chat ne se replace plus à chaque image, reste dans l'écran visible (clavier du téléphone compris), glisse vers sa place, ne bouge pas quand le texte arrive, journal collé en bas. Retours de Marc du 26/10 : « incompréhensible, trop de texte, pas de liens » et « clunky, ça bug quand ça sort de la page ». Rien à brancher côté hub. Preuve en production : déploiement `READY` sur le commit fusionné, bundle servi contenant `lia-ui__sources` et `lia-ui__chat--glisse`, puis relevé du PC (bureau et téléphone) ; la tâche reste ouverte jusque-là.

## 🟦 Session 2026-10-26 — **Coût Vercel du hub : moins d'invocations et de CPU (Hubperso#508)**

Marc a payé 220 $ de Vercel en octobre 2026. Mesure du fil Vercel (24 au 26/10) : le hub = 49 % du CPU actif et 57 % des invocations, invocations ×5 depuis le 24/10. Trois appels réguliers par onglet ouvert, tous réduits sans toucher à la logique : (1) `components/RefreshControls.tsx` : `router.refresh()` de l'accueil (rendu serveur + 6 lectures de `/hub/summary`) passe de 15 s à 60 s, onglet visible seulement ; le bouton « Rafraîchir » et le retour sur l'onglet restent instantanés ; (2) `components/LiaBoot.tsx` / `lib/liaPauseClient.ts` : la pause de LIA se relit toutes les 60 s (30 s avant) ET seulement onglet visible (avant : même caché, 2 880 par jour par onglet oublié) ; `VALIDITE_PAUSE_MS` reste 3 relectures (180 s) donc l'échec fermé est inchangé, un onglet caché qui n'a pas relu vaut « en pause » et le retour sur l'onglet relit aussitôt ; (3) `lib/etatHorsFond.ts` : l'état partagé de LIA (`GET /api/lia/etat`, qui appelle aussi MemoryAI), relu chaque minute par lia-ui même onglet caché, n'appelle plus le réseau onglet caché (dernière lecture rendue ; sans lecture gardée, une vraie lecture, jamais d'état inventé). Estimation [Probable] par onglet : visible ≈ 7 → 3 appels par minute côté hub, 24 → 6 chez les apps ; caché 3 → 0. Cette estimation vient du code, pas de la mesure : la mesure avant/après (Vercel > Usage par projet, cible ≥ 50 %) est la preuve de #508. Reste : `.github/workflows/releve.yml` (cron */30, 48 par jour, mineur), non touché. Historique (`INTERVALLE_RELEVE_MS`) : l'écriture reste espacée, rien à changer. Tests : `tests/etatHorsFond.test.ts` (nouveau), `composantsDom`, `composantsInteractifs`, `liaPauseClient`. Gate complet et portes verts.

## 🟦 Session 2026-10-26 — **lia-ui v0.39.0 : la discussion de LIA suit Marc d'une app à l'autre (Hubperso#505)**

Pin de `@mokarade/lia-ui` de v0.38.0 à v0.39.0 (sha pelé `54490566`) : `package.json`, lock, un test et le commentaire de `lib/liaEtatPartage.ts`. Marc (26/10) : « Oui, via MemoryAI » — la fin de la discussion de LIA est gardée avec l'état partagé et rouverte dans l'app suivante (moins de 30 min, jamais sur un champ où il écrit). `validerEtat`, importé du paquet, ne retire plus la clé `discussion` : le relais `/api/lia/etat` la laisse passer (≤ 20 messages de 600 caractères, 4 000 au total, fermée = sans texte, corps > 16 Ko = 413). Ce n'est plus un état « sans contenu de Marc » : le texte est une donnée, relayée sans être lue. Côté MemoryAI, la garde chiffrée de `discussion` est MemoryAI#263 (fil MemoryAI) ; tant qu'elle n'est pas livrée, MemoryAI (encore en v0.38.0) ne garde pas la clé et la discussion reste locale à chaque app. Preuve en production : déploiement `READY` sur le commit fusionné, bundle servi en v0.39.0 ; la preuve de bout en bout (hub → CarAI) attend CarAI#166.

## 🟦 Session 2026-10-24 — **lia-ui v0.38.0 : l'analyse dessinée par les nanobots (Hubperso#496)**

Pin de `@mokarade/lia-ui` de v0.37.2 à v0.38.0 (sha pelé `9faf1ac9`), seul changement (`package.json`, lock). v0.38.0 : les 100 nanobots dessinent eux-mêmes l'animation d'analyse (4 coins, ligne qui balaie, points qui s'allument) sur l'élément analysé, retour de Marc du 24/10. Gate local et portes verts, `/login` 200 en `next start`. Preuve en production : déploiement `READY` sur le commit fusionné, puis capture du PC après clic droit → « Explique-moi ça » ; la tâche reste ouverte jusque-là.

## 🟦 Session 2026-10-24 — **lia-ui v0.37.2 : nanobots seuls (Hubperso#493)**

Pin de `@mokarade/lia-ui` de v0.37.1 à v0.37.2 (sha pelé `5ab9a089`), seul changement (`package.json`, lock). Correctif « nanobots seuls » demandé par Marc. Gate local et portes verts, `/login` 200 en `next start`. Preuve en production : déploiement `READY` sur le commit fusionné, puis lecture du PC à l'écran ; la tâche reste ouverte jusque-là.

## 🟦 Session 2026-10-24 — **lia-ui v0.37.1 : la nouvelle LIA sur le hub (Hubperso#490)**

Pin de `@mokarade/lia-ui` de v0.34.0 à v0.37.1 (sha pelé `e3304e5d`), seul changement (`package.json`, lock). v0.37.1 : l'analyse ne répète plus l'écran, plus de cadre, popup hors de l'élément, chat plus grand, cadre subtil. Le déclencheur des demandes (`surMode`, #450, PR #479) reste dans sa PR. Gate local et portes verts, `/login` 200 en `next start`. Preuve en production : déploiement `READY` sur le commit fusionné, puis lecture du PC à l'écran ; la tâche reste ouverte jusque-là.

## 🟦 Session 2026-10-24 — **Jeton Sentry du hub révoqué, vrai DSN du hub et de JobAI, build de prise en compte**

Le jeton Sentry du hub est révoqué et remplacé par le vrai `SENTRY_DSN` du hub et de JobAI, et le `HUB_TOKEN` de JobAI est roté (autorisé par Marc le 24/10/2026, variables posées par le PC). Une variable Vercel ne s'applique qu'à un build neuf : la fusion de cette ligne le déclenche. Cette entrée remplace l'état « `SENTRY_DSN` n'est PAS posé dans Vercel » de la session du 16/10 (Hubperso#162). À vérifier après le déploiement `READY` : la lecture de `/api/hub/summary` de JobAI passe toujours.

## 🟦 Session 2026-10-24 — **lia-ui v0.34.0 : lien étiré corrigé, même version que les apps (Hubperso#476)**

Re-pin `@mokarade/lia-ui` v0.32.0 → v0.34.0 (`package.json` et lock d'accord ; `resolved` sur le sha pelé `6525ad47`). v0.33.0 apporte `surToucher`, v0.34.0 corrige le lien étiré `a.widget__detail` (un clic sur une carte désigne l'élément visé). Aucun code du hub touché : l'API utilisée (`demarrerLia`, `renderBlocks`, `basculerPause`, `etatHttp`) est inchangée. Vérifié : typecheck, lint, tests, build, portes verts ; `next start` donne `/login` 200 sans « window is not defined ». Reste : lecture en session de Marc (PC) du lien étiré et de `/api/lia/etat` (preuve de #476).

## 🟦 Session 2026-10-24 — **Les blocs de la réponse de LIA (courbe, jauge, chronologie…) s'affichent (Hubperso#360)**

La réponse de MemoryAI peut porter `blocks` (22 formes fermées, `commun/assistant/BLOCS-lia.md`) ; le hub les relayait déjà (`lib/liaAsk.ts`, `BLOCS_MAX`) mais `demarrerLia` n'avait pas de `renderBlocks` : LIA n'affichait que le texte. `components/LiaBoot.tsx` câble maintenant `renderBlocks: rendreBlocsHub` (`lib/liaBlocs.ts`), qui passe par `rendreBlocs` de `@mokarade/lia-ui/blocs` (déjà dans v0.32.0, rien à re-pinner). Porte du hub avant le rendu (`filtrerBlocs`, pure) : seuls les objets dont le `type` est l'une des formes du catalogue, 20 au plus, et `confirmation` RETIRÉE tant que le hub n'a pas de catalogue d'actions contre lequel vérifier `action.id` (BLOCS-lia.md : inconnue = ignorée, jamais exécutée sans le geste de Marc). Aucun `lienSource` (les sources restent des numéros) et aucun `onConfirmer`. La validation de chaque forme (nombres finis, `min < max`, largeur des lignes…) est celle de lia-ui, qui n'écrit que du texte : une forme qui ne tient pas n'est pas dessinée, le texte de la réponse reste. Écart assumé avec l'énoncé de la tâche (schéma Zod côté hub) : recopier les 22 schémas dans le hub dupliquerait MemoryAI et lia-ui, et la porte du hub garde ce que lui seul décide (catalogue, plafond, confirmation). Pièges lus en écrivant les tests : dans `courbe`, `x` est un LIBELLÉ (chaîne), pas un nombre ; `rendreBlocs` ne dessine rien (et n'injecte pas son style) sans bloc valide. `tests/liaBlocs.test.ts` (14 tests, rendu réel en jsdom) : jauge, courbe, chronologie avec leurs données ; type inconnu, non-objet, `confirmation`, plafond de 20 ; HTML dans un libellé ou un titre = texte, aucun gestionnaire `on…`, aucun lien de source ; câblage de `LiaBoot`. Reste à lire en production avec la session du propriétaire : une vraie réponse de LIA qui porte un bloc (le PC).

## 🟦 Session 2026-10-24 — **Pause générale, dernier point : LIA dit pourquoi elle écrit seule (Hubperso#313)**

« Fini quand » de #313 : « le message dit pourquoi il écrit ». Avant, une remarque (`rien`), une relance et un appel (`appeler`) disaient seulement le texte de la carte (« DriveAI ne répond plus. »), sans dire pourquoi LIA prenait la parole. `lib/liaParole.ts` : `RAISON_SIGNALEMENT` (« Je te signale : ») devant la remarque et l'appel, `RAISON_RAPPEL` (« Je te le rappelle : ») devant la relance ; le texte du problème reste celui de la carte, rien n'est inventé, et sans problème elle se tait comme avant. Inchangés volontairement : le salut (« Bonjour Marc. » est sa raison) et le constat demandé par Marc (« Analyser », il fixe une carte : c'est lui qui a regardé). Le cadre « Dernière analyse » garde le texte de la carte sans raison ajoutée. Tests : `tests/liaParole.test.ts`. État de #313 : interrupteur serveur #457, option `pause` et plafond de 120 par jour #461, bouton du menu #467 sont livrés ; restent à lire en production (PC, session propriétaire) la pause, le bouton et le 423, et la preuve dans une app pilote (BatchChef) que la pause arrête ses appels, hors de ce dépôt.

## 🟦 Session 2026-10-24 — **lia-ui v0.32.0 : le menu de LIA met en pause et la ramène (Hubperso#467, part de #313)**

`@mokarade/lia-ui` passe de v0.31.0 à v0.32.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 09781a1, vérifié par `git ls-remote` : `v0.32.0^{}`). Nouveau : l'option `basculerPause(enPause) => Promise<void>` ajoute « Mets-toi en pause » / « Reviens » au menu du CORPS de LIA (jamais à celui d'un élément). `components/LiaBoot.tsx` la branche sur `suiviPause.basculer` (`lib/liaPauseClient.ts`) : `ecrirePauseServeur` envoie `PUT /api/lia/pause` `{ "pause": voulue }` avec le cookie de session ; la promesse ne se résout que si le serveur renvoie 200 ET confirme la valeur demandée, et `pause()` rend alors cette valeur. ÉCHEC FERMÉ : 401, 403 (invité), 503, 413, corps hors contrat, réseau qui lève ou valeur confirmée différente = rejet, l'état reste celui d'avant et lia-ui dit « Je n'ai pas pu changer ma pause. ». Une relecture lancée avant le geste ne peut pas écraser l'état confirmé en rentrant après lui (compteur de gestes). Le vrai contrôle reste sur le serveur : `/api/lia/ask` rend 423 tant que la pause est posée. Tests : `tests/liaPauseClient.test.ts` (8 nouveaux). À lire par le PC, connecté en propriétaire : clic droit sur LIA, « Mets-toi en pause » ; `GET /api/lia/pause` rend `pause: true` ; `POST /api/lia/ask` rend 423 ; « Reviens » (ou `PUT {"pause":false}`) lève la pause : à remettre dans tous les cas, sinon LIA reste muette à l'écran.

## 🟦 Session 2026-10-24 — **Accueil : la phrase et les pastilles « à regarder » à la taille de la maquette (Hubperso#464)**

Écart B1 de `hubperso/design/ECART-MAQUETTE-HUB.md`. La phrase d'état (`.resume__phrase`, `app/globals.css`) passe de `clamp(1.9rem, 1.2rem + 3.4vw, 3.2rem)` sur 28 caractères à celle de la maquette (`.resume h2` de `assistant/src-maquette/page.html`) : `clamp(1.5rem, 2.8vw, 2.3rem)`, 26 caractères, interlettrage −.02em, interligne 1,2. Les pastilles (`.resume__points`) s'arrêtent à 620 px (`.regard`) au lieu de prendre toute la largeur. Rien d'autre ne change : le texte de la phrase est toujours calculé des états réels (`lib/resume.ts`), la pastille garde sa couleur de GRAVITÉ (plus honnête que la teinte de l'app de la maquette), « Analyser » et « Voir » gardent leurs 44 px. Verrou : `tests/ecartsMaquetteAccueil.test.ts` (les deux valeurs, échoue sur l'ancien CSS). Non touché, volontaire : la barre latérale (P1, décision de Marc du 23/10 : « barre latérale gardée »). À lire par le PC : à 1440 px la phrase ne dépasse pas 2,3 rem et les pastilles 620 px de large ; à 390 px, pas de défilement horizontal.

## 🟦 Session 2026-10-24 — **lia-ui v0.31.0 : la page branche l'option `pause` sur le serveur (Hubperso#461, part de #313)**

`@mokarade/lia-ui` passe de v0.30.0 à v0.31.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 83be958, vérifié par `git ls-remote`). Nouveau : `pause: () => boolean` (relue à chaque pas et avant chaque `ask`) et `plafondSpontaneesParJour`. Le hub branche `pause` sur `GET /api/lia/pause` (#457) par `lib/liaPauseClient.ts` : un suivi en mémoire relu au chargement, toutes les 30 s et au retour sur l'onglet. ÉCHEC FERMÉ : jamais lue, 401, 403, réseau en panne ou réponse hors contrat = en pause ; une lecture réussie reste crue 90 s. C'est le côté client : le vrai refus reste dans `/api/lia/ask` (423, sans appel à MemoryAI). `plafondSpontaneesParJour` vaut 120 (proposition du fil Assistant, 24/10/2026 : elle parle à peu près toutes les 27 s, 60 la couperait en une demi-heure ; c'est un garde-fou contre l'emballement, Marc peut descendre à 80 si elle est trop présente ; ses relances restent à 2 par jour, silence 22 h à 7 h). Aucun bouton n'écrit encore la pause (`PUT /api/lia/pause`). Vérifié avant de pousser : gate complet vert, tests du suivi et du câblage, `next start` : `/login` 200 sans « window is not defined ».

## 🟦 Session 2026-10-24 — **L'interrupteur de pause de LIA, vérifié par le serveur (Hubperso#457, part de #313)**

L'état « LIA en pause » vit maintenant sur le serveur du hub : table `lia_reglages` (une seule ligne, `id = 1`, un booléen et une date, aucune donnée de Marc ; migration additive `drizzle/0003`), `lib/liaPause.ts` (pur : corps `{ "pause": booléen }` strict, réponse 423) et `lib/liaPauseDb.ts` (I/O). `GET|PUT /api/lia/pause` : propriétaire seul, derrière le garde du hub (401 sans session, 403 invité). `POST /api/lia/ask` lit la pause juste après l'authentification et, si elle est posée, répond 423 `paused` SANS appeler MemoryAI, pour la page comme pour les apps. Échec fermé : pause illisible = 503, jamais « pas en pause » ; seule exception, aucune base configurée (rien n'a pu être posé). Reste (#313) : brancher l'option `pause` de lia-ui v0.31.0 sur cette route et le plafond de messages spontanés (`plafondSpontaneesParJour`), quand le tag existe ; aucun bouton n'écrit encore la pause. Preuve en production : `GET /api/lia/pause` sans session rend 401, `/login` 200 ; la lecture d'un 423 réel demande la session du propriétaire (PC).

## 🟦 Session 2026-10-24 — **lia-ui v0.30.0 (Hubperso#455)**

`@mokarade/lia-ui` passe de v0.29.0 à v0.30.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 26d9af2, vérifié par `git ls-remote` : `v0.30.0^{}`). Le changement est dans le paquet ; son README n'a pas de section v0.30.0 (le détail n'est donc pas lu ici). Le hub ne change pas de code. Vérifié avant de pousser : gate complet vert (typecheck, lint, 0 avertissement, tests, build, `npm run portes`) et `next start` : `/login` 200 sans « window is not defined ». Preuve en production : déploiement READY sur le SHA fusionné, puis `/login` 200.

## 🟦 Session 2026-10-24 — **Accueil : la frise des dernières 24 h par app (Hubperso#357)**

Nouvelle section sous les cartes, avant les coûts : par app, 48 plages de 30 minutes sur les 24 dernières heures, tirées des relevés du hub (un par app et par quart d'heure, `lib/historiqueDb.ts`). Module pur `lib/friseEtat.ts` (`friseApp`, `resumeFrise`, `libellePlage`), composant `components/FriseEtat.tsx`, branché dans `app/page.tsx` (`StreamedFrise`, qui n'attend que la lecture de l'historique, pas les réponses des apps). Quatre états : à jour, panne vue (injoignable, réponse invalide, contrat trop récent, comme `lib/bilanEtat.ts`), accès refusé (le hub n'est pas entré : à part), sans relevé. Rien n'est inventé : une plage sans relevé n'est jamais « à jour », une app sans historique le dit en toutes lettres, une plage dit « panne vue » (jamais une durée plus précise que la mesure), et « en retard » n'est PAS dessiné, parce que la table ne garde que l'état vu par le hub, pas le statut déclaré par l'app (le déduire de `dataAsOf` serait inventer un seuil). La couleur ne porte jamais seule : chaque état a sa forme (plein, hachuré, demi-hauteur, pointillé) et son mot (légende, résumé, survol, `aria-label`). Couleurs en variables du socle seulement. Captures 1440 et 390 px (données fictives, pas de débordement horizontal) : `/mnt/project-files/hubperso-357/`. Tests : `tests/friseEtat.test.ts` (17).

## 🟦 Session 2026-10-24 — **Clic droit sur un élément : le hub décrit ses blocs à LIA (Hubperso#359)**

lia-ui (≥ v0.26.0) ouvre déjà le menu à quatre entrées sur n'importe quel élément ; ce qui manquait, c'est que le hub dise à LIA ce qu'elle regarde. Nouveau module pur `lib/liaElement.ts` (`decrireElementHub`), branché dans `components/LiaBoot.tsx` par `elements.decrire` : le chiffre principal, la mesure, la courbe, l'alerte, la jauge de quota, le constat, l'état, le logo, le point à regarder, la phrase d'état, le bandeau, le bloc de coûts et la carte ont chacun leur genre en français, et l'app est nommée par son NOM (le titre de sa carte), non par son identifiant. Un détail qu'on ne sait pas nommer dans une carte (un mot du pied) garde la description précise de lia-ui, plus le nom de l'app. ⚠️ Le lien « Détail » recouvre toute la carte (`.widget__detail::after`) : un clic droit sur le corps d'une carte tombe sur lui, donc il est décrit comme la carte, jamais comme « un lien ». Le texte lu vient des apps, c'est une DONNÉE : `<` et `>` retirés, caractères de contrôle retirés, 300 caractères au plus, aucun lien ni attribut. La route `/api/lia/ask` ne change pas (ne journalise que le type d'erreur, répond `no-store` : verrouillé par test). Vérifié en navigateur sur les vrais composants (données fictives) : menu à 4 entrées, la question part avec « genre : la carte d'une app ; app : FinanceAI ; texte : … », zéro erreur de page. Découpé : noter la demande « Que peut-on changer ici ? » dans une liste visible, #450 (où la garder est à trancher avec le fil Assistant). Tests : `tests/liaElement.test.ts` (20, dont la non-injection).

## 🟦 Session 2026-10-24 — **Accueil : la phrase d'ensemble, le logo gris sans lecture, « Dernière analyse », « ce mois-ci » d'abord (Hubperso#358)**

Quatre écarts avec la maquette validée, tous calculés des états réels. (1) `lib/resume.ts` : la phrase dit combien d'apps vont bien puis nomme ce qui ne va pas, chacune avec son état (« Trois apps sont à jour. DriveAI ne répond plus et JobAI a du retard. ») ; une app « à jour » qui affiche une alerte grave n'est pas comptée ; au-delà de trois problèmes, un compte. (2) `sansLecture` (`lib/status.ts`) : injoignable, refusée, invalide, contrat trop récent, non branchée ou en construction = logo en pointillés gris (`data-lecture="aucune"`), même si le badge est rouge ; une app qui répond garde sa teinte. (3) `lib/constat.ts` : chaque carte porte un emplacement VIDE et caché ; seul le navigateur le remplit (`poserConstat`, `textContent`, jamais du HTML) quand LIA s'est rendue à la carte (« Analyser » ou carte regardée), avec l'heure du Québec ; sans visite, aucun cadre. (4) `lib/usage.ts` : « Ce mois-ci » avant le cumul, puis aujourd'hui, toujours un total par période (la page /couts suit le même ordre). Aucun plafond ni quota inventé. À lire par le PC : la phrase d'ensemble sur la prod, le cadre après un clic sur « Analyser », le logo d'une app injoignable.

## 🟦 Session 2026-10-24 — **lia-ui v0.29.0 : sa façon de penser (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.28.0 à v0.29.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé bc47819, vérifié par `git ls-remote`), v0.28.1 comprise. Le changement est dans le paquet : sa façon de penser. Le hub ne change pas de code. Vérifié avant de pousser : `tests/liaBootServeur.test.ts` (le module `LiaBoot` se charge sans `window`, comme le serveur) reste vert avec ce paquet, et le serveur de production local rend `/login` en 200. À lire par le PC : la façon de penser de LIA pendant une analyse.

## 🟦 Session 2026-10-24 — **lia-ui v0.28.0 : allure humaine, nanobots, cible exacte, souvenirs (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.26.0 à v0.28.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé ffea030, vérifié par `git ls-remote`), v0.27.0 comprise. Les changements sont dans le paquet : allure humaine, des nanobots qui analysent à la place du carré, la cible exacte du clic droit et les souvenirs. Le hub ne change pas de code. Vérifié avant de pousser : `tests/liaBootServeur.test.ts` (le module `LiaBoot` se charge sans `window`, comme le serveur) reste vert avec ce paquet, et le serveur de production local rend `/login` en 200. À lire par le PC : l'allure de LIA, les nanobots pendant l'analyse, le clic droit sur un élément précis.

## 🟦 Session 2026-10-24 — **lia-ui v0.26.0 : elle analyse l'élément cliqué, se pose sur les cartes, a des souvenirs (Hubperso#356)**

`@mokarade/lia-ui` passe de v0.23.1 à v0.26.0 (`package.json` et lock ensemble, `resolved` sur le commit pelé 129bb79, vérifié par `git ls-remote`), v0.24.0 et v0.25.0 comprises. Les changements sont dans le paquet : elle se pose sur les cartes (v0.24.0), garde des souvenirs sur plusieurs jours dans le navigateur (v0.25.0), analyse l'élément exact sur lequel Marc a fait un clic droit, et lancée elle file sans gravité (v0.26.0). Le hub ne change pas de code. Vérifié avant de pousser : `tests/liaBootServeur.test.ts` (le module `LiaBoot` se charge sans `window`, comme le serveur) reste vert avec ce paquet, et le serveur de production local rend `/login` en 200. À lire par le PC : le clic droit sur un élément précis, et la LIA qui se pose sur une carte.

## 🟦 Session 2026-10-24 — **Correctif : le rendu serveur retombait en 500 depuis l'état partagé (Hubperso#433)**

Cause : `etatHttp()` (lia-ui) lit `window.location` dès sa création, et `components/LiaBoot.tsx` l'appelait au chargement du module, qui est aussi évalué sur le serveur (layout racine). Depuis le déploiement de #437, `/login`, `/`, `/conditions` rendaient 500 (« ReferenceError: window is not defined », lu dans les journaux d'exécution et par `curl`). Correctif : `etat: typeof window === "undefined" ? undefined : etatHttp("/api/lia/etat")`. Nouveau verrou `tests/liaBootServeur.test.ts` : le module se charge sans `window`, comme le serveur (il échoue sur l'ancien code). Leçon : une option du paquet évaluée au chargement du module doit être sûre côté serveur ; la CI ne le voyait pas, aucune page n'est prérendue.

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

Routes avec LIA (toutes celles qui passent par le layout racine, `loading.tsx`, `error.tsx` et `not-found.tsx` compris) : `/`, `/attention`, `/graphes`, `/chantier`, `/administration`, `/app/[id]`, `/login`, `/sans-acces`, `/conditions`, `/confidentialite`. Sans LIA (pas d'écran) : `/api/*` et `/manifest.webmanifest`. Pas de `global-error.tsx` dans le hub (l'écran par défaut de Next s'affiche) : la couche est dans le body, la veille de 0,5 s de lia-ui la remet si Next remplace le document. Sur `/login`, `/sans-acces` et les pages légales, il n'y a pas de session : le chat répond « indisponible » (échec fermé de `ask`) et aucune carte n'alimente son humeur. À lire par le PC : une erreur de page forcée et un chargement lent, avec `.lia-ui` toujours visible. Verrous : `tests/liaHubMouvement.test.ts` (montage au chargement du module, jamais dans un effet, layout qui importe `LiaBoot`).

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
