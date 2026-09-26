# Copies du modèle auto-merge (Atelier)

Généré par `node modeles/auto-merge/verifier-copies.mjs --ecrire-copies .` : ne pas modifier à la main. Chaque ligne atteste qu'une copie était FIDÈLE au modèle à la version indiquée ;
`node modeles/auto-merge/verifier-copies.mjs .` la revérifie contre le manifeste de l'Atelier.

| chemin | sha256 (fins de ligne LF) | version du modèle |
|---|---|---|
| modeles/auto-merge/autoMerge.mjs | 49a15a70311a89341baeb90600eae2efb16c717be6efef29ce717a82e7384ee5 | 1.9.0 |
| modeles/auto-merge/autoMerge.d.mts | f8cd284186d1d51da4bc05fcf6b5b276228eb32e8ea6c26c658e5924d7e9f7b7 | 1.9.0 |
| modeles/auto-merge/chemins-interdits-base.json | ee2b611dc507134eb36f297f48f6e06dff02f1ab75b5295502f12ea94eff9327 | 1.9.0 |
| modeles/auto-merge/fusionner.mjs | 5fff63540802fe9f15afc26b68004d3ff978ff7425eb6fb7e9bcbc91c3bd2186 | 1.9.0 |
| modeles/auto-merge/armer.mjs | 46119ae1f787807bde310df46971f4d8f6c0633823f67c6e67892d16bc9e2902 | 1.9.0 |
| modeles/auto-merge/codes-raison.mjs | 4ec6274146cb00cf038691ccdaa53417f557992a55e9ad1fbf8267ddffbe16c6 | 1.9.0 |
| modeles/auto-merge/verifier-copies.mjs | e2cfa947a01de623476fe1fd9c23109056ac253594ef565cbed3b94cdfacda62 | 1.9.0 |
| modeles/auto-merge/surblocage.mjs | dff24d5293c6fec61566e914343b325b81e4daad14f2ededcc20806b86e3fcc5 | 1.9.0 |
| scripts/hooks/commit-gate.mjs | 6a92b89d9ac5b85cf0f4c1fdee4b3d3d212b7809924336788ac54519a6aa218d | 1.9.0 |
| scripts/hooks/lib/analyseCommande.mjs | 5dfb92bcee56522a7b896306deb6039a836097ea663f0ccb19289f48d5aa21d9 | 1.9.0 |
| .github/workflows/armement-auto-merge.yml | 455d424b79b2b4d102cf07fccf3a6bb226d5c4c06b6f1bdbc81c8dc76109b32c | 1.9.0 |
| modeles/auto-merge/LISEZMOI.md | a8ef4056b21eef407b45b34f269aece33e9194f1c556f3bb4afef6e16d576853 | 1.9.0 |
| .github/workflows/ci-reutilisable.yml | 3b0abb3d5a19101954bf54746d209f4ecbf1dad4f6ce703ebf20a6d9e56b18a8 | 1.9.0 |
| .github/ci/voie-rapide.mjs | 28f444bc96a1719d7156dd08d81e4511a856c624db42964f0c627058e33562be | 1.9.0 |
| .github/ci/verifier-longueur.mjs | be7a5d8779cec96d3967daca75539f4ec1dc12c244b6a85d4e44a5923f249f14 | 1.9.0 |
| .github/ci/generer-index.mjs | c37ef1d9a9f6b3db62b5e522e12c333a9bffea545f47ff68ed9c8c4b8363c58c | 1.9.0 |
## Écarts propres à Hubperso (un par un)

Les 16 fichiers ci-dessus sont des copies EXACTES. Ce qui suit n'est PAS comparé (adapté par dépôt) ou n'est pas repris :

1. `.github/workflows/auto-merge.yml` : copie ADAPTÉE de `gabarit-auto-merge-evenementiel.yml`. Écarts : `workflows: ["CI", "Doc à jour"]` (le gabarit dit `[ci]` ; sans « Doc à jour », une PR verte attendrait le cron) ; cron QUOTIDIEN `23 9 * * *` au lieu de toutes les 6 h (décision de Marc du 23/09/2026, quota Actions des dépôts privés).
2. `.github/auto-merge.json` : SANS `securite_login` (la PR de configuration de pole-securite l'ajoutera : d'ici là, les chemins sensibles restent bloqués). `controles_requis` = les 5 contrôles de la CI d'avant (Gate, Qualité, Sécurité, Audit, « La doc suit le code »), par leur nom exact ; `controles_non_bloquants` = `Vercel Agent Review`.
3. Chemins sensibles propres à Hubperso (venaient de `scripts/gardeChemins.mjs`, supprimé) : dans `chemins_label_validation` (attestables) `auth.ts`, `middleware.ts`, `lib/authGuard.ts`, `lib/gardeHub.ts`, `lib/sessionPartagee.ts`, `lib/jetonApp.ts`, `lib/jetonsGoogle.ts`, `app/api/**`, `vercel.json`, `next.config.mjs`, `drizzle/**`, `drizzle.config.ts`, `scripts/build-necessaire.sh` ; dans `chemins_interdits` `qualite/**` (cliquet : une PR ne réécrit pas ses seuils) ; plus les suggestions génériques du modèle.
4. `scripts/autoMerge.mjs`, `scripts/autoMerge.d.mts`, `scripts/gardeChemins.mjs` et leurs tests SUPPRIMÉS : le kit les remplace. Perte assumée : la neutralisation des échecs « quota » Vercel (`estUnQuota`, absente du kit par choix) : un statut Vercel en échec est maintenant un refus, sauf Agent Review (non bloquant).
5. `.github/workflows/armement-auto-merge.yml` : copie exacte mais INERTE en pratique : Hubperso est privé (GitHub Free), sans auto-fusion native ; le workflow doit être DÉSACTIVÉ (`gh workflow disable armement-auto-merge.yml`) pour ne pas coûter de minutes à chaque PR. À faire après fusion, par qui a le droit.
6. `.github/workflows/ci-reutilisable.yml`, `.github/ci/*`, `scripts/hooks/*` : copies exactes, NON câblées (aucun `uses:` vers elles, aucun hook dans `.claude/settings`). Elles servent l'étape de CI commune, plus tard.
7. `knip.json` : `modeles/**`, `.github/ci/**` et `scripts/hooks/**` exclus de l'analyse du code mort (copies du modèle, pas du code de l'app). Aucun seuil de `qualite/seuils.json` modifié.
8. `tests/kitAutoMerge.test.ts` (nouveau) : vérifie les empreintes de COPIES.md, la cohérence de `auto-merge.json` avec les vrais noms de jobs, les chemins sensibles, les déclencheurs du workflow. Les tests de la décision vivent dans l'Atelier.
