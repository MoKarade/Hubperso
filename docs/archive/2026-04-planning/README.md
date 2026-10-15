# Personal Data Hub — Hub perso

Projet de Marc, démarré le 2026-04-28 avec Claude.

## Vision

Un hub centralisé hébergé sur le PC de Marc qui agrège toutes ses données personnelles (banque, localisation, emails, photos, santé, calendrier, etc.), avec une IA locale pour faire des recherches en langage naturel et des apps personnelles intégrées (avec versioning).

## Handoff vers Claude Code

Si tu utilises Claude Code, tous les fichiers de mémoire ont été transférés en `CLAUDE.md` :
- `~/.claude/CLAUDE.md` — profil Marc + règles globales (s'applique à tous tes projets)
- `Hub perso/CLAUDE.md` — contexte projet complet
- `Hub perso/repos/<repo>/CLAUDE.md` — contexte spécifique à chaque repo (5 repos)

Quand tu lances Claude Code (`claude` dans un dossier), il lit automatiquement le `CLAUDE.md` du dossier courant. Première phrase à lui dire : *"Lis CLAUDE.md et le master plan dans Hub perso — on reprend Phase 0 setup."*

## Documents dans ce dossier

| Fichier | Contenu |
|---|---|
| `01_risk_audit.md` | Audit complet des 11 catégories de risques + 10 décisions d'architecture forcées par cet audit |
| `02_phasing.md` | Découpage en 5 phases (Phase 0 → 4) avec deliverables concrets et estimations |
| `03_repo_structure.md` | Structure détaillée des 8 repos GitHub multi-repo |
| `04_master_plan.md` | **Master plan exhaustif** : chronologie détaillée + tous les soucis + tous les contournements |
| `system_specs.txt` | Export des specs PC (généré le 28/04/2026) |
| `mockups/index.html` | Comparateur des 3 propositions UI — **à ouvrir dans un navigateur** |
| `repos/hub-core/` | Scaffold complet du backend FastAPI (FastAPI + Postgres + Ollama + tests + Alembic) |
| `repos/hub-deploy/` | Scaffold complet de l'infra (docker-compose + Caddy + cloudflared + scripts PowerShell + vault) |
| `repos/hub-frontend/` | Scaffold complet de l'UI (Next.js 15 + Tailwind + lucide-react + recharts + composants dashboard) |
| `repos/hub-ingest/` | Scaffold workers d'ingestion (squelette event sourcing, sans connecteur banque pour l'instant) |
| `repos/hub-docs/` | Documentation française (vision, architecture, runbook, ADRs, versioning) |
| `repos/hub-deploy/docs/SETUP.md` | **Guide pas à pas pour Marc** : 10 étapes pour avoir le hub up |
| `push_to_github.ps1` | Script tout-en-un qui push les 5 repos sur github.com/MoKarade |

## Règles absolues (mises à jour 2026-04-28)

- **Aucun fake data** — pas de Plaid sandbox, pas de fixtures inventées, pas de mode demo. Toujours sa vraie data, c'est tout l'intérêt du local.
- Tout gratuit (DuckDNS + Cloudflare Tunnel free + Ollama + GitHub privés free + OneDrive déjà payé).
- Multi-repo sur github.com/MoKarade, tous privés.

## Specs PC (récap)

- **CPU** : AMD Ryzen 9 9950X3D (16C/32T)
- **RAM** : 64 GB
- **GPU** : NVIDIA RTX 5080 (16 GB VRAM)
- **OS** : Windows 11 Pro 24H2
- **Réseau** : Wi-Fi 7

Hardware massivement overprovisionné pour le projet — aucune limite matérielle attendue.

## Choix techniques validés

- **Backend** : Python 3.13 + FastAPI + PostgreSQL + pgvector
- **IA locale** : Ollama (modèle recommandé : Qwen 2.5 14B Instruct)
- **Embeddings** : nomic-embed-text ou bge-m3
- **Photos** : OpenCLIP + EasyOCR + InsightFace (reconnaissance faciale)
- **Banking** : à confirmer en fonction de la méthode actuelle de l'app Finance (CSV / OFX / scraping). **Pas de Plaid sandbox, pas de fake data.**
- **Tunnel** : Cloudflare Tunnel + Cloudflare Access (auth Google + MFA)
- **Backup** : restic chiffré → OneDrive + Backblaze B2 (3-2-1 strategy)
- **Vault secrets** : age + sops
- **Reverse proxy** : Caddy (routing par version d'app)
- **Frontend** : à choisir parmi 3 mockups
- **Repos** : multi-repo (8 repos prévus)
- **Hosting code** : GitHub privés
- **Mobile** : PWA via tunnel
- **Notifs** : ntfy.sh (push) + daily digest

## Décisions en attente de Marc

1. **Choix d'UI** parmi les 3 mockups → ouvrir `mockups/index.html`
2. **Username GitHub** (existant ou nouveau)
3. **Domaine perso** ou sous-domaine Cloudflare gratuit
4. **Validation des 10 décisions archi** du `01_risk_audit.md`

## Prochaines étapes (Phase 0)

Une fois les 4 décisions ci-dessus prises :
1. Création des repos GitHub
2. Scaffolding de `hub-core` et `hub-deploy`
3. Setup local : Docker + PostgreSQL + Ollama + tunnel
4. Première page web "Hub up — DB OK — Ollama OK" accessible via le tunnel

Estimation : 1-2 semaines pour la phase 0.

## Comment travailler avec Claude sur ce projet

- Le projet est conçu pour être accessible depuis **Cowork (Claude desktop)** ET **Dispatch (cloud sandbox)**.
- Toutes les décisions et le contexte sont sauvegardés dans la mémoire de Claude (4 fichiers mémoire), donc rien n'est perdu d'une session à l'autre.
- Les apps existantes seront pushées par Marc depuis son autre PC une fois que les repos sont prêts.

---

*Document généré automatiquement par Claude pendant la phase de discovery (2026-04-28).*
