# ADR 0005 — Voir les graphes de code de tous les dépôts dans le hub

- **Statut** : accepté (session Claude, 21/10/2026) — demande de Marc du 21/10/2026 ; le jeton de lecture reste un geste de Marc
- **Portée** : Hubperso (`lib/graphes.ts`, `lib/zip.ts`, `lib/grapheHtml.ts`, `app/graphes`, `app/api/graphes/[depot]`) et, côté dépôts, le workflow de publication du fil Graphify (`MoKarade/.github`)
- **Tâche** : Hubperso#265 (mission MoKarade/.github#327) ; complément 21/10/2026 : Hubperso#280 (vue 3D, ouverture sur place)

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

## Complément du 21/10/2026 : vue 3D, ouverture sur place (Hubperso#280)

Marc : « quand j'ouvre un graph je veux pas que ça ouvre une autre page », la vignette doit montrer le VRAI graphe, plus d'animations.

1. **Deux vues par la même route.** `GET /api/graphes/{id}?vue=2d` (défaut) rend le `graph.html` d'origine, toujours en bac à sable, avec un bouton « 3D » qui ramène à `/graphes#graphe-<id>`. `?vue=donnees` rend un JSON INERTE : `lib/grapheDonnees.ts` lit `RAW_NODES` / `RAW_EDGES` comme du JSON (jamais exécuté), borné (5 000 nœuds, 20 000 liens, textes de 200 caractères) ; un format inattendu rend 502 avec la cause. Mêmes contrôles d'accès que la 2D (401, 403 non-propriétaire, 404).
2. **Le visualiseur tourne dans l'origine du hub** (`public/graphes/vue3d.js` + 3d-force-graph 1.80.1 auto-hébergée, empreinte vérifiée), ce qui permet l'ouverture sur place sans `<iframe>` (alternative écartée plus haut, toujours vraie) et sans réseau supplémentaire. La confiance repose sur la donnée, pas sur le bac à sable : tout texte du dépôt est posé par `textContent`, les couleurs viennent du hub (dossier racine), jamais du dépôt ; `tests/grapheVue3d.test.ts` interdit `innerHTML`, `eval`, stockage, URL externe et tout appel réseau autre que `?vue=donnees`.
3. **Vignettes vivantes** : chaque carte prête monte un aperçu 3D du vrai graphe quand elle est visible (un contexte WebGL par carte visible, file de 450 ms, détruit hors écran). Sans WebGL, la constellation décorative reste.
4. **Ouverture sur place** : « Ouvrir » ouvre un plein écran dans `/graphes` (hash `#graphe-<id>`, lien direct possible, Échap / Fermer / retour du navigateur ferment). La 2D d'origine reste un lien secondaire (nouvel onglet).
5. **Branche par défaut** : chaque dépôt publie sur SA branche par défaut (`master` pour batchchef-) ; `lib/graphes.ts` (`brancheDe`) filtre l'artefact sur elle, avec test. Corrige batchchef- qui n'apparaissait jamais.

Risque connu : la 3D n'a été éprouvée qu'en rendu logiciel (swiftshader) ; sur GPU réel elle sera plus fluide. Au-delà de 5 000 nœuds, la vue 3D refuse et renvoie vers la 2D.
