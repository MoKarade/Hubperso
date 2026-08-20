# ADR 0002 — Le hub peut déclencher une action d'app (`kind: "trigger"`)

- **Statut** : accepté (session Claude, 20/08/2026) — à ratifier par Marc au premier usage réel
- **Portée** : Hubperso uniquement. Aucune app n'a à changer pour que le hub soit prêt.
- **Contrat** : `hub-contract` v1, champ `HubAction.kind` — déjà présent, jamais implémenté

## Contexte

Le contrat a toujours décrit deux sortes d'actions :

```ts
kind: z.enum(["link", "trigger"]),  // "trigger" = webhook POST (réservé v2, ne pas implémenter côté apps)
```

`link` marchait. `trigger` était une place réservée : le hub l'affichait grisé, avec
l'infobulle « Bientôt disponible ». Le champ `confirm` du contrat, prévu pour demander une
confirmation avant d'exécuter, ne servait à rien.

La demande est venue de l'inventaire d'intégration du 20/08 : le hub sait tout AFFICHER et
ne sait rien FAIRE. Relancer une campagne, lancer une projection, forcer une synchronisation
demandent d'ouvrir l'app, de s'y retrouver, et de cliquer là-bas ce qu'on regardait ici.

## Décision

**Le hub implémente `trigger`.** Un clic dans le widget déclenche un POST server-side vers
l'app, avec le `x-hub-token` de cette app.

Le geste traverse quatre verrous, dans cet ordre (`lib/declencher.ts`) :

1. **`safeHttpUrl`** — http(s) seulement. Le `z.string().url()` du contrat accepte
   `javascript:` et `file:` ; le hub ne les accepte pas.
2. **Publiée à l'instant** — l'href doit correspondre à une action `kind: "trigger"` d'un
   résumé **refetché live** (`fetchSummaryLive`, qui court-circuite le cache de résilience).
   Le formulaire est côté client, donc ses champs cachés sont réécrivables : le serveur ne
   leur fait aucune confiance et ne croit que ce que l'app vient de dire d'elle-même.
3. **Même origine que le `summaryUrl`** de la source.
4. **Aucune redirection suivie** (`redirect: "manual"`) — un 3xx est un refus.

**L'autorisation pose les DEUX questions du modèle d'accès** (ADR 0001) : `aAcces(…, APP_HUB)`
pour être dans le hub, puis `aAcces(…, source.id)` pour agir sur cette app-là. Voir les cinq
widgets est une chose ; en muter un en est une autre.

## Pourquoi

**Le verrou 3 est celui qui compte, et ce n'est pas le plus évident.** Le réflexe est de
s'arrêter au verrou 2 : « l'app a publié l'action, donc c'est légitime ». Mais c'est l'app
qui décide de ce qu'elle publie. Une app compromise — ou simplement boguée — qui publie
`href: "http://169.254.169.254/latest/meta-data/"` transforme le hub en **relais SSRF** : elle
atteint, à travers lui et depuis son réseau, une adresse qu'elle ne peut pas atteindre
elle-même, avec un jeton valide en main. Le verrou 3 ramène le pire cas à « le hub POSTe chez
l'app qui a demandé », c'est-à-dire à rien de plus que ce qu'elle peut déjà faire seule.

**Le verrou 4 n'est pas un détail de configuration.** Sans lui, le verrou 3 se contourne en
trois lignes : l'app publie un href chez elle, répond `302` vers l'adresse interne, et `fetch`
suit sans rien dire. Le mode d'échec est totalement silencieux — la requête part, réussit, et
rien à l'écran ne le raconte.

**Le refetch live plutôt que le cache** parce qu'un cache de résilience sert à AFFICHER, pas à
AUTORISER. `fetchSummary` peut resservir un résumé vieux de 30 minutes : une action retirée par
l'app resterait déclenchable une demi-heure après sa disparition, sur la foi d'un papier périmé.

## Trade-offs

- **Un POST de plus par clic** (le refetch d'autorisation). Assumé : une décision
  d'autorisation vaut un aller-retour.
- **Le hub n'est plus en lecture seule.** C'est le vrai coût. Il était jusqu'ici incapable, par
  construction, de rien casser chez une app — cette propriété est perdue, et c'est pour ça
  qu'elle est écrite ici plutôt que découverte plus tard.
- **Le DNS rebinding n'est pas couvert** : l'origine vérifiée pourrait résoudre vers une IP
  interne entre la vérification et le POST. S'en prémunir demanderait de résoudre et d'épingler
  l'IP soi-même, ce que `fetch` ne permet pas. Les origines admises sont des sous-domaines
  `hubperso.com` servis par Vercel. Dit plutôt que tu ne le saches pas.
- **Le corps de la réponse de l'app n'est jamais affiché**, seulement son code HTTP. Un contenu
  contrôlé par l'app n'a pas à être réfléchi dans le hub.

## Alternatives rejetées

**Une route `POST /api/declencher`** plutôt qu'une Server Action. Elle aurait demandé sa propre
protection CSRF, alors que les Server Actions de Next 15 vérifient déjà l'origine. Et elle aurait
créé une seconde manière de muter une app, à garder en parallèle de la première.

**Laisser le navigateur POSTer directement vers l'app.** Impossible sans exposer le
`x-hub-token` au client — ce que la §1 du `CLAUDE.md` interdit, et à raison : le jeton d'une app
donne accès à son résumé complet.

**Une liste blanche d'href écrite dans le hub.** Ç'aurait été rendre le hub spécifique aux apps,
contre le premier principe (« le hub ne connaît AUCUNE app en particulier »). Le contrat est la
liste blanche ; il suffit de ne croire que sa version fraîche.

## Conséquence immédiate : rien ne change

**Aucune app ne publie d'action `trigger` aujourd'hui** — le contrat leur disait de ne pas le
faire. Le hub est donc prêt et inerte : zéro bouton nouveau à l'écran tant qu'une app n'en
publie pas un. La première qui le fera sera un choix délibéré, app par app.
