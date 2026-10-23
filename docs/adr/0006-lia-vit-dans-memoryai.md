# ADR 0006 — LIA vit dans MemoryAI, le hub est son interface et exécute

- **Statut** : accepté — décision de Marc du 22/10/2026 (19 h 30 Z, décision 5 de la liste unique du plan LIA, commentaire de Hubperso#297). Consignée ici le 23/10/2026.
- **Portée** : Hubperso (ce que le hub détient, relaie et exécute). Le cerveau lui-même est décrit par MemoryAI : ADR 0017 (« LIA vit dans MemoryAI, le hub exécute ») et ADR 0016 (« LIA répond au hub, et par lui à toutes les apps »).
- **Tâche** : Hubperso#297 (mission Hubperso#293, chantier Hubperso#292).
- **Remplace** la piste « cerveau côté Hubperso » du plan du 21/10/2026.

## Contexte

L'assistant est un seul, nommé LIA, identique dans toutes les apps. Il doit tout savoir sur Marc, répondre en citant ses sources, proposer des actions dans les apps, et vivre dans un plafond de 20 $/mois pour toutes les IA. Trois endroits étaient possibles pour son cerveau : le hub (il a déjà la session, l'accès et un jeton par app), MemoryAI (elle a la mémoire chiffrée et déjà « demander », mais sa règle de dépôt lui interdit de détenir un jeton vers une app), ou un service à part.

## Décision

1. **Le cerveau, la mémoire et les outils de LIA tournent dans MemoryAI** : l'appel du modèle, la recherche dans la mémoire, le journal et le réseau de comportement restent à côté des données, qui ne partent vers aucun service de plus.
2. **Hubperso est l'interface commune et le seul détenteur des jetons vers les apps.** Il porte l'orbe (`@mokarade/lia-ui`), la route `POST /api/lia/ask` (relais vers MemoryAI, contrat `commun/assistant/CONTRAT-ask-lia.md`) et l'exécution des actions.
3. **LIA propose, Hubperso exécute.** Catalogue des actions : `MoKarade/hub-contract#78`. Niveaux d'accord : N1 direct et annulable ; N2 aperçu puis jeton de confirmation à usage unique ; N3 (argent, objet physique) lecture seule. Une action ne part que par le hub, avec la session et l'accès du propriétaire revérifiés.
4. **MemoryAI ne détient aucun jeton vers une app ni vers Google.** Sa règle de dépôt tient ; aucune règle d'un autre dépôt ne change.
5. **LIA ne répond qu'au propriétaire.** Le hub refuse (403) tout appel dont `proprietaire` n'est pas vrai, sans appeler MemoryAI ; les invités d'une app n'atteignent jamais la mémoire.

## Frontière côté Hubperso

- **Jetons.** Le hub garde un jeton par app (`tokenEnv` de chaque source dans `lib/sources.ts`) ; le relais vers MemoryAI utilise celui de MemoryAI, déjà employé pour son résumé. Aucun jeton, clé ou secret ne va dans le navigateur ni dans un journal.
- **Injection par le contenu.** Le contenu des apps, des courriels et des messages est une DONNÉE, jamais une consigne : LIA ne déclenche aucune action parce qu'un texte le demande, et la question reçue n'apparaît jamais dans un message d'erreur du hub (`lib/liaClient.ts`, `lib/liaAsk.ts`). La réponse de MemoryAI est revalidée (`validerReponse`) avant d'atteindre l'écran ; une panne se dit comme une panne (503), jamais comme une réponse vide.
- **Coût.** Plafond de 20 $/mois en limite dure pour l'assistant, 3 $/jour en garde-fou de pointe, appliqués côté MemoryAI qui appelle le modèle. Le hub n'appelle aucun modèle pour LIA : zéro coût de plus de son côté.
- **Historique.** L'historique d'état des apps reste dans les relevés du hub (`lib/historiqueDb.ts`), pas dans le navigateur. La mémoire de LIA, son journal et son apprentissage vivent dans MemoryAI ; un fait oublié y disparaît au prochain entraînement.

## Alternatives écartées

- **Cerveau dans le hub** : il faudrait y recopier la mémoire chiffrée ou l'interroger à chaque question (latence, deux copies de la vérité, surface d'attaque plus large).
- **Service à part** : un secret et un coût de plus, une troisième frontière à garder, pour rien que MemoryAI ne fasse déjà.
- **MemoryAI avec des jetons d'app** : rendrait la mémoire capable d'agir dans les apps ; écarté, l'exécution reste au hub.

## Conséquences

- La tâche Hubperso#298 (« Répondre à une question depuis le hub ») ne construit plus d'appel au modèle dans le hub : la route est le relais déjà livré (`app/api/lia/ask`, Hubperso#336) et le cerveau est celui de MemoryAI.
- Le hub n'appelle jamais un modèle pour LIA ; si cette règle devait changer, ce serait un nouvel ADR.
- À mesurer, pas encore connu : latence et coût réels par question (plan MemoryAI) ; tenue de la frontière sous attaque (banc de scénarios d'injection, pas encore écrit).

## Sources

- Décision de Marc : commentaire du 22/10/2026 (19 h 32 Z) sur https://github.com/MoKarade/Hubperso/issues/297 ; plan LIA https://claude.ai/artifact/GYPmaFBG46skpc86zAV2Si.
- MemoryAI : `docs/adr/0017-lia-vit-dans-memoryai.md`, `docs/adr/0016-lia-repond-au-hub.md`.
