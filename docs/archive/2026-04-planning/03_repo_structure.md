# Personal Data Hub — Structure des repos GitHub

Document de travail rédigé le 2026-04-28.
Tu as choisi le **multi-repo (1 repo par module)**. Voici la liste exhaustive avec le rôle, la stack, et les fichiers clés de chaque repo.

---

## Vue d'ensemble

```
GitHub: github.com/marcr4/
├── hub-core               (backend Python + DB + API)
├── hub-frontend           (UI web — choix du stack en attente)
├── hub-ingest             (workers d'ingestion data)
├── hub-deploy             (docker-compose, secrets templates, configs)
├── hub-docs               (documentation française du projet)
├── app-trajets            (ton app trajets Google Earth, refactorée)
├── app-finance            (ton app finance, refactorée)
└── hub-shared             (types, schémas, contrats partagés)
```

---

## 1. `hub-core` — Backend & API centrale

**Rôle :** le cœur. Sert l'API que toutes les apps consomment, gère la DB, héberge Ollama, fait tourner les agents IA.

**Stack :** Python 3.13 · FastAPI · PostgreSQL + pgvector · SQLAlchemy · Alembic (migrations) · Pydantic · Ollama (via HTTP) · Celery + Redis (queue de jobs).

**Structure :**
```
hub-core/
├── pyproject.toml
├── README.md
├── .env.example
├── .gitignore
├── docker-compose.dev.yml
├── alembic/                 # migrations DB
├── src/
│   ├── api/                 # routes FastAPI
│   │   ├── v1/              # version 1 de l'API publique du hub
│   │   │   ├── finance.py
│   │   │   ├── location.py
│   │   │   ├── search.py
│   │   │   └── ai.py
│   │   └── deps.py          # auth, DB session, etc.
│   ├── core/
│   │   ├── config.py        # settings (lit .env)
│   │   ├── security.py      # JWT, OAuth, vault
│   │   └── logging.py
│   ├── db/
│   │   ├── base.py
│   │   ├── models/          # SQLAlchemy models
│   │   └── crud/            # opérations CRUD
│   ├── ai/
│   │   ├── ollama_client.py
│   │   ├── embeddings.py
│   │   ├── rag.py           # pipeline RAG
│   │   └── agents/          # agents pro-actifs
│   ├── services/
│   │   ├── plaid_service.py
│   │   ├── google_service.py
│   │   └── notification_service.py
│   └── main.py
└── tests/
```

**Fichiers clés :**
- `.env.example` : template des secrets (lus par `core/config.py`).
- `alembic/versions/` : chaque migration DB versionnée et reproductible.
- `api/v1/` : tu peux faire `api/v2/` plus tard sans casser v1.

---

## 2. `hub-frontend` — UI web

**Rôle :** l'interface utilisateur du hub.

**Stack :** dépend de ton choix de mockup
- **Option 1** (Modern) → Next.js 14 + Tailwind + shadcn/ui + TypeScript
- **Option 2** (Streamlit) → Streamlit (Python pur)
- **Option 3** (Dashboard) → Homepage (open-source) ou code custom léger

À discuter une fois que tu as choisi le mockup. Le repo s'appelle `hub-frontend` dans tous les cas.

---

## 3. `hub-ingest` — Workers d'ingestion

**Rôle :** rapatrier les données depuis les sources externes (Plaid, Google, etc.) vers la DB du hub. Process séparé du `hub-core` pour ne pas bloquer l'API en cas de gros import.

**Stack :** Python · APScheduler ou Celery beat · clients officiels (plaid-python, google-api-python-client).

**Structure :**
```
hub-ingest/
├── pyproject.toml
├── README.md
├── src/
│   ├── connectors/
│   │   ├── bank_csv.py            # imports CSV depuis tes banques
│   │   ├── bank_ofx.py            # OFX/Direct Connect si la banque le supporte
│   │   ├── bank_scraper.py        # scraping si nécessaire (Playwright)
│   │   ├── gmail.py
│   │   ├── google_takeout.py
│   │   ├── google_photos.py
│   │   └── apple_health.py
│   ├── pipelines/           # ETL : raw → normalisé
│   │   ├── transactions.py
│   │   ├── locations.py
│   │   └── photos.py
│   ├── storage/
│   │   └── raw_events.py    # event sourcing : append-only
│   ├── scheduler.py         # orchestrateur cron
│   └── main.py
└── tests/
```

**Principe clé :** chaque connector dump les données BRUTES en `raw_events/{source}/{timestamp}.json` (event sourcing). Une pipeline ensuite les normalise et insère dans la DB du hub. Si on doit reconstruire la DB, on rejoue les events bruts.

---

## 4. `hub-deploy` — Infrastructure

**Rôle :** tout ce qui fait tourner le hub sur ton PC. Pas de code métier, juste de la conf.

**Stack :** Docker Compose · Caddy (reverse proxy) · scripts PowerShell pour Windows · restic (backup).

**Structure :**
```
hub-deploy/
├── README.md
├── docker-compose.prod.yml      # tout le stack en prod
├── docker-compose.dev.yml       # version dev
├── caddy/
│   └── Caddyfile                # routing /apps/finance/v1 → port :8012
├── cloudflared/
│   └── config.yml               # tunnel Cloudflare
├── secrets/
│   ├── README.md                # comment provisionner avec age + sops
│   └── *.enc                    # secrets chiffrés
├── backup/
│   ├── restic-config.toml
│   └── scripts/                 # backup.ps1, restore.ps1, verify.ps1
├── scripts/
│   ├── setup_windows.ps1        # premier setup
│   ├── start_hub.ps1            # démarre tout
│   └── healthcheck.ps1
└── docs/
    └── DEPLOY.md                # comment déployer / restaurer / mettre à jour
```

---

## 5. `hub-docs` — Documentation

**Rôle :** documentation française complète. Pas du code.

**Structure :**
```
hub-docs/
├── README.md
├── 01-vision.md                 # le pourquoi du projet
├── 02-architecture.md           # schémas, choix techniques
├── 03-data-model.md             # modèle de données + invariants
├── 04-api-contract.md           # specs OpenAPI commentée
├── 05-versioning-apps.md        # comment fonctionne le versioning
├── 06-security.md               # sécurité, threat model
├── 07-runbook.md                # opérations (start/stop/backup/restore/incidents)
├── 08-rgpd.md                   # data deletion, right to forget
├── tutorials/
│   ├── add-data-source.md
│   ├── deploy-new-app-version.md
│   └── debug-common-issues.md
└── decisions/                   # ADR (Architecture Decision Records)
    ├── 0001-multi-repo.md
    ├── 0002-event-sourcing.md
    └── ...
```

**Pourquoi un repo séparé :** la doc évolue indépendamment du code. Tu peux relire ce repo sans installer le hub.

---

## 6. `app-trajets` — Ton app trajets Google Earth (refactorée)

**Rôle :** l'app que tu as déjà écrite, après refactor pour qu'elle consomme l'API `hub-core` au lieu de ses propres fichiers.

**Stack :** ce que tu utilisais avant (à découvrir quand tu pushes depuis l'autre PC) + un client HTTP léger pour parler au hub.

**Structure :**
```
app-trajets/
├── README.md
├── versions/
│   ├── v1/                  # version originale, gelée pour référence
│   ├── v2/                  # itération 1 (refactor pour API hub)
│   └── v3/                  # itération en cours (live)
├── shared/                  # code commun à toutes les versions (client API)
└── docker/
    └── Dockerfile           # une image par version possible
```

**Versioning :** chaque version vit dans son sous-dossier. Le reverse proxy (Caddy) route `/apps/trajets/v1` → conteneur de v1, etc.

---

## 7. `app-finance` — Ton app finance (refactorée)

Même structure que `app-trajets`. Détails à découvrir quand tu pushes le code original.

---

## 8. `hub-shared` — Types & contrats partagés

**Rôle :** types Python / TypeScript / JSON Schema utilisés par plusieurs repos. Évite les drifts.

**Stack :** Python (Pydantic) + TypeScript (générés depuis OpenAPI).

**Structure :**
```
hub-shared/
├── pyproject.toml
├── package.json
├── schemas/                 # JSON Schema source-of-truth
│   ├── transaction.json
│   ├── location_point.json
│   └── photo.json
├── python/                  # Pydantic models générés
└── typescript/              # interfaces TS générées
```

**Note :** ce repo est optionnel pour démarrer (Phase 0). On peut l'ajouter en Phase 2 quand le besoin de partage se fait sentir.

---

## Conventions de versioning Git

- **Branches :** `main` (prod, protégée) · `dev` (intégration) · `feat/...` (features).
- **Tags :** SemVer pour les apps versionnées. `v1.0.0`, `v2.0.0`, etc. Une release = un déploiement de cette version.
- **Commits :** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- **Pre-commit hooks :** gitleaks (secrets), ruff (Python lint), prettier (TS/MD).
- **PR/Review :** comme tu es seul, pas obligatoire, mais je peux te review tes changements avant merge.

---

## Ordre de création des repos (Phase 0)

1. `hub-docs` (vide au début, va se remplir)
2. `hub-deploy` (les configs Docker / Caddy / Cloudflare)
3. `hub-core` (le backend principal)
4. `hub-ingest` (les workers)
5. `hub-frontend` (après ton choix de mockup UI)
6. `app-trajets` et `app-finance` (quand tu pushes depuis l'autre PC)
7. `hub-shared` (Phase 2 si besoin)

---

## Ce qu'il me faut de toi pour démarrer

1. **Un username GitHub** (existant ou à créer)
2. **Préférence : repos publics ou privés ?** Recommandation : privés (les data sont privées, le code aussi tant qu'on stabilise pas).
3. **Choix d'UI** (mockup 1, 2 ou 3) → débloquera la création de `hub-frontend`
4. **Confirmation que tu valides cette structure** ou ajustements à faire

Une fois ces 4 points, je peux scaffolder les repos en local + te donner les commandes exactes pour les pousser sur GitHub.
