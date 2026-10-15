# Personal Data Hub — Master Plan exhaustif

Document de référence rédigé le 2026-04-28.
Objectif : tout planifier dans le détail, anticiper TOUS les soucis possibles, et avoir un contournement pour chacun.

**Comment lire ce document :** chaque phase liste les étapes concrètes, et pour chaque étape une table "soucis possibles → contournements". Les contournements sont par ordre de préférence (1 = on essaie ça d'abord).

**Documents complémentaires :**
- `01_risk_audit.md` = vue thématique des risques (sécurité, data loss, perf, etc.)
- `02_phasing.md` = phasing macro
- `03_repo_structure.md` = structure des repos
- Ce document = **chronologie détaillée + tous les soucis + workarounds**

---

# Table des matières

1. [Phase 0 — Foundations (semaine 1-2)](#phase-0)
2. [Phase 1 — Banque + IA basique (semaine 3-5)](#phase-1)
3. [Phase 2 — Localisation + app trajets (semaine 6-8)](#phase-2)
4. [Phase 3 — Emails + photos (semaine 9-12)](#phase-3)
5. [Phase 4 — App finance + agents pro-actifs (semaine 13-15)](#phase-4)
6. [Phase 5+ — Sources restantes](#phase-5)
7. [Risques transverses long terme](#transverse)
8. [Plan de contingence majeur](#contingence)

---

<a name="phase-0"></a>

# PHASE 0 — Foundations (semaine 1-2)

**But :** plomberie complète, hub accessible depuis l'extérieur, rien comme data réelle encore.

## 0.1 — Installer les outils Windows

**Étapes :**
1. `winget install Docker.DockerDesktop`
2. `winget install Ollama.Ollama`
3. `winget install Git.Git`
4. `winget install Cloudflare.cloudflared`
5. `winget install FiloSottile.age`
6. `winget install Mozilla.sops`
7. `winget install GitHub.cli`
8. Reboot pour activer WSL2 (requis par Docker Desktop)

| Soucis possibles | Contournement |
|---|---|
| WSL2 pas activé sur Windows | `wsl --install` puis reboot. Vérifier `wsl --status`. |
| Docker Desktop refuse de démarrer | Vérifier que la virtualisation est activée dans le BIOS (AMD-V / SVM). MSI X870 → BIOS > Advanced > CPU > SVM Mode = Enabled. |
| Hyper-V conflit avec virtualisation tierce (VirtualBox, VMware) | Désactiver Hyper-V si conflit, OU passer Docker Desktop en backend Hyper-V au lieu de WSL2. |
| Ollama ne détecte pas la GPU NVIDIA RTX 5080 | Mettre à jour les drivers NVIDIA Studio ou Game Ready à la dernière version. La 5080 est récente, certains drivers anciens ne la voient pas. Sinon : `nvidia-smi` doit afficher la carte. |
| `winget` lui-même cassé / pas dispo | Installer depuis l'App Store : "App Installer" by Microsoft. Sinon télécharger les .exe manuellement. |
| Anti-virus qui bloque les installeurs | Whitelister le dossier d'install. Désactiver temporairement si nécessaire. |

## 0.2 — Créer compte Cloudflare + tunnel

**Étapes :**
1. Créer compte gratuit sur cloudflare.com
2. Cloudflare Zero Trust Dashboard → activer (gratuit jusqu'à 50 users)
3. `cloudflared tunnel login`
4. `cloudflared tunnel create marc-hub`
5. Récupérer credentials JSON dans `~/.cloudflared/<UUID>.json`

| Soucis possibles | Contournement |
|---|---|
| Cloudflare demande une CB pour vérifier l'identité même sur free | C'est rare mais ça arrive ; utiliser une CB virtuelle (Revolut, Wise) ; OR fallback Tailscale Funnel (gratuit, sans CB). |
| Trouble créer le tunnel (problème API key) | Utiliser le dashboard web pour créer le tunnel à la place du CLI. |
| Tunnel qui drop les connexions | Vérifier le firewall Windows (autoriser cloudflared.exe). Vérifier la connexion internet (Wi-Fi 7 OK mais checkable). |
| Pas de domaine Cloudflare → tunnel marche en mode random subdomain | Utiliser les "Quick Tunnels" qui donnent une URL `*.trycloudflare.com` éphémère. Pour stable et gratuit : DuckDNS + tunnel pointe sur DuckDNS. |
| Quota gratuit dépassé (rare) | Vérifier sur le dashboard. Le free tier permet usage perso illimité tant que c'est pas du throughput géant. |

## 0.3 — Créer compte DuckDNS + sous-domaine

**Étapes :**
1. Aller sur duckdns.org, login avec Google
2. Créer un sous-domaine `marc-hub` → `marc-hub.duckdns.org`
3. Récupérer le token API
4. Configurer le client DuckDNS sur Windows (script PowerShell qui update IP toutes les 5 min OU le ducker container officiel)
5. Vérifier que `marc-hub.duckdns.org` résout vers ton IP publique

| Soucis possibles | Contournement |
|---|---|
| DuckDNS down / lent | Alternatives gratuites : freemyip.com, no-ip.com (CF email check 30j), nip.io, sslip.io. |
| ISP bloque le port 80/443 entrant (courant pour résidentiel) | Pas grave : Cloudflare Tunnel n'a PAS besoin de ports ouverts, il sort en outbound 443. C'est l'avantage. |
| IP publique change toutes les heures (CGNAT) | Pas grave avec Cloudflare Tunnel (pas besoin d'IP publique stable). DuckDNS sert juste de hostname pour Cloudflare DNS. |
| ISP fait du double NAT / CGNAT bloque tout | Toujours OK avec Cloudflare Tunnel. |
| DNS pas propagé après changement | Attendre 5-15 min. Test : `nslookup marc-hub.duckdns.org`. |

## 0.4 — Créer compte GitHub si pas existant + repos

**Étapes :**
1. `gh auth login` (browser flow)
2. Créer 5 repos privés via gh CLI :
   - hub-core, hub-deploy, hub-ingest, hub-frontend, hub-docs
3. Lancer `push_to_github.ps1` qui pousse hub-core et hub-deploy déjà scaffolés

| Soucis possibles | Contournement |
|---|---|
| Compte MoKarade existe déjà avec 2FA → SSH key conflict | Utiliser HTTPS au lieu de SSH (gh CLI le fait par défaut). |
| Quota repos privés free (GitHub free = illimité aujourd'hui) | OK, pas de limite. Si un jour ça change : self-host Gitea. |
| `gh auth login` rate-limited | Retry après 10 min. |
| Push échoue (pre-receive hook GitHub) | Vérifier qu'il n'y a pas de fichier > 100MB dans le commit. `.gitignore` le bloque normalement (raw_events/, exports/). |
| `secret scanning` GitHub détecte un truc et bloque le push | Le `.gitignore` exclut `.env` ; mais si jamais un token leaké : `git rm --cached <file>` + recommit. Régénérer le token leaké. |
| OneDrive sync conflict avec .git/ pendant init | Ne pas mettre les repos dans OneDrive. Les cloner dans `C:\hub\` (le SETUP.md le dit). Le scaffolding actuel dans Hub perso\repos est juste pour push initial, pas pour bosser dedans. |

## 0.5 — Lancer la stack en local pour la première fois

**Étapes :**
1. `cd C:\hub\hub-deploy` (après clone hors OneDrive)
2. `copy .env.example .env` + éditer
3. `.\scripts\setup_windows.ps1` (vérif + pull modèles Ollama)
4. `.\scripts\start_hub.ps1`
5. Tester `http://localhost:8000/v1/health`
6. Tester `http://localhost:8000/v1/ready` → DB OK + Ollama OK

| Soucis possibles | Contournement |
|---|---|
| Port 5432 (Postgres) déjà pris (autre Postgres installé) | Modifier `docker-compose.dev.yml` : `5432:5432` → `5433:5432`. Adapter `DATABASE_URL` dans `.env`. |
| Port 8000 (FastAPI) déjà pris | Idem : changer le mapping en 8080. |
| Port 11434 (Ollama) déjà pris | Ollama est déjà lancé en autre service ? Stopper l'autre ou changer. |
| Build hub-core échoue (deps Python) | Activer un VPN si réseau corp bloque pypi.org. Update pip à la dernière version. |
| Modèle Ollama pas téléchargé / corrompu | `ollama rm qwen2.5:14b-instruct` puis re-`pull`. |
| Ollama OOM (out of memory) | Avec 64 GB RAM tu n'auras pas ce souci. Mais si jamais : passer à `qwen2.5:7b-instruct` (plus petit). |
| `host.docker.internal` non résolu depuis le conteneur (rare sur Windows) | Vérifier que la directive `extra_hosts: ["host.docker.internal:host-gateway"]` est bien dans le compose. |
| Postgres ne démarre pas (volume corrompu d'un essai précédent) | `docker compose down -v` (DANGER : supprime la DB) puis `up -d` propre. |
| `pgvector` extension pas dispo (mauvaise image) | L'image `pgvector/pgvector:pg16` l'inclut nativement. Vérifier qu'on l'utilise bien (pas `postgres:16` standard). |
| FastAPI répond 500 sur `/v1/ready` | Lire les logs : `docker compose logs hub-core`. Souvent : DB pas joignable au démarrage → ajout de `depends_on: postgres: condition: service_healthy`. |
| GPU NVIDIA pas utilisée par Ollama → CPU only → super lent | `ollama serve` doit voir la GPU au lancement. Logs Ollama doivent dire "GPU detected". Si pas le cas : reboot, drivers à jour, vérifier `nvidia-smi`. |

## 0.6 — Configurer le tunnel Cloudflare → routing → Caddy

**Étapes :**
1. `cloudflared tunnel route dns marc-hub marc-hub.duckdns.org` (ou hostname Cloudflare)
2. Éditer `cloudflared/config.yml` avec UUID du tunnel
3. Lancer Caddy en conteneur Docker (port 80)
4. Lancer cloudflared → relie tunnel public à Caddy local
5. Tester depuis ton téléphone (4G, hors WiFi maison) : `https://marc-hub.duckdns.org/v1/health`

| Soucis possibles | Contournement |
|---|---|
| DNS de DuckDNS pas géré par Cloudflare → on ne peut pas faire `tunnel route dns` dessus | Utiliser le mode "Quick Tunnel" qui donne `xxx.trycloudflare.com` ; OU acheter un domaine 1$/an chez Porkbun/Namecheap (.xyz) et le pointer sur Cloudflare DNS. **Mais Marc veut 100% gratuit** → on reste sur quick tunnel avec URL qui change. Inconvénient : URL change à chaque redémarrage de cloudflared. |
| Quick Tunnel URL change → bookmark cassé | Écrire un cron qui notifie ntfy.sh à chaque démarrage avec la nouvelle URL. |
| Caddy ne reverse-proxy pas correctement | Vérifier les logs `docker compose logs caddy`. Souvent : nom de service mal écrit dans Caddyfile. |
| Cloudflare Access pas configuré → URL publique sans auth | **Critique sécurité**. Configurer Access AVANT de mettre des vraies données. Bloque le hub derrière Google login + MFA. |
| Latence élevée du tunnel | Mesurer : `curl -w "%{time_total}\n" https://...`. Cloudflare Tunnel est en moyenne 100-300ms d'overhead, OK pour usage perso. |

## 0.7 — Vault de secrets (age + sops)

**Étapes :**
1. `age-keygen -o $env:USERPROFILE\.age\hub.key`
2. Récupérer la public key
3. Créer `.sops.yaml` dans hub-deploy avec la public key
4. Backup de `hub.key` sur OneDrive ET clé USB (multi-supports)

| Soucis possibles | Contournement |
|---|---|
| Perte de la clé age | TOUS les secrets chiffrés deviennent illisibles → données récupérables depuis les sources mais credentials à régénérer. **Mitigation : backup multiple supports systématique.** |
| Sops mal configuré → re-encryption silencieuse à chaque save (mauvaise public key) | Vérifier `sops --decrypt` puis `sops --encrypt` round-trip avant de commit. |
| Marc oublie le password de la clé age | La clé age en elle-même n'a pas de password (sauf si on le rajoute). Donc pas d'oubli possible si la clé est sauvegardée. |
| Clé age leak via OneDrive (si autre device compromis) | Rotation : générer une nouvelle clé, ré-encrypter tous les secrets, supprimer l'ancienne. Aussi : envisager YubiKey pour stocker la clé en hardware. |

## 0.8 — Backup automatique

**Étapes :**
1. Configurer restic avec repository OneDrive (rclone) : `restic init --repo rclone:onedrive:backups/hub`
2. Cron Windows (Task Scheduler) : `restic backup` quotidien 4h du matin
3. Restic vérifie les backups : `restic check` hebdomadaire
4. Test de restore mensuel automatique (sur un dossier scratch)

| Soucis possibles | Contournement |
|---|---|
| OneDrive saturé (1TB plein) | Surveiller via script + ntfy push. Plan B : Backblaze B2 (6$/TB/mo, peu cher). |
| Restic password leaké | Stocker le password DANS le vault age. Ne jamais en clair. |
| Restic repo corrompu | Avoir 2 repos en parallèle (3-2-1) : OneDrive + disque externe local. |
| Backup qui prend trop de temps (gros volume photos) | Incrémentaux + déduplication restic. La photo de 5MB n'est ré-uploadée que si elle change. |
| Test de restore qui révèle un bug | C'est exactement pour ça qu'on teste. Mieux le découvrir maintenant que au moment d'en avoir besoin. |
| Disque externe qui meurt sans qu'on s'en rende compte | Healthcheck mensuel : compare hash de quelques fichiers test. Notif en cas de divergence. |

## 0.9 — Monitoring du hub par lui-même

**Étapes :**
1. Endpoint `/v1/admin/health-detail` qui scanne tous les composants (DB, Ollama, tunnel, backup)
2. Page UI "Santé du hub" (Phase 1+) qui affiche tout
3. Job cron quotidien qui appelle ce endpoint et notifie via ntfy si rouge

| Soucis possibles | Contournement |
|---|---|
| Le monitoring lui-même tombe en panne | Watchdog tier : un script PowerShell externe qui ping le hub toutes les 15 min, notif si rouge. |
| Faux positifs (network blip) | Retry 3x avec backoff avant d'alerter. |
| Logs qui remplissent le disque | Rotation des logs (logrotate via Docker driver `json-file` avec `max-size: 10m`, `max-files: 3`). |

## 0.10 — Critère de succès Phase 0

✅ Tu ouvres `https://marc-hub.duckdns.org` (ou URL trycloudflare) sur ton téléphone en 4G
✅ Tu te logges avec ton compte Google + MFA via Cloudflare Access
✅ Tu vois une page minimaliste qui dit "Hub OK · DB OK · Ollama OK · Backup yesterday 04:00"
✅ Tu peux faire `curl /v1/ai/ping` qui invoque Ollama et te répond "pong" ou similaire

---

<a name="phase-1"></a>

# PHASE 1 — Banque + IA basique (semaine 3-5)

**But :** première vraie source de data, première vraie utilité.

⚠ **Bloquant en attente** : Marc doit me dire comment son app Finance existante récupère ses données bancaires. Sans cette info, je ne peux pas finaliser le connecteur banque.

## 1.1 — Décider la méthode de récupération bancaire

**Options selon ce que fait l'app actuelle :**

### Si "exports CSV manuels"
**Étapes :**
1. UI hub : page "Importer des transactions"
2. Drop zone qui accepte CSV (formats Chase, BoA, Wells, etc. ou auto-detect)
3. Parser tolérant aux formats divers
4. Validation : preview avant import
5. Stockage en `raw_events/bank/<bank>/<date>.csv` + parsing en DB

| Soucis possibles | Contournement |
|---|---|
| Format CSV différent par banque, voire change dans le temps | Parser modulaire avec adaptateur par banque. Détection auto basée sur les headers. Si nouveau format : on rajoute un parser. |
| Doublons si tu importes 2 fois | Dedup via `(account, date, amount, description)` hash. Idempotent. |
| Transactions en attente / pending modifiées plus tard | Stocker l'état pending + état final, ne pas écraser. |
| Encodage CSV (UTF-8 vs Windows-1252) | Détection auto via chardet. |
| Friction d'avoir à exporter chaque mois | Notif mensuelle qui te rappelle. Long terme : automatiser via scraping si tu veux. |
| Tu oublies une banque | Système de "comptes attendus" : si pas d'import depuis X jours → alerte. |

### Si "scraping de portail" (méthode actuelle)
**Étapes :**
1. Reprendre le code existant (à voir quand tu pushes)
2. Refactor en service Python avec Playwright headless
3. Stockage credentials banque dans le vault age
4. Run quotidien

| Soucis possibles | Contournement |
|---|---|
| TOS de la banque interdit le scraping | Risque légal réel (tu peux te faire bloquer le compte si détecté). À évaluer banque par banque. |
| Banque change son DOM → scraper cassé | Test E2E quotidien qui détecte les régressions. Si cassé : alerte → tu fixes manuellement. |
| Banque ajoute MFA / SMS code à chaque login | Bloquant total. Workaround : jeton "remember device" stocké, mais souvent expire. Sinon : écran semi-manuel où tu rentres le code SMS. |
| Banque ajoute un CAPTCHA | Très problématique. Workaround : solveur (2captcha à 1$/1000) ou abandon → CSV. |
| Compte banque verrouillé pour activité suspecte | Récupération via banque (téléphone). Future ingestion via CSV en attendant. |
| Credentials banque leak | Vault age (pas de fichier .env en clair). 2FA actif. Rotation password possible. |

### Si "service tiers (Mint/YNAB/Quicken/etc.)"
**Étapes :**
1. Identifier le service exact
2. Voir s'il a une API publique
3. Si oui : utiliser
4. Si non : exports CSV depuis ce service

| Soucis possibles | Contournement |
|---|---|
| Mint mort (Intuit l'a tué fin 2024) | Si c'était Mint : transition vers YNAB ou Empower (gratuits). |
| Service tiers payant | À évaluer ; option CSV manuel toujours disponible en backup. |
| API rate limited | Cache + retry exponentiel. |
| Service tiers compromis | Hub a déjà historique en local. Continue de marcher en read-only sur historique. |

### Si "ne se souvient pas"
**Étapes :**
1. Marc va voir sur son autre PC
2. Pousse le code de l'app Finance
3. Je l'inspecte
4. On choisit la voie ci-dessus

## 1.2 — Modèle de données transactions

**Étapes :**
1. Schema SQLAlchemy : `account`, `transaction`, `category`, `merchant`, `tag`
2. Migration Alembic
3. Indexs : `(account_id, posted_at)`, full-text sur `description`
4. Vue matérialisée : `monthly_spending_by_category`

| Soucis possibles | Contournement |
|---|---|
| Schema qui change quand on découvre des cas non prévus (refunds, transfers, etc.) | Migrations Alembic pour chaque évol. Le store des raw_events permet de reconstruire si besoin. |
| Catégorisation auto fausse | Mode "review queue" : transactions ambiguës en attente de revue manuelle. |
| Devises multiples (USD/CAD/EUR) | Champ currency obligatoire + conversion via taux du jour (API gratuite : exchangerate-api.com). |
| Splits (1 transaction = plusieurs catégories) | Modèle "Allocation" : 1 transaction → N allocations qui sommes au montant total. |
| Compte joint avec autre personne | Pas dans Phase 1 (single user). Plus tard : flag "shared" + filtre par "to_me". |

## 1.3 — UI Finances v0

**Étapes :**
1. Page `/finances` : tableau filtrable des transactions
2. Cards "Total dépenses", "Solde", "Top catégories" (du mois)
3. Graphique stack par catégorie (recharts)
4. Recherche full-text dans description

| Soucis possibles | Contournement |
|---|---|
| Trop de transactions (10k+) → UI lente | Pagination serveur-side + virtualisation côté client (react-window). |
| Filtres complexes (date range + catégorie + montant) | URL queryparams pour partager / bookmark. |
| Mobile : tableau qui déborde | Vue card stackée sur mobile. |

## 1.4 — Recherche IA "combien j'ai dépensé en restos en mars ?"

**Étapes :**
1. Endpoint `/v1/ai/ask` qui prend une question en français
2. LLM (Qwen 2.5 14B) génère une SQL query depuis le schema connu
3. Execute la query (en read-only avec timeout)
4. LLM formule la réponse en français à partir du résultat

| Soucis possibles | Contournement |
|---|---|
| LLM génère SQL invalide / dangereuse | Validation : whitelist de tables, query parser pour interdire DELETE/UPDATE/etc. Connection en read-only. |
| LLM hallucine sur des colonnes inexistantes | Prompt système avec le schema exact. Few-shot examples. Si erreur : auto-correct loop max 3 tentatives. |
| Résultat mal interprété (mauvaise unité, mauvaise devise) | Inclure metadata dans la réponse (currency, date range, count). |
| Question ambiguë ("ce mois" = avril ou mois en cours ?) | LLM doit clarifier au lieu d'inventer. |
| Performance : LLM 14B prend 5-10s pour générer | OK pour usage perso. Streaming pour feedback rapide. |
| Question hors scope (ex: prédire avenir) | Refuser poliment, pas d'invention. |

## 1.5 — Détection d'anomalies

**Étapes :**
1. Job nocturne : compute statistics par catégorie sur 90 jours
2. Détecte : doublons (même montant même merchant ≤ 7j), pics (Z-score > 2), nouveaux abos (récurrent jamais vu)
3. Stocke dans table `insight`
4. UI : page "Insights pro-actifs"

| Soucis possibles | Contournement |
|---|---|
| Faux positifs (achat exceptionnel mais légitime) | Bouton "Pas une anomalie" qui apprend. |
| Cas particuliers (gros achat planifié vs anomalie) | UI pour "marquer comme planifié" en amont. |
| Algorithm trop sensible / pas assez sensible | Seuil configurable dans les settings du hub. |

## 1.6 — Notifications push ntfy.sh

**Étapes :**
1. Self-host ntfy via Docker (gratuit) OU utiliser ntfy.sh public (gratuit aussi)
2. Topic privé secret (tokens dans URL)
3. App ntfy installée sur ton Pixel 10 Pro
4. Hub poste sur le topic en cas d'anomalie

| Soucis possibles | Contournement |
|---|---|
| ntfy.sh public down | Self-host est trivial (1 conteneur). |
| Notif loupée si téléphone offline | ntfy retient les messages 12h par défaut, app les voit au reconnect. |
| Spam si bug détecte 100 anomalies | Rate limit côté hub (max 5 notif/jour). |
| Topic deviné par tiers | Topic = UUID + token complexes. HTTPS uniquement. |

## 1.7 — Critère de succès Phase 1

✅ Tu importes (CSV ou auto) tes vraies transactions du dernier mois
✅ Tu vois la page /finances avec graphiques et filtres
✅ Tu poses "combien j'ai dépensé en restos en mars ?" et tu obtiens une réponse précise
✅ Une notif push arrive si une anomalie est détectée
✅ Daily digest dans le hub te résume la journée

---

<a name="phase-2"></a>

# PHASE 2 — Localisation + ton app trajets (semaine 6-8)

## 2.1 — Setup Google Takeout pour la Timeline

**Étapes :**
1. Aller sur takeout.google.com
2. Sélectionner "Timeline"
3. Format JSON
4. Téléchargement → drop dans hub

| Soucis possibles | Contournement |
|---|---|
| Timeline désactivée (Google a ajouté cette option) | Activer dans Maps. Mais sans data historique. |
| Volume énorme (Timeline depuis 5 ans = des giga) | Streaming parser (jq/ijson) au lieu de tout charger. Stockage en raw_events compressé. |
| Format change tous les 6 mois (Google le fait souvent) | Parser modulaire + tests sur les formats connus. |
| Précision médiocre des points (drift GPS) | Filtrage : ignorer les points avec accuracy > 100m. |
| Pas d'export auto (Takeout c'est manuel) | Cron qui te rappelle. Long terme : Maps API n'a pas la Timeline. Donc CSV manuel ou scraping de la Timeline web (TOS gris). |

## 2.2 — Modèle de données location

**Étapes :**
1. Tables : `location_point`, `visit`, `activity_segment`, `place`
2. Index spatial PostGIS (ou simple lat/lng + index B-tree)
3. Materialized view "monthly_km_by_mode"

| Soucis possibles | Contournement |
|---|---|
| Volume points GPS énorme (100k/jour si tracking 1Hz) | Sample/agréger : 1 point / 30s suffit. |
| Privacy de tes proches qui apparaissent dans tes timelines | Hub privé. Mais si tu partages screenshots, blur les lieux sensibles. |
| Erreurs Google sur les "places" (invente des établissements) | Champ `confidence` + UI pour corriger. |

## 2.3 — Récupération de l'app trajets existante

**Étapes :**
1. Marc push l'app depuis l'autre PC sur GitHub (`MoKarade/app-trajets`)
2. Je clone et inspecte
3. Refactor pour consommer l'API du hub
4. Conteneurise (1 image par version)

| Soucis possibles | Contournement |
|---|---|
| Code spaghetti / pas commenté | Je le réécris si nécessaire. |
| Dépendances tordues (libs anciennes, vendor APIs deprecated) | Audit + upgrade. Si dépend de Google Earth Pro desktop : on garde la dépendance. |
| App liée à des fichiers hardcoded sur l'autre PC | Refactor pour API hub. |
| App utilise un service payant | Évaluer alternative gratuite. |

## 2.4 — Versioning multi-versions live

**Étapes :**
1. Caddy route `/apps/trajets/v1/*` → conteneur v1 sur port 8011
2. `/apps/trajets/v2/*` → conteneur v2 sur port 8012
3. UI hub : sidebar "Trajets" avec selector de version
4. Chaque version est un Docker image taggée

| Soucis possibles | Contournement |
|---|---|
| Schémas DB incompatibles entre v1 et v2 | API de données stable côté hub (versionnée elle aussi : /api/v1/locations). Apps ne touchent jamais la DB directement. |
| v1 et v2 écrivent en même temps → race condition | Une seule version "writeuse" (la dernière). Les autres en read-only. |
| Conteneurs qui consomment trop de RAM si 5 versions live | Limite RAM par conteneur dans compose. Auto-stop des versions inactives ≥ 1h. |
| User qui ne sait plus quelle version utiliser | UI claire : badge "live" sur la version courante, autres en grisé. |

## 2.5 — Critère de succès Phase 2

✅ Timeline Google ingéré, visible dans le hub avec carte
✅ Ton app trajets v1 (port originel) tourne dans le hub via iframe
✅ Ton app trajets v2 (refactor avec API hub) aussi
✅ Tu peux switcher entre les 2 dans l'UI
✅ Recherche IA "où étais-je le 12 mars ?" répond correctement

---

<a name="phase-3"></a>

# PHASE 3 — Emails + Photos (semaine 9-12)

## 3.1 — OAuth Google Gmail

**Étapes :**
1. Google Cloud Console → projet "marc-hub"
2. Activer Gmail API + Photos API
3. Créer credentials OAuth 2.0 (type "Desktop app")
4. Flow OAuth dans le hub : page settings → "Connect Gmail" → callback
5. Refresh token stocké en DB chiffrée

| Soucis possibles | Contournement |
|---|---|
| OAuth consent screen requiert "verified app" pour usage non-test | Mode "Testing" suffit pour usage perso : ajouter ton email dans la liste de testers, refresh token reste valide. |
| Limite 100 utilisateurs en mode testing | OK pour single-user. |
| Token expire toutes les 6h, refresh token tous les 6 mois si non utilisé | Job cron qui refresh quotidien. |
| Quota Gmail API (1B requêtes/jour, 250 quota units/user/seconde) | Plus que suffisant. |
| Google révoque l'app sans préavis | Re-OAuth manuel via UI. |

## 3.2 — Ingestion emails

**Étapes :**
1. Pull incrémental via `historyId` (only new since last sync)
2. Pour chaque email : raw + parsed (subject, from, to, body, attachments meta)
3. Stockage : raw eml en S3-like (local), parsed en DB
4. Indexation : Postgres FTS sur subject+body, embeddings sur body chunked

| Soucis possibles | Contournement |
|---|---|
| 500k+ emails dans Gmail | Batch processing nocturne. Embedding incrémental. |
| Attachments lourds | Stockage off-DB (filesystem ou MinIO). Liens en DB. |
| Encodage des emails (MIME, base64, charset) | Lib `email` Python + chardet. |
| Spam et newsletters polluent l'index | Filter sur labels Gmail (skip "Promotions", "Spam"). |
| Re-ingestion si on perd la DB | History API a un délai limité (~30 jours). Au-delà : full re-pull. |
| Données ultra sensibles dans emails (médical, légal) | Chiffrement at-rest. Pas de partage. Right-to-forget par email possible. |

## 3.3 — Photos via Google Takeout

**Pourquoi Takeout et pas Photos API :** depuis 2025, Google Photos API est restreint (pas de download du contenu original). Takeout reste le seul moyen.

**Étapes :**
1. Takeout > Google Photos > sélectionner albums
2. Téléchargement zip
3. Extract dans `raw_events/photos/<date>/`
4. Pipeline : pour chaque photo → EXIF + OCR + CLIP embedding + face detection

| Soucis possibles | Contournement |
|---|---|
| Volume énorme (50k photos = 200GB) | Storage local pas de souci avec ton SSD. Backup incrémental restic gère bien. |
| Takeout livre en plusieurs zips (4GB max chacun) | Parser doit traiter les zips en série. |
| EXIF effacé par certains exports | Fallback sur métadonnées du zip Google. |
| Photos sans GPS | OK, on indexe quand même. |
| OCR gratuit pas top sur photos low-res | EasyOCR est un bon compromis. PaddleOCR meilleur mais plus lourd. |
| CLIP embedding lent | Sur RTX 5080 : ~100 photos/sec. Batch sur GPU. |
| Mémoire CLIP (modèle ~5GB VRAM) | OK avec 16GB VRAM. Si conflit avec Ollama : run CLIP de nuit, Ollama de jour. |

## 3.4 — Reconnaissance faciale (sensible)

**Étapes :**
1. Détection visages : InsightFace (RetinaFace + ArcFace embeddings)
2. Clustering visages : DBSCAN sur embeddings
3. UI : "Tu reconnais ce visage ?" → tu nommes les clusters
4. Recherche "photos de Paul" : query embedding moyen du cluster

| Soucis possibles | Contournement |
|---|---|
| Faux positifs (visages similaires) | Threshold tunable. UI pour fusionner / séparer les clusters. |
| Biais (modèle moins bon sur certains traits) | Disclamer dans UI : "marche moins bien pour X groupes". |
| Photos floues / partielles | Skip si confidence < seuil. |
| Privacy juridique (data biométrique = sensible RGPD) | Pas de partage externe. Documentation dans hub-docs/06-security.md. |
| Photos d'enfants | Encore plus sensible. Option pour exclure. |
| Embeddings qui leakent ailleurs | DB chiffrée at-rest. Backup chiffré. |

## 3.5 — Critère de succès Phase 3

✅ 95% des emails ingérés et indexés
✅ Recherche "email du syndic l'an dernier" trouve immédiatement
✅ Photos OCR'd et CLIP-indexed (peut prendre une nuit)
✅ Recherche "photo de la plage en Italie" marche
✅ Clusters de visages créés, tu peux nommer les principaux
✅ Recherche "photos de Paul à la plage" combine recognition + CLIP

---

<a name="phase-4"></a>

# PHASE 4 — App finance + agents pro-actifs (semaine 13-15)

## 4.1 — Récupération de l'app finance existante

Symétrique de Phase 2.3 (app trajets). Marc push, je refactor, on conteneurise par version.

## 4.2 — Agents pro-actifs schedulés

**Étapes :**
1. Cron : tous les soirs 22h, agent "Daily Brief"
2. Inputs : transactions du jour, déplacements, emails marqués important
3. Output : brief en français + score d'importance (1-5)
4. Agent "Weekly Review" : vendredi soir, synthèse de la semaine
5. Agent "Anomaly Watcher" : run continu (toutes les 4h), scan tous les data sources

| Soucis possibles | Contournement |
|---|---|
| LLM 14B trop lent pour briefs longs | Paralléliser les sous-tâches. Cache des analyses partielles. |
| Agent qui boucle | Max iterations + timeout par agent. |
| Faux pattern detected | Tu valides les insights, le hub apprend. |
| Trop de notifs si plusieurs agents alertent en même temps | Aggregator : 1 brief consolidé au lieu de 5 notifs. |
| Coût de calcul si on lance ça en continu | Sur ton hardware, négligeable. |

## 4.3 — Critère de succès Phase 4

✅ Tu reçois un brief intelligent chaque matin (notif + page hub)
✅ Le brief croise plusieurs sources de data
✅ App finance v1, v2, v3 cohabitent dans le hub
✅ Insights "tes dépenses transport sont +X% ce mois lié à ton voyage Seattle vu ta timeline" arrivent

---

<a name="phase-5"></a>

# PHASE 5+ — Sources restantes

À phaser selon priorités du moment :
- Calendrier & contacts Google
- Documents (PDFs, factures, contrats) avec OCR + classification
- Réseaux sociaux & navigation (Twitter export, YouTube watch history, Spotify)
- Santé & fitness (Apple Health, Google Fit, Strava)
- Communications (SMS export, WhatsApp export)

Pour chacune : suivre le pattern Phase 1 (connector → modèle → UI → IA recherche → insights).

---

<a name="transverse"></a>

# Risques transverses long terme

## Évolution des dépendances

| Risque | Surveillance | Workaround |
|---|---|---|
| Python 3.13 deprecated dans 5 ans | Renovate bot suit les releases | Migration semi-automatique |
| FastAPI breaking changes | Suivre changelog | Pin version + tests d'intégration |
| Postgres breaking changes | Major upgrades = migration manuelle | Chaque 2 ans en gros, sans casse fréquente |
| Ollama qui meurt | Watcher GitHub releases | llama.cpp direct en fallback |
| Cloudflare change politique tunnel free | Veille | Tailscale Funnel en prêt |
| OpenAI / autre publie un modèle ouvert plus puissant | Veille | Switch via change de variable env |

## Évolution de tes besoins

| Cas | Workaround |
|---|---|
| Tu déménages → nouvelle banque, nouvel ISP, nouvelle TZ | Connector banque ajoutable. ISP = tunnel s'en moque. TZ paramétrable. |
| Tu te marries → multi-user | Architecture déjà extensible (Phase 5+) |
| Tu veux partager un dashboard avec un proche (read-only) | Cloudflare Access permet de granter à un autre email |
| Tu veux une seconde résidence (2e PC) | Réplication active-passive : maître = PC principal, esclave = 2e PC sync via DB replication |
| Tu meurs / accident long | "Dead man's switch" : si pas d'activité 90j, hub envoie credentials chiffrés à un proche désigné |

## Données qui grossissent

| Volume estimé | Implication |
|---|---|
| 5 ans : 10 ans de transactions = ~200k rows | OK Postgres |
| 5 ans de Timeline = ~500MB raw | OK |
| 50k photos avec embeddings (1KB chacun) = 50MB en DB + 200GB media | OK SSD |
| 500k emails avec embeddings = 500MB en DB | OK |
| Total estimé : ~250GB sur SSD | Largement dans les capacités |

---

<a name="contingence"></a>

# Plan de contingence majeur

## "Mon PC a brûlé"

**Procédure :**
1. Acheter nouveau PC (ou utiliser celui de secours)
2. Installer outils prérequis (winget commands ci-dessus)
3. `git clone` les repos depuis github.com/MoKarade
4. Récupérer la clé age depuis backup (OneDrive ou clé USB)
5. `restic restore` depuis OneDrive : DB + secrets + raw_events
6. `start_hub.ps1`
7. **RTO (Recovery Time Objective) : 4-8 heures**

## "Mon compte Google a été piraté"

**Procédure :**
1. Reset password Google + activer 2FA hardware (YubiKey)
2. Révoquer tous les OAuth tokens
3. Régénérer tokens hub
4. Audit logs hub : que s'est-il passé pendant la fenêtre de compromission
5. Si data sensible exposée → action selon le cas

## "GitHub décide de couper mes repos privés"

**Procédure :**
1. Migrer vers Gitea self-hosted (gratuit, run dans Docker)
2. `git remote set-url origin <new-gitea-url>` sur chaque clone local
3. `git push --all --force`
4. **Délai : 1 jour**

## "Cloudflare décide de couper free tunnel"

**Procédure :**
1. Switch sur Tailscale Funnel (gratuit, similar)
2. Update DNS si needed
3. **Délai : 1 heure**

## "Ollama / mon modèle local est nul / hallucinate trop"

**Procédure :**
1. Trial autres modèles : llama 3.1, mistral nemo, qwen 2.5 32B, gemma 3
2. Benchmark local sur tes vraies questions
3. Garder le meilleur

---

# Checklist d'avancement (à cocher au fil de l'eau)

## Phase 0
- [ ] Outils Windows installés
- [ ] Compte Cloudflare + tunnel créé
- [ ] DuckDNS configuré
- [ ] Compte GitHub + 5 repos privés créés
- [ ] hub-core et hub-deploy pushés
- [ ] Stack Docker démarre en local
- [ ] /v1/health et /v1/ready répondent OK
- [ ] Tunnel + Caddy fonctionnent depuis l'extérieur
- [ ] Cloudflare Access bloque les non-autorisés
- [ ] Vault age + sops setup
- [ ] Backup restic vers OneDrive testé (backup + restore)

## Phase 1
- [ ] Méthode banque définie + implémentée
- [ ] Premiers imports de transactions réels
- [ ] Page /finances fonctionnelle
- [ ] Recherche IA "combien j'ai dépensé en X" répond
- [ ] Détection d'anomalies opérationnelle
- [ ] Notifs ntfy configurées

## Phase 2
- [ ] Timeline Google ingérée
- [ ] Carte des trajets affichée
- [ ] App trajets v1 portée dans le hub
- [ ] App trajets v2 refactor pour API hub
- [ ] Switcher entre versions OK

## Phase 3
- [ ] OAuth Google validé
- [ ] Gmail ingéré (>95%)
- [ ] Photos ingérées + EXIF/OCR/CLIP
- [ ] Reconnaissance faciale + clusters nommés
- [ ] Recherche unifiée multi-source

## Phase 4
- [ ] App finance portée dans le hub
- [ ] Agents pro-actifs schedulés
- [ ] Daily brief reçu

## Phase 5+
- [ ] Calendrier & contacts
- [ ] Documents PDF
- [ ] Santé Apple/Google
- [ ] Communications (SMS, WhatsApp)
- [ ] Réseaux sociaux & navigation

---

*Document vivant. À mettre à jour au fur et à mesure que des soucis sont rencontrés (et que des contournements sont trouvés).*
