# ADR 0006 — Chaque couleur du hub a un sens et un seul

- **Statut** : proposé (session Claude, 21/10/2026) — demande de Marc du 21/10/2026 : « chacune des couleurs a une signification et une utilité : soit la couleur de l'app, soit vert ; rouge c'est mal, etc., encore plus dans le détail ». À valider par Marc ; appliqué à la constellation de l'accueil (Hubperso#286), le reste de l'interface suit par tâches.
- **Portée** : Hubperso (`app/globals.css`, jetons `--ok --warn --danger --info --neutral --marque --text`), puis l'alignement des autres apps.

## Décision

Une couleur = un sens. Quand une couleur sert à autre chose que son sens, elle brouille la lecture.

| Couleur | Jeton | Sens | S'utilise pour | Jamais pour |
|---|---|---|---|---|
| **Couleur de l'app** | `--accent` (contrat de l'app) | L'IDENTITÉ de l'app : « c'est elle » | son logo, son fil et son paquet de lumière vers le cœur, son segment d'anneau, son nom de carte | dire que ça va ou que ça ne va pas |
| **Vert** | `--ok` | À JOUR, en bonne santé | la pastille ✓ d'une app qui répond avec des données fraîches ; un indicateur « ok » | décorer, ni une app dont le résumé vient du cache |
| **Ambre** | `--warn` | À SURVEILLER, en retard | app en retard ou en cache ; alerte « à surveiller » (satellite) ; quota proche (jamais rouge : pas de plafond dur) | une panne |
| **Rouge** | `--danger` | MAL : panne ou à régler | app qui ne répond pas (logo en tirets rouges, pastille !) ; alerte « à régler » | une simple information ; jamais de rouge « décoratif » |
| **Bleu** | `--info` | EN CONSTRUCTION ou information | app `building` (contour qui se trace) ; alerte d'information | un état de santé |
| **Gris** | `--neutral` | INCONNU : non branchée, pas encore lue | app sans jeton (« non configurée »), lecture en cours | ce qui est « éteint » volontairement mais connu |
| **Indigo de marque** | `--marque` | LE HUB lui-même (et plus tard son assistant) | le cœur, ses orbites et son faisceau, l'action principale | l'état d'une app |
| **Blanc cassé** | `--text`, `--text-soft` | RIEN : le décor et le texte | étoiles, filantes, noms | porter un sens d'état |

Règles qui en découlent :
1. **Le logo garde la couleur de l'app** à jour, en retard, en construction : l'état se lit alors à la FORME (plein et vif, plein et pâle, contour qui se trace) et à la pastille. Il ne change de couleur que pour dire « mal » (rouge, panne) ou « inconnu » (gris).
2. **L'état ne se lit jamais à la couleur seule** : chaque état a aussi sa forme et son pictogramme (accessibilité, critère 1.4.1).
3. **Le décor n'emprunte aucune couleur d'état** (verrou `tests/sensCouleurs.test.ts`) ; une pastille ne prend que sa couleur.
4. **Aucun état inventé** : une couleur d'état n'apparaît que si le contrat ou une lecture la justifie (`etatAstre`, `lib/astres.ts`).
5. Les couleurs d'app viennent du contrat (`app.color`) ; contraste mesuré sur `#07090D` : 7,3 à 13,2:1 pour les six apps déclarées au 21/10/2026. Une couleur d'app ne porte jamais de texte.

## Alternatives écartées

- **Colorer l'astre entier selon l'état** (vert/rouge) : on perd l'identité de l'app (plus personne ne sait laquelle est rouge), et on dépend de la couleur seule.
- **Un vert par app** : le vert est RÉSERVÉ à « à jour » ; une app dont l'identité est verte garde sa couleur sur le logo et sa pastille ✓ reste distincte par sa forme.

## À trancher avec Marc (plus de détail demandé)

- Faut-il une gradation de rouge (« à régler » vs « panne totale ») et d'ambre (« en retard de quelques minutes » vs « de plusieurs jours ») ? Proposition : non, une forme et un mot suffisent ; la gravité passe par le nombre de satellites.
- Couleur de l'assistant (cœur) : l'indigo de marque, ou une couleur propre ? Décision rattachée au fil Assistant.
- Le même tableau pour les graphiques et les coûts (aujourd'hui : ambre pour « surveillé », jamais rouge).
