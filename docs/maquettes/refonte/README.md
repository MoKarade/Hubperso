# Maquettes de refonte Hubperso (style FinanceAI, thème sombre seul)

Maquettes HTML statiques, sans code d'app. **Décision de Marc (26/09) : thème sombre seul**, identique à FinanceAI. Référence : `docs/design/reference-style-financeai.md` (dépôt atelier). Statut : **à relire par pole-design puis à valider visuellement par Marc ; aucun code avant.**

Ouvrir `index.html` dans un navigateur (les polices Outfit / JetBrains Mono viennent de Google Fonts ; sans réseau, repli sur la police système).

| Écran | Fichier |
|---|---|
| Accueil : bento de widgets génériques + bandeau d'attention | `accueil.html` |
| Page d'une app (KPI, historique, alertes, détail, actions) | `app.html` |
| Attention | `attention.html` |
| Coûts et quotas (somme par période et par unité) | `couts.html` |
| Administration | `administration.html` |
| Connexion / sans accès | `login.html`, `sans-acces.html` |
| États honnêtes : à jour, cache, en retard, en construction, injoignable, non autorisée, invalide, contrat trop récent, non configurée, chargement, vide | `etats.html` |
| 360 / 768 / 1440 côte à côte | `apercu.html?e=accueil` |

Captures : `captures/<écran>-<360|768|1440>.png` (régénérées par `bash capturer.sh`, Chrome sans fenêtre). Les pages sont générées par `node generer.mjs` (le CSS est `maquette.css`).

## Ce qui est repris de FinanceAI
Fond `#07090D` uni, cartes en verre léger à bordure fine (à plat), argent `#E6EAF2` en accent principal, Outfit + JetBrains Mono, chiffres gras tabulaires, rayons 16 / 14 / 8, pastilles = fond 10 % + bordure + texte + icône + libellé, onglets pilule, focus visible en anneau argent, mouvement coupé sous `prefers-reduced-motion`. Navigation : barre latérale texte groupée (Vue / Apps / Gérer) ≥ 1024 px, barre du bas sous 1024 px.

## Ce qui reste propre à Hubperso
- **Accent secondaire proposé : « indigo brume » `#93A0FF`.** Discret : marque du menu actif, point de la marque, sur-titre de page. Jamais pour un état. Plus bleu que le violet `#8B5CF6` de FinanceAI, donc reconnaissable. Contraste 7,9:1 sur les cartes (mesuré) ; le violet `#8B5CF6` fait 4,50 (limite, sous 4,5 sur `#0E1014` en calcul exact) donc mauvais pour du petit texte.
- **Couleur d'app** (venue du contrat) : liseré haut de carte et avatar (avec `texteSur` `#0B0D12` dès qu'il y a du texte dessus). Les couleurs des maquettes sont des exemples ; celle de MemoryAI est du sable (`#D6C7A1`) pour ne pas ressembler à l'indigo. Un accent secondaire d'app = valeur mesurée ≥ 4,5:1 sur surface.
- **CHANGEMENT DE RÈGLE PROPOSÉ (à valider par Marc)** : le liseré haut d'une carte est TOUJOURS la couleur de l'app ; l'état passe par le badge, l'icône et l'encadré. Cela REMPLACE la règle actuelle « l'orange (`warn`) prend le liseré » de `CLAUDE.local.md` / `reference-claude`. Le rouge (`danger`) garde son écrasement (bordure + liseré). À répercuter dans ces documents seulement si Marc valide, au moment du code.
- **Boutons d'action** (« Lancer la synchro ») : tous en argent (bouton principal de la référence), plus de bouton dans la couleur de l'app.
- **Polices** : Google Fonts seulement en maquette. En code : auto-héberger (`@fontsource`), pas de CDN.
- **Règles du `CLAUDE.local.md` respectées** : cibles `var(--cible)` (44 px, 48 px sous 560 px) ; boutons pleine largeur sous 560 px ; seul le rouge écrase la couleur (bordure + liseré), l'orange ne prend que le liseré ; aucun `target="_blank"` ; totaux de coûts par période et par unité, jamais de total global.
- **États honnêtes** : chaque état = couleur + icône + libellé + phrase ; jamais un chiffre inventé (injoignable, non autorisée, invalide et en construction n'affichent aucune valeur ; « en cache » les grise et date le relevé).

## Contrastes (script `contrastes.py`)
16 paires de jetons + 6 couleurs d'app avec `texteSur` : toutes ≥ 4,5:1 (texte) ou ≥ 3:1 (graphique), 0 échec. Exemples : titre 18,2, corps 12,8, méta 7,4, bouton danger 4,83, pastilles 6,1 à 9,5, `texteSur` sur les couleurs d'app 7,1 à 12,9. Lancer `python contrastes.py` pour la liste complète.

## Données
Tout est exemple : bandeau « MAQUETTE » permanent en haut de chaque écran ; noms de personnes et adresses factices (`exemple.com`) ; aucun montant ni donnée réelle.

## Décisions pour Marc
1. Valider (ou non) l'accent secondaire indigo `#93A0FF` (recommandé) plutôt que le violet `#8B5CF6`.
2. Valider la navigation : barre latérale ≥ 1024 px, barre du bas 4 entrées (Accueil, Attention, Coûts, Plus) en dessous.
3. Valider le bento de l'accueil : 3 colonnes à 1440 px, le widget « héros » sur 2 colonnes.
4. Verre + flou : gardé ici ; à retirer sur mobile si Lighthouse mobile < 0,90 (mesure au moment du code).
