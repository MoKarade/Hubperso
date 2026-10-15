# Personal Data Hub — Contexte projet pour Claude Code

Ce fichier est le **handoff complet** du projet, transféré depuis la conversation Cowork du 2026-04-28.

> **Si tu reprends ce projet, lis aussi :** `01_risk_audit.md`, `02_phasing.md`, `03_repo_structure.md`, `04_master_plan.md` dans ce même dossier. Ces 4 docs contiennent les détails de planification.

---

## Vision en une phrase

Un hub privé hébergé sur le PC de Marc qui agrège toutes ses données personnelles, accessible avec une IA locale qui répond précisément à ses questions et l'alerte sur ce qui mérite son attention.

## Sources de données prévues (toutes — Marc a dit "tout")

- Banque & finance (relevés, transactions, actions, abonnements)
- Localisation / trajets (Google Maps Timeline, Takeout, GPX, Strava)
- Communications (emails Gmail/Outlook, SMS, WhatsApp, Messenger, Slack perso)
- Santé & fitness (Apple Health, Google Fit, Garmin, sommeil)
- Photos & médias (Google Photos, iCloud avec métadonnées)
- Calendrier & contacts (Google Calendar, contacts)
- Documents & fichiers (PDFs, factures, contrats, Drive/OneDrive/Dropbox)
- Réseaux sociaux & navigation (historique web, YouTube, Twitter/X, Instagram, Spotify)

**Sources MVP prioritaires (Phase 1) :**
1. Banque (méthode à confirmer — voir bloquant ci-dessous)
2. Localisation Google Maps Timeline
3. Emails Gmail
4. Photos Google Photos

---

## Stack technique validée

| Couche | Choix | Pourquoi |
|---|---|---|
| Backend | Python 3.13 + FastAPI + Uvicorn | Stable, ennuyeux, beaucoup de libs |
| DB | PostgreSQL 16 + pgvector | Tout-en-un (relations + vectors) |
| ORM | SQLAlchemy 2.0 async + Alembic | Standard, migrations |
| LLM | Ollama (host natif Windows pour GPU) | Gratuit, profite RTX 5080 |
| Modèle principal | qwen2.5:14b-instruct (~9 GB VRAM) | Bon rapport perf/qualité |
| Embeddings | nomic-embed-text | Léger, bon |
| Frontend | Next.js 15 + Tailwind + lucide-react + recharts | Moderne, responsive, PWA possible |
| Reverse proxy | Caddy | Auto-TLS, routing par sous-chemin pour versioning |
| Tunnel | Cloudflare Tunnel + Cloudflare Access | Gratuit, MFA Google |
| Domaine | DuckDNS (gratuit, ex: marc-hub.duckdns.org) | Pas besoin d'acheter |
| Auth | Cloudflare Access (Google login + MFA) | Bloque tout avant le hub |
| Vault secrets | age + sops | Gratuit, simple, robuste |
| Backup | restic vers OneDrive (Marc l'a déjà via M365) | Chiffré client-side, dédup |
| Notifs push | ntfy.sh (free tier ou self-host) | Mobile via Pixel 10 Pro |
| Workers cron | APScheduler dans hub-ingest | Léger, pas besoin de Celery au début |
| Photos | EasyOCR + OpenCLIP + InsightFace | Tous gratuits, GPU-friendly |

## Hardware (vérifié 2026-04-28)

- AMD Ryzen 9 9950X3D (16C/32T)
- 64 GB DDR5 RAM
- NVIDIA RTX 5080 (16 GB VRAM)
- Windows 11 Pro 24H2
- Wi-Fi 7
- Hostname : `MAIN`, user : `marcr`

**Implication :** hardware MASSIVEMENT overprovisionné. Pas de contraintes matérielles à anticiper.

---

## Architecture clés

### Multi-repo (Marc a explicitement choisi multi-repo, pas mono-repo)

8 repos prévus sur github.com/MoKarade, **tous privés** :
- `hub-core` — backend FastAPI
- `hub-frontend` — UI Next.js
- `hub-ingest` — workers d'ingestion
- `hub-deploy` — infra (docker-compose, Caddy, scripts, secrets)
- `hub-docs` — documentation française
- `app-trajets` — app trajets Google Earth refactorée (à pusher depuis l'autre PC)
- `app-finance` — app finance refactorée (à pusher depuis l'autre PC)
- `hub-shared` — types partagés (Phase 2+, optionnel)

### Event sourcing pour l'ingest (ADR-0002)

Chaque connecteur dump les data BRUTES en `raw_events/<source>/<YYYY-MM-DD>/<timestamp>.json` (immutable, append-only). Une pipeline les normalise et insère en DB. Si bug de pipeline ou changement de schéma → on rejoue depuis raw_events.

### Versioning des apps embarquées

Marc veut **plusieurs versions live en parallèle** (v1, v2, v3 toutes accessibles).

Implémentation :
- Sous-dossiers `versions/v1/`, `versions/v2/` etc. dans chaque repo `app-*`
- 1 Docker image par version
- Caddy route `/apps/<app>/<version>/*` vers le bon conteneur
- Une seule version "writeuse" (la dernière), les autres en read-only
- Toutes les versions consomment l'API stable du hub-core (`/v1/...`)

### Sécurité

- Niveau "Maximum" : chiffrement at-rest, MFA, secrets dans vault age+sops
- Cloudflare Access en front du tunnel (auth Google + TOTP MFA obligatoire)
- DB Postgres avec encryption-at-rest
- Tokens OAuth chiffrés en DB

---

## État au 2026-04-28 (fin de discovery + scaffolding initial)

✅ **Discovery complète** sur 7 batchs de questions
✅ **Audit risques** (`01_risk_audit.md` — 11 catégories de risques + 10 décisions archi)
✅ **Phasing** (`02_phasing.md` — 5 phases avec deliverables)
✅ **Structure repos** (`03_repo_structure.md`)
✅ **Master plan exhaustif** (`04_master_plan.md` — ~120 soucis identifiés avec contournements)
✅ **5 repos scaffolés** localement dans `repos/` (hub-core, hub-deploy, hub-frontend, hub-ingest, hub-docs)
✅ **Mockups UI** (3 options dans `mockups/`)
✅ **Script tout-en-un** `setup_everything.ps1` (push GitHub + install + lance la stack)

❌ **Pas encore lancé en vrai** — le code n'a pas été testé end-to-end
❌ **Aucune feature implémentée** : `/v1/ai/ask` est TODO, pas de connecteur banque, pas d'ingestion réelle
❌ **Tunnel Cloudflare** : pas configuré (étape Phase 0 finale)

## Bloquants en attente de Marc (importants)

1. **Push initial GitHub** — Marc doit lancer `setup_everything.ps1` (gh auth login interactive). C'est la limite de Cowork qui ne peut pas typer dans des terminaux.

2. **Méthode banque actuelle** — Marc doit aller voir sur son AUTRE PC comment son app Finance existante récupère ses transactions. Options anticipées : exports CSV manuels (le plus simple et 100% gratuit), scraping de portail (fragile), service tiers (à identifier). **Cette info bloque toute la Phase 1**.

3. **Push de app-trajets et app-finance** depuis l'autre PC. Marc doit faire `git init + push` depuis là-bas. **Bloque Phase 2 et Phase 4**.

---

## Feedback explicite de Marc sur le mockup UI choisi

Marc a choisi le **Mockup 1 (Modern Web App)** comme direction, mais a dit :
> "trop AI-générique, pas assez d'info, pas assez visuel, pas assez d'icônes, c'est plat, pour un début ça va c'est pas ce que je voudrais à la fin"

Le scaffold `hub-frontend` intègre déjà les corrections :
- Palette ink (gris bleuté chaud) + accent vert terminal-y au lieu du violet AI-générique
- Vraies icônes lucide-react partout
- Sparklines dans les stat cards, dots d'importance sur insights, tags de version mono pour les apps
- Vrai chart recharts (pas des divs alignés)
- Plus de densité, plus de caractère

Mais le frontend n'a pas encore été lancé en vrai. Marc devra itérer dessus quand il pourra le voir tourner.

---

## Documents stratégiques dans ce dossier (à lire en priorité)

| Fichier | Contenu |
|---|---|
| `README.md` | Index global du projet |
| `01_risk_audit.md` | 11 catégories de risques + 10 décisions archi forcées par cet audit |
| `02_phasing.md` | Phasing macro 5 phases avec deliverables et timelines |
| `03_repo_structure.md` | Structure détaillée des 8 repos multi-repo |
| `04_master_plan.md` | **Master plan exhaustif** : chronologie détaillée + 120 soucis + contournements |
| `system_specs.txt` | Export des specs PC du 2026-04-28 |
| `repos/*/CLAUDE.md` | Contextes spécifiques par repo |
| `repos/hub-deploy/docs/SETUP.md` | Guide pas à pas (10 étapes) pour mettre le hub en route |

## Prochaines étapes concrètes

1. Marc lance `setup_everything.ps1` — push GitHub + install + démarre la stack
2. Premier `docker compose up` va probablement révéler 2-3 bugs à corriger ensemble
3. Quand `/v1/ready` répond OK, Phase 0 est terminée
4. Configurer le tunnel Cloudflare + Access (étape 8-10 de SETUP.md)
5. Marc va voir sur son autre PC sa méthode banque actuelle
6. On code le connecteur banque selon la méthode confirmée
7. Premier import de SES vraies transactions (jamais de fake)
8. UI page /finances + endpoint `/v1/ai/ask`
9. **MVP utile atteint** = ~2-3 semaines de boulot après le push initial

## Choses à NE PAS faire (réinscrites pour insistance)

- ❌ JAMAIS de fake data, sandbox, fixtures avec valeurs inventées
- ❌ JAMAIS de service payant sans présenter le coût clairement à Marc
- ❌ JAMAIS de `gh auth login` ou commande qui requiert interaction sans demander à Marc
- ❌ JAMAIS supposer qu'il connait quelque chose de technique sans expliquer

## Choses à TOUJOURS faire

- ✅ Lire les CLAUDE.md du repo avant de modifier quoi que ce soit
- ✅ Mettre à jour ces CLAUDE.md quand des décisions évoluent
- ✅ Répondre en français
- ✅ Faire des recommandations claires (pas juste lister)
- ✅ Sauvegarder le contexte dans des docs Markdown plutôt que dans la conversation

---

*Handoff écrit par Claude (Cowork) le 2026-04-28 pour transmettre l'état complet du projet à Claude Code. Lis aussi les CLAUDE.md spécifiques de chaque repo dans `repos/<repo>/CLAUDE.md`.*
