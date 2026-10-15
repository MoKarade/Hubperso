# Personal Data Hub — Phasing & roadmap

Document de travail rédigé le 2026-04-28.
Objectif : découper le projet en phases livrables, chacune apportant de la valeur réelle.

Principe directeur : **chaque phase est utilisable seule**. Si on s'arrête après V1, tu as déjà un truc qui sert. On n'attend pas V3 pour avoir de la valeur.

---

## Phase 0 — Foundations (semaine 1-2)

**But :** mettre en place la plomberie sans laquelle rien ne marche.

**Livrables :**
- Repos GitHub créés et structurés (multi-repo selon ton choix)
  - `hub-core` — backend FastAPI + DB
  - `hub-frontend` — UI web responsive (PWA)
  - `hub-ingest` — workers d'ingestion
  - `hub-deploy` — docker-compose, configs, secrets templates
  - `hub-docs` — documentation française du projet
- PostgreSQL + pgvector lancés en Docker localement
- Ollama installé sur ton PC + modèle Qwen 2.5 14B Instruct téléchargé
- Tunnel Cloudflare configuré + Cloudflare Access (auth Google)
- Vault de secrets (age + sops) configuré
- Backup automatique restic vers OneDrive configuré et testé
- "Hello world" du hub : page d'accueil minimaliste accessible via le tunnel, qui dit juste "Hub up — DB OK — Ollama OK"
- Documentation `SETUP.md` que tu peux suivre toi-même au cas où il faut tout réinstaller

**Critère de succès :** tu peux ouvrir une URL depuis ton téléphone à l'autre bout de la ville, te logger avec ton compte Google, et voir une page qui confirme que tout marche.

**Ce qui n'est PAS dans la phase 0 :** aucune data réelle, aucune feature. Juste la plomberie.

---

## Phase 1 (MVP) — Banque + recherche IA basique (semaine 3-5)

**But :** la première vraie source de data avec une vraie utilité.

**Livrables :**
- Connecteur banque selon ta vraie source (à déterminer : CSV exports, OFX/Direct Connect, scraping de portail, ou la méthode qu'utilise déjà ton app Finance existante). **Aucun fake / sandbox / demo data.**
- Ingestion automatique des transactions bancaires (fréquence selon source)
- Stockage en event sourcing (`raw_events/bank/...`)
- Vue normalisée des transactions en DB
- Page UI "Mes finances" : timeline, filtres, recherche basique
- Recherche IA en langage naturel : "Combien j'ai dépensé en restaurant ce mois ?" → SQL gen + execution + réponse en texte
- Détection d'anomalies basique (depenses inhabituelles)
- Daily digest dans le hub
- Notifications push (ntfy.sh) pour anomalies

**Critère de succès :** tu peux poser des questions sur tes finances en français au hub, recevoir des réponses précises basées sur **TES vraies transactions** (jamais de fake), et être notifié des dépenses inhabituelles.

**Question bloquante avant cette phase :** comment ton app Finance existante (sur l'autre PC) récupère-t-elle tes données bancaires aujourd'hui ? On reprend cette méthode dans le hub.

**Effort estimé :** 2-3 semaines de mon côté, ~2-3h/semaine de ton côté pour valider et tester.

---

## Phase 2 — Localisation Google Maps Timeline + intégration de ton app trajets (semaine 6-8)

**But :** faire arriver la 2e source data + premier exemple d'app intégrée versionnée.

**Livrables :**
- Connecteur Google Takeout (export Timeline) + parsing
- Stockage des points GPS, des activités, des lieux visités
- Ingestion de ton app existante "trajets Google Earth" (depuis l'autre PC, push GitHub)
- Adaptation de l'app pour qu'elle consomme l'API de données du hub (au lieu de ses propres fichiers)
- Démo du versioning : ton app trajets en `v1` (version originale, juste portée) et `v2` (avec layout amélioré ou nouvelles features)
- Page hub "Mes trajets" qui embed l'app via iframe + permet de naviguer entre versions
- Recherche IA : "Où étais-je le 12 janvier ?", "Combien de km en avril ?"

**Critère de succès :** tu peux switcher entre v1 et v2 de ton app trajets dans le hub, et l'IA répond aux questions de localisation.

---

## Phase 3 — Emails Gmail + photos (semaine 9-12)

**But :** gros volumes de données + capacités multimodales (CLIP, OCR, reconnaissance faciale).

**Livrables :**
- OAuth Google + ingestion Gmail (API ou IMAP)
- Index full-text + sémantique des emails
- Extraction structurée : factures, abos, expéditeurs récurrents
- Ingestion Google Photos via Takeout (la library API est limitée maintenant)
- OCR (EasyOCR) sur toutes les photos
- Embeddings CLIP pour recherche sémantique d'image
- Reconnaissance faciale (InsightFace) avec UI pour nommer les visages détectés
- Recherche unifiée : "trouve l'email du syndic", "photo de Paul à la plage"
- Page hub "Search Everything" avec multi-sources

**Critère de succès :** tu peux faire des recherches qui croisent emails + photos + finances dans le même UI, et trouver des choses précises rapidement.

---

## Phase 4 — Intégration de ton app finance + agents pro-actifs (semaine 13-15)

**But :** finir l'intégration des apps existantes + faire tourner le hub en mode "assistant qui vit sa vie".

**Livrables :**
- Push de ton app finance depuis l'autre PC, adaptation au data layer du hub
- Versioning v1/v2/v3 de l'app finance dans le hub
- Agents schedulés : tous les soirs, le hub analyse ta journée et te prépare un brief
- Détection d'abos doublons, hausses inattendues, opportunités de placement (passif)
- Insights croisés : "tes dépenses transport sont +20% ce mois, peut-être lié au déplacement à Seattle vu la timeline"

**Critère de succès :** chaque matin tu reçois un brief intelligent qui croise plusieurs sources de data.

---

## Phase 5+ — Le reste (mois 4+)

Selon priorités du moment. Sources restantes à intégrer :
- Calendrier & contacts Google
- Documents (PDFs, factures, contrats) avec OCR + classification
- Réseaux sociaux & navigation (Twitter export, YouTube watch history, Spotify)
- Santé & fitness (Apple Health export, Google Fit, Strava)
- Communications (SMS via export, WhatsApp via export)
- Contrôles avancés : multi-utilisateur, partage sélectif, dead-man-switch

---

## Ce que je te demande pour démarrer la Phase 0

1. **Compte GitHub** : tu en as un ? Si non, on en crée un ensemble. Username préféré ?
2. **Domaine perso** : tu veux acheter un domaine (ex: `marc-hub.com`, ~10$/an) ou utiliser un sous-domaine Cloudflare gratuit (`marc.trycloudflare.com`) ?
3. **Choix de l'UI** : tu attends mes mockups pour décider — je te les livre dans la foulée.
4. **Validation des 10 décisions archi** du document d'audit — tu valides ou tu veux discuter quelque chose ?

---

## Estimations de temps réalistes

- **Phase 0** (foundations) : 1-2 semaines de mon côté, 1-2h/semaine de ta validation/setup local
- **Phase 1** (banque + IA) : 2-3 semaines + 2-3h/semaine de ton côté
- **Phase 2** (localisation + app trajets) : 2-3 semaines + 3-4h/semaine de ton côté (ingestion + tests)
- **Phase 3** (emails + photos) : 3-4 semaines (gros volume, plus de complexité)
- **Phase 4** (app finance + agents) : 2-3 semaines

**Total MVP utile (Phase 0 + Phase 1) : 4-7 semaines**
**Total roadmap principale (Phase 0 → 4) : 12-15 semaines**

C'est une estimation sérieuse, pas un wish-list.
