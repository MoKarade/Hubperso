# ADR 0007 — Jeton d'accès pour la tuile Wear OS du hub

- **Statut** : proposé (session Claude, 24/10/2026) — à ratifier par Marc
- **Portée** : Hubperso et application Wear OS (Pixel Watch 5)
- **Contexte de référence** : Décision Hubperso#246 (Marc, 19/10/2026)

## Contexte

La décision Hubperso#246 du 19/10/2026 a retenu la création d'une tuile « résumé du hub » sur Pixel Watch 5 pour consulter rapidement l'état synthétique des applications de l'écosystème.

L'application de montre Wear OS doit pouvoir récupérer le résumé du hub via un appel réseau distant, mais la politique de sécurité globale interdit formellement d'y inclure le jeton maître `HUB_TOKEN` [Certain]. `HUB_TOKEN` est un secret d'infrastructure à privilèges élevés servant à authentifier le serveur ou les intégrations système et permettant des actions de mutation (`kind: "trigger"`) ou d'administration. Intégrer un tel secret dans un binaire exécutable ou un stockage local sur montre exposerait l'ensemble du hub en cas de décompilation de l'application ou d'accès physique à l'équipement [Certain].

Par ailleurs, les contraintes d'ergonomie et de connectivité d'une montre connectée (absence de navigateur web complet pour la mire OAuth Google, sessions courtes, accès réseau intermittent Wi-Fi/LTE/Bluetooth) imposent un mécanisme d'authentification autonome et sécurisé [Certain].

Le détail de la planification applicative globale des montres se trouve dans le document `commun/plans/2026-10-18_apps-montre.md` (document hors dépôt) [Certain].

## Options

Trois options d'architecture sont comparées pour permettre à l'application de montre de lire le résumé du hub sans exposer `HUB_TOKEN` :

### Option 1 : Jeton dédié, en lecture seule, révocable, propre à la montre

Le hub génère un jeton spécifique d'application (par exemple `WATCH_TOKEN`), associé à la montre enregistrée. Ce jeton est restreint aux seuls accès en lecture sur l'endpoint de résumé (`GET /api/hub/summary` ou une variante dédiée) [Certain].

- **Avantages** :
  - Périmètre d'accès strictement limité à la consultation des métriques (aucune possibilité de déclencher une action de mutation ou d'accéder à l'administration) [Certain].
  - Révocation granulaire possible à tout moment depuis la page `/administration` du hub sans impacter les autres jetons ou sessions [Certain].
  - Autonomie complète de la montre : rafraîchissement direct de la tuile en Wi-Fi ou LTE, même lorsque le téléphone est éteint ou hors de portée [Certain].
- **Inconvénients** :
  - Nécessite l'implémentation d'une table ou d'un registre des jetons de montre côté hub, ainsi qu'un mécanisme initial d'appairage ou de saisie du jeton [Probable].

### Option 2 : Relais par le téléphone (app compagnon Android)

L'application Wear OS n'effectue aucun appel HTTP direct vers les serveurs de Hubperso. Elle interroge l'application compagnon Android installée sur le smartphone via le canal local Wear OS Data Layer (`MessageClient` / `DataClient`). C'est le smartphone (bénéficiant de la session utilisateur authentifiée ou du cookie de session partagé `.hubperso.com`) qui requête le hub et transmet les données formatées à la montre [Certain].

- **Avantages** :
  - Aucun secret ni jeton n'est stocké sur la montre [Certain].
  - Aucune nouvelle route d'API ni gestion de jeton supplémentaire requise côté hub [Certain].
- **Inconvénients** :
  - Dépendance totale envers le téléphone : la tuile ne peut pas se rafraîchir si le téléphone est éteint, déchargé ou séparé de la montre [Certain].
  - Complexité de développement accrue : nécessite de créer, distribuer et maintenir une application compagnon Android dédiée en plus de l'application montre [Probable].

### Option 3 : Endpoint léger du hub ne rendant que des champs sans donnée sensible

Création d'une route API publique ou anonyme sur le hub (par exemple `GET /api/hub/tuile`), ne nécessitant aucun jeton d'authentification. L'endpoint retourne une structure minimale contenant uniquement des compteurs globaux et des états de santé (ex: nombre d'alertes, indicateurs vert/orange/rouge) sans aucune donnée confidentielle ou nominative [Certain].

- **Avantages** :
  - Complexité d'authentification nulle sur la montre [Certain].
  - Pas de gestion d'appairage ni de stockage de secret [Certain].
- **Inconvénients** :
  - Risque de fuite d'informations si une métrique sensible est ajoutée par inadvertance dans la réponse [Probable].
  - Contredit le principe du contrôle d'accès systématique du hub selon lequel toutes les routes renvoyant des données de l'écosystème doivent être authentifiées [Certain].

## Décision proposée

**Recommander l'Option 1 : Jeton dédié, en lecture seule, révocable, propre à la montre [Certain].**

Cette option garantit l'autonomie de la montre tout en respectant le principe du moindre privilège [Certain].

### Coûts financiers associés

- **0 $** pour installer et tester la tuile sur sa propre montre en mode développeur (via `adb` et déploiement direct) [Certain].
- **25 $** (frais uniques d'ouverture de compte développeur Google Play Console) pour publier l'application sur le Play Store [Certain], **jamais sans le oui écrit de Marc** [Certain].

## Conséquences

- **Sécurité renforcée** : La montre ne détient qu'un jeton à périmètre restreint en lecture seule. La perte ou le vol de la montre n'expose pas de pouvoir de modification sur l'écosystème [Certain].
- **Révocation simple** : En cas de besoin, le jeton de la montre peut être révoqué instantanément depuis l'interface d'administration de Hubperso sans interrompre le fonctionnement des autres applications [Certain].
- **Évolutivité** : Permet à la montre de mettre à jour la tuile de façon autonome en arrière-plan quel que soit son mode de connexion internet [Probable].

## Ce que Marc doit trancher

Avant d'engager tout travail de réalisation, les points suivants doivent être formellement validés par Marc :

1. **Choix de l'option d'architecture** : Valider l'Option 1 (jeton dédié en lecture seule propre à la montre) ou préférer l'Option 2 (relais par application compagnon smartphone).
2. **Mode de distribution et budget** : Confirmer l'installation directe en mode développeur à 0 $ pour un usage personnel, ou autoriser la dépense unique de 25 $ pour la publication Play Console.
3. **Ergonomie d'appairage** : Sélectionner le mode de transmission du jeton vers la montre (ex: affichage d'un QR code dans l'administration du hub à scanner via l'application Wear OS ou le téléphone).
4. **Politique d'expiration** : Définir si le jeton de montre a une durée de vie indéfinie (jusqu'à révocation manuelle) ou s'il doit être renouvelé périodiquement.
