# Copies du modèle auto-merge (Atelier)

Profil : prive

Généré par `node modeles/auto-merge/verifier-copies.mjs --ecrire-copies .` : ne pas modifier à la main. Chaque ligne atteste qu'une copie était FIDÈLE au modèle à la version indiquée ;
`node modeles/auto-merge/verifier-copies.mjs .` la revérifie contre le manifeste de l'Atelier.

| chemin | sha256 (fins de ligne LF) | version du modèle |
|---|---|---|
| modeles/auto-merge/autoMerge.mjs | 9f3bbdabdd3df99bb062f1395d3613c799f978ac1dc6bdb9f86ceac4961709d5 | 1.18.0 |
| modeles/auto-merge/autoMerge.d.mts | 3fa2cfa46d54612c19d5d780a015059e9bf15d0135441f2055c5e2098e43540a | 1.18.0 |
| modeles/auto-merge/chemins-interdits-base.json | ee2b611dc507134eb36f297f48f6e06dff02f1ab75b5295502f12ea94eff9327 | 1.18.0 |
| modeles/auto-merge/fusionner.mjs | fa9d5716e02e2d1ca877a1b27b11eee61e4d1fd0a50177b2eee084de2fec71dc | 1.18.0 |
| modeles/auto-merge/armer.mjs | e8d7d09a3a7b8c9363f1ab602bc9a11fedec2256f6c0eb9a47d3d867283eda2b | 1.18.0 |
| modeles/auto-merge/labels.mjs | 23b0585c4d8032d3b7ee1c224ce02ac9eddc818d0fd07916685452ece779df0c | 1.18.0 |
| modeles/auto-merge/codes-raison.mjs | 4ec6274146cb00cf038691ccdaa53417f557992a55e9ad1fbf8267ddffbe16c6 | 1.18.0 |
| modeles/auto-merge/verifier-copies.mjs | b343fdce74a01f7fcaf57f016651858b3c323d89a94231afc38db92fbcdb7ac4 | 1.18.0 |
| modeles/auto-merge/surblocage.mjs | b655cd6f0cfee5aaa9933af8cbc78fc04d949d23a628a6e6fc7137b398915f16 | 1.18.0 |
| scripts/hooks/commit-gate.mjs | 552f3bd3606231da551258c1f044a054b7ae1ba24294158125244973926cc78c | 1.18.0 |
| scripts/hooks/lib/analyseCommande.mjs | 7ce0f939fcd9c62126ac4001e3b330fb18dd84c4379f6fab89f3d63a14816b11 | 1.18.0 |
| modeles/auto-merge/LISEZMOI.md | c901443e400124514287496488a325cacb34d70814b29e5657037caf334b819c | 1.18.0 |
| .github/workflows/ci-reutilisable.yml | 3b0abb3d5a19101954bf54746d209f4ecbf1dad4f6ce703ebf20a6d9e56b18a8 | 1.18.0 |
| .github/ci/voie-rapide.mjs | 28f444bc96a1719d7156dd08d81e4511a856c624db42964f0c627058e33562be | 1.18.0 |
| .github/ci/verifier-longueur.mjs | be7a5d8779cec96d3967daca75539f4ec1dc12c244b6a85d4e44a5923f249f14 | 1.18.0 |
| .github/ci/generer-index.mjs | c37ef1d9a9f6b3db62b5e522e12c333a9bffea545f47ff68ed9c8c4b8363c58c | 1.18.0 |

Fichiers du kit NON copiés (retrait voulu du profil, raison déclarée) :
- .github/workflows/armement-auto-merge.yml : profil prive : pas d'auto-fusion native en dépôt privé Free (fusionner.mjs fusionne) ; un pull_request_target de plus coûterait des minutes sans rien armer
