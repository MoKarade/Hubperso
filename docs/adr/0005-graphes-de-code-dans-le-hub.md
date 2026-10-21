# ADR 0005 — Voir les graphes de code de tous les dépôts dans le hub

- **Statut** : accepté (session Claude, 21/10/2026) — demande de Marc du 21/10/2026 ; le jeton de lecture reste un geste de Marc
- **Portée** : Hubperso (`lib/graphes.ts`, `lib/zip.ts`, `lib/grapheHtml.ts`, `app/graphes`, `app/api/graphes/[depot]`) et, côté dépôts, le workflow de publication du fil Graphify (`MoKarade/.github`)
- **Tâche** : Hubperso#265 (mission MoKarade/.github#327)

## Contexte

Les graphes de code (graphify) se construisent dans les fils et s'ouvrent en fichiers locaux. Marc veut les voir d'un seul endroit, à jour à chaque fusion, sans coût et sans donnée personnelle en ligne. Des dépôts sont privés (DriveAI).

## Décision

1. **Chaque dépôt publie un artefact GitHub Actions `graphe`** (`graph.html` + `meta.json`) à chaque push sur `main`, avec le `GITHUB_TOKEN` intégré : aucun secret par dépôt.
2. **Le hub LIT le dernier artefact** de chaque dépôt par l'API GitHub, avec UN jeton de lecture seule en variable serveur (`GITHUB_GRAPHES_TOKEN`), et garde le résultat en mémoire par identifiant d'artefact (immuable).
3. **Le contenu est non fiable** : servi en navigation de premier niveau avec `sandbox allow-scripts` (origine opaque), CSP fermée (`connect-src 'none'`), script `vis-network` auto-hébergé, propriétaire seul.

## Alternatives écartées

- **Branche `graphes` dans chaque dépôt** : un push hors `claude/*` déclenche un build Vercel (quota partagé entre les apps) et, chez BatchChef, `db:migrate` sur la base de production.
- **Le hub construit les graphes lui-même** : il faudrait cloner les dépôts privés et exécuter l'outil sur Vercel (jetons de lecture du code, durée, coût).
- **Servir `graph.html` dans une `<iframe>` de `/graphes`** : la CSP du hub interdit le cadrage (`frame-ancestors 'none'`) ; la navigation de premier niveau isole mieux et ne demande rien d'affaibli.
- **Garder `unpkg.com` dans la CSP** : ouvrir un hôte tiers pour tout le hub. Remplacé par une copie locale dont l'empreinte est vérifiée par un test.

## Conséquences

- Tant que le jeton n'est pas posé ou qu'aucun dépôt n'a publié, `/graphes` le dit (« non branché », « aucun graphe publié »), sans rien inventer.
- Un artefact expire (rétention du workflow, 90 jours) : l'état « expiré » est affiché ; la fusion suivante le renouvelle.
- Mettre à jour `vis-network` = remplacer la copie de `public/vendor/`, `VIS_VERSION` et `VIS_SRI` dans `lib/grapheHtml.ts` ; une version non prévue est refusée en attendant.
