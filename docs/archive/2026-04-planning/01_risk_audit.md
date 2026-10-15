# Personal Data Hub — Audit des risques & scénarios

Document de travail rédigé le 2026-04-28 par Claude pour Marc.
Objectif : anticiper TOUS les casse-têtes possibles avant de coder, et choisir des mitigations dès l'archi.

---

## 1. Perte / corruption de données

| Scénario | Probabilité | Impact | Mitigation prévue |
|---|---|---|---|
| Disque dur du PC meurt (SSD NVMe peut lâcher sans préavis) | Moyenne (3-7 ans en moyenne) | CATASTROPHIQUE — toutes les données perdues | Backup chiffré quotidien (restic) vers OneDrive + B2. Restore mensuel testé automatiquement. |
| PC volé / cambriolage | Faible mais réelle | Catastrophique + risque exposition data | Chiffrement at-rest (BitLocker + DB chiffrée) + backup offsite |
| Corruption silencieuse (bit rot) | Moyenne sur le long terme | Perte partielle | Filesystem ZFS/Btrfs idéal mais Windows = NTFS. Mitigation : checksums SHA-256 stockés en DB pour les fichiers critiques + verif périodique |
| Bug d'ingestion qui pourrit la DB | Élevée (ça arrive) | Modéré si bonne archi | DB en append-only ledger pour les events bruts. Recalcul du state à partir des events. Snapshots PostgreSQL quotidiens. |
| Accident humain (toi ou moi qui delete) | Élevée | Variable | Soft-delete partout (tombstone), pas de DELETE physique. Recycle bin du hub avec rétention 30j. |
| Synchronisation avec le 2e PC qui foire (versioning des apps) | Moyenne | Variable | Git workflow strict. Branches protégées. Pas de force-push sur main. |

**Décision archi qui découle de ça :**
- Pattern **event sourcing** pour l'ingest (les exports bruts sont stockés tels quels, immutables, en `raw_events/`).
- DB de "vue" (PostgreSQL) reconstructible à partir des events bruts.
- Backup stratégie 3-2-1 : 3 copies (PC + OneDrive + B2), 2 supports (SSD local + cloud), 1 offsite (cloud).

---

## 2. Sécurité / compromission

| Scénario | Probabilité | Impact | Mitigation prévue |
|---|---|---|---|
| Token OAuth Google leaké via Git | Élevée si pas vigilant | Très grave (accès complet Gmail) | Pre-commit hooks (gitleaks), .gitignore strict, secrets DANS DB chiffrée, JAMAIS dans le repo |
| Tunnel Cloudflare exposé sans auth | Élevée si négligé | Catastrophique | Cloudflare Access (Zero Trust) gratuit jusqu'à 50 users : auth Google obligatoire avant d'atteindre le hub |
| Mot de passe master volé (keylogger, phishing) | Moyenne | Très grave | MFA obligatoire (TOTP). Master password jamais saisi dans le navigateur, juste pour démarrer le service. |
| Vulnérabilité dans une dépendance (CVE) | Élevée (toujours) | Variable | Dependabot activé sur tous les repos GitHub. Renovate pour les versions. Audit `pip-audit` / `npm audit` en CI. |
| Plaid / Google API keys volées | Faible si vault propre | Grave | Tokens stockés chiffrés avec age (clé asymétrique). Master key sur YubiKey idéalement, sinon Bitwarden. |
| AnyDesk déjà installé chez toi → vecteur d'attaque potentiel | Modérée | Grave si compromis | Vérifier mot de passe AnyDesk fort + 2FA. Désactiver autorisation auto. Idéalement, ne pas laisser AnyDesk lancé en permanence. |
| Reconnaissance faciale exposée (DB des embeddings) | Moyenne | Très sensible (data biométrique) | Embeddings chiffrés au repos. Jamais exportés. Effacement possible (right to forget toi-même). |

**Décisions archi qui découlent :**
- Tout secret passe par un vault (recommandation : **age** + **sops** ou **Bitwarden CLI**).
- Cloudflare Access en front du tunnel pour l'auth.
- MFA obligatoire (TOTP via Authy/Aegis).
- Audit log de tous les accès au hub, signed et immutable.

---

## 3. Performance / scaling

| Scénario | Probabilité | Impact | Mitigation prévue |
|---|---|---|---|
| Volume de photos énorme (50k+ photos) | Très probable | Embeddings CLIP lents | Batch processing nocturne sur RTX 5080 (très rapide), pas de re-embedding inutile, cache |
| Ollama qui sature ta VRAM | Faible avec RTX 5080 (16GB) | Modéré | Choix modèle adapté : Qwen 2.5 14B en Q4 = ~9GB VRAM, laisse de la marge. Si tu joues à un jeu, le modèle peut être unload temporairement. |
| Recherche full-text lente sur emails | Moyenne | Pénible UX | PostgreSQL full-text + index GIN. Chroma/pgvector pour sémantique. ETL bien indexé. |
| Trop de tâches cron simultanées qui bouffent le PC | Possible | Modéré | Queue (Celery + Redis ou RQ). Throttling par worker. Affichage du load dans le hub. |
| Latence du tunnel Cloudflare en mobilité | Faible | UX dégradée | Cache côté client (PWA service worker). Compression. Si critique, caching CDN sur réponses non-sensibles. |

---

## 4. Vendor lock-in / dépendances externes

| Scénario | Probabilité | Impact | Mitigation prévue |
|---|---|---|---|
| Plaid change ses tarifs / coupe l'accès | Probable (ça arrive) | Grave si banking devient inaccessible | Stocker les transactions BRUTES en DB. Si Plaid coupe, on a déjà tout l'historique. Plan B : exports CSV manuels. |
| Google ferme une API (déjà arrivé : Reader, Inbox, etc.) | Probable sur 5+ ans | Modéré à grave selon API | Idem : on stocke localement dès l'ingestion. Re-fetch impossible mais data conservée. |
| Cloudflare Tunnel quotas free tier réduits | Possible | Modéré | Plan B : Tailscale Funnel (gratuit aussi) ou WireGuard sur VPS Oracle Free. |
| Ollama project abandonné | Faible | Modéré | C'est du wrapping de llama.cpp. On peut switcher direct à llama.cpp si besoin. |
| GitHub change politique repos privés | Faible | Faible | Self-hosted Gitea ou GitLab CE comme plan B. |
| OneDrive supprime ton compte | Faible | Faible si backup multi-cible | C'est pour ça qu'on a Backblaze B2 en doublon. |

**Principe directeur :** **toujours stocker les données BRUTES localement à l'ingestion**, ne jamais dépendre du re-fetch.

---

## 5. Coûts cachés / surprises financières

Tu m'as dit "tout doit être gratuit". Voici les vrais coûts à anticiper :

| Service | Coût | Alternative gratuite |
|---|---|---|
| **Plaid** (banking US) | 500$/mois minimum officiellement, mais **Plaid Free Sandbox** + accès dev limité jusqu'à ~5 connexions live | GoCardless (EU only), exports CSV manuels |
| **Google APIs** (Gmail, Photos, Drive) | Gratuit jusqu'à quotas généreux | OK pour usage perso |
| **Cloudflare Tunnel** | Gratuit (illimité pour usage perso) | Tailscale Funnel, ngrok (limité) |
| **OneDrive** | Tu as déjà 1TB via Microsoft 365 probablement | iCloud, Google Drive |
| **Backblaze B2** | 6$/TB/mois, free tier 10GB | rclone + Mega (50GB free), encrypted |
| **GitHub privé** | Gratuit pour usage perso (illimité repos privés) | Gitea self-hosted |
| **Ollama + modèles** | 100% gratuit | — |
| **Pushover** | 5$ achat unique | ntfy.sh self-hosted gratuit |
| **Domaine perso** (recommandé pour le tunnel) | ~10$/an | Sous-domaine Cloudflare gratuit |

**Estimation TCO réaliste :** 0$/mois si tu acceptes les limites du free tier Plaid, ~10-15$/mois si tu veux Plaid Pro + Backblaze + domaine. Honnête plutôt que "tout gratuit".

---

## 6. Privacy / légal / RGPD

| Scénario | Risque | Mitigation |
|---|---|---|
| Tu donnes accès à un proche (deviens multi-user un jour) | Cadre légal flou | Pour l'instant single-user → pas de souci. Si extension future : consentement écrit. |
| Tu décides un jour de supprimer toutes tes données du hub | Doit être propre | Implémenter `right_to_forget()` dès le début : delete cascade + secure wipe. |
| Tu ingères des emails contenant des données de tiers | Légalement gris (mais ce sont TES emails) | Pas de partage externe. Pas d'export hors hub. |
| Reconnaissance faciale de personnes non-consentantes (amis, famille) | Sensible | Reste local, pas de partage. Note : illégal de partager publiquement. |
| Tu utilises ces data pour entraîner un modèle public un jour | Très sensible | Hors scope. Pas d'entraînement, juste de l'inférence. |
| Tu meurs / accident / hôpital | Pratique : qui peut accéder à tes data ? | Pas urgent maintenant. Plus tard : "dead man's switch" → master password chiffré chez un proche de confiance. |

---

## 7. Opérationnel (PC down, internet down)

| Scénario | Mitigation |
|---|---|
| Coupure internet à la maison | Hub continue de marcher en local. Tunnel down → pas d'accès distant temporaire, pas grave. |
| Panne de courant / PC OFF quand tu es dehors | Tu n'as pas accès au hub. Solutions : (a) accepter, (b) UPS + Wake-on-LAN + Tailscale router, (c) version "cache" sur ton téléphone. |
| Ollama plante / process zombie | Healthcheck + auto-restart via Windows service ou NSSM |
| Update Windows qui reboot ton PC | Configurer "active hours" Windows + auto-restart des services au boot |
| MAJ logicielle qui casse une intégration | Tests d'intégration en CI. Staging env (un docker-compose dédié) avant prod. |

---

## 8. Maintenance & dette technique

Tu es **beginner coder**. Le plus gros risque non-technique : **se retrouver avec un projet trop complexe à maintenir tout seul.**

Mitigations :
- **Choisir des stacks ennuyeuses et stables** (Python + FastAPI + PostgreSQL plutôt que stack expérimentale)
- **Documentation auto-générée** : OpenAPI pour les APIs, README à jour, ARCHITECTURE.md
- **Tests minimaux mais présents** dès le début (un test = une protection contre une régression future)
- **Logs structurés** avec rotation
- **Healthchecks** pour chaque module
- **Monitoring simple** : un tableau de bord "santé du hub" dans le hub lui-même

---

## 9. Versioning des apps en parallèle (le piège technique)

Tu as demandé **plusieurs versions live en même temps** (v1, v2, v3 de la même app). C'est coquet mais piégeux :

| Problème | Solution |
|---|---|
| 3 versions qui écrivent dans la même DB → inconsistances | Une seule version "writeuse" (la dernière), les autres sont read-only |
| Schémas DB qui évoluent → v1 ne lit plus v2's data | Couche d'abstraction "data API" versionnée. Chaque version d'app appelle une API stable, pas la DB directement. |
| Multiplie les ports / processus → confus | Routing par sous-chemin : `/apps/finance/v1/`, `/apps/finance/v2/`. Reverse proxy (Caddy ou Traefik) gère. |
| Stockage qui explose (3 versions x leurs assets) | Acceptable, c'est ton PC. Mais image Docker partagée si même base. |
| Bugs spécifiques à v1 difficiles à reproduire si v2 a corrigé | Garde le code de v1 freezé dans son repo. Pas de cherry-pick chaotique. |

**Recommandation forte :** définir une **API de données stable** (sorte de "REST interne" du hub). Les apps versionnées la consomment. La DB n'est jamais accédée directement par les apps.

---

## 10. Synchronisation entre tes 2 PCs (apps existantes sur l'autre)

| Problème | Solution |
|---|---|
| Modifications faites sur l'autre PC perdues | Git push obligatoire avant de quitter la session sur l'autre PC. Hook pre-shutdown. |
| Conflits de merge | Workflow simple : tu travailles sur 1 seul PC à la fois pour une feature donnée. Si vraiment besoin : branches feature distinctes. |
| Secrets différents par machine | Vault par machine, jamais commit. Sync des secrets via Bitwarden (pas via Git). |
| Time zone différente | Storage en UTC partout, formatage côté UI selon ta TZ. |

---

## 11. Onboarding / learning curve (toi)

Tu m'as dit beginner. Ce projet a beaucoup de concepts (RAG, vector DB, OAuth, tunnel, Ollama, Docker probablement). Risque : tu décroches en cours de route.

Mitigations que je propose :
- **Phase MVP minimaliste** : 1 source data, 1 modèle, recherche simple. Pas de versioning multi, pas de Docker au début. On ajoute progressivement.
- **Je documente CHAQUE étape en français** dans `docs/` du repo. Pas juste "voilà le code", mais "voilà pourquoi".
- **Je te fais des sessions guidées** ("teach mode") pour les concepts importants (Git workflow, OAuth, etc.).
- **Pas de magic** : si c'est pour cacher une complexité que tu devras de toute façon comprendre un jour, on évite.

---

## Synthèse des décisions archi forcées par cet audit

1. **Event sourcing** : raw exports → DB de vue reconstructible
2. **Vault de secrets** chiffré, jamais de secret en clair dans le repo
3. **Cloudflare Access** + MFA en front du tunnel
4. **Stockage local des data brutes** systématique (anti-vendor-lock)
5. **API de données interne stable** + apps versionnées qui la consomment
6. **Stack ennuyeuse** : Python + FastAPI + PostgreSQL + pgvector + Ollama + Caddy
7. **Backup 3-2-1** chiffré quotidien
8. **Healthcheck + monitoring** dans le hub lui-même
9. **MVP minimaliste d'abord** (1 source, 1 feature) puis itération
10. **Documentation française** systématique pour toi

---

## Ce qui reste à décider après cet audit

- Validation : tu valides ces 10 décisions archi ?
- UI : on attaque les mockups ?
- Phasing : on définit les 3-4 phases (MVP → V1 → V2 → V3) ?
- Setup repos GitHub : on commence par scaffolder hub-core et hub-deploy ?
