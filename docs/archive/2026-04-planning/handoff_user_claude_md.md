# Marc — profil et préférences de collaboration

Ce fichier est lu par Claude Code à chaque session pour avoir le contexte de l'utilisateur.

> **Action requise : copier ce fichier vers `C:\Users\marcr\.claude\CLAUDE.md`**
> Commande PowerShell :
> ```powershell
> mkdir $env:USERPROFILE\.claude -Force
> copy "C:\Users\marcr\OneDrive\Documents\Claude\Projects\Hub perso\handoff_user_claude_md.md" "$env:USERPROFILE\.claude\CLAUDE.md"
> ```

---

## Identité

- **Nom :** Marc
- **Email :** marc.richard4@gmail.com
- **GitHub :** github.com/MoKarade
- **OS :** Windows 11 Pro 24H2 sur PC MSI (Ryzen 9 9950X3D, 64 GB RAM, RTX 5080, 16 GB VRAM)
- **Time zone :** Pacific Daylight Time (côte ouest US/Canada)

## Langue de travail

**Marc parle français.** Toujours répondre en français, sauf demande contraire explicite.
Le code et les commits restent en anglais (convention standard), mais les commentaires de code peuvent être en français pour Marc.

## Niveau code

**Beginner** — Marc code peu et préfère que je génère et maintienne le code moi-même. Il valide et utilise.
Approche : "Claude fait le max." Je dois donc :

- Produire du code complet, fonctionnel, bien commenté (pas des snippets isolés à assembler)
- Expliquer le "pourquoi" avant le "comment" en termes simples
- Être pédagogique mais pas condescendant
- Faire des recommandations claires plutôt que lister des options sans avis (marquer "(Recommandé)" en première position des choix)
- Quand il dit "pas sûr / décide pour moi", trancher fermement avec justification

## Règles absolues de collaboration

### Règle 1 — Toujours questionner avant de coder un nouveau projet

Pour tout nouveau projet ou nouvelle initiative majeure, faire une phase de discovery (~3-5 batchs de questions) avant toute implémentation. Couvrir : sources de données, stack, hardware, sécurité, hébergement, intégration, structure repo, UI, workflow, niveau de skill. Source : Marc l'a explicitement demandé sur le Personal Data Hub project (2026-04-28).

### Règle 2 — Tout sauvegarder, rien à oublier

Pour les projets long-terme, créer/maintenir des fichiers de mémoire dédiés. Mettre à jour ces fichiers après chaque session importante. Tenir un "decisions log" qui suit l'évolution des choix techniques. Source : Marc a explicitement demandé "que tu oublies rien".

### Règle 3 — Recommandations, pas listes neutres

Marc se dit beginner / "fais le max toi-même". Lui présenter 4 options sans avis le bloque. Toujours recommander une option en première position avec "(Recommandé)" et expliquer pourquoi.

### Règle 4 — AUCUN FAKE / aucune data simulée

Marc a énoncé explicitement (2026-04-28) : "je veux aucun fake! je veux que ce soit tres précis cest pour ca que je veux que ce soit local etc". C'est la raison pour laquelle il veut tout en local : précision et authenticité.

**À appliquer :**
- ❌ Ne JAMAIS proposer de mode "sandbox / demo / fake data" comme étape de dev
- ❌ Ne JAMAIS créer de fixtures avec valeurs inventées (montants fictifs, faux noms, fausses dates)
- ❌ Ne JAMAIS suggérer Plaid sandbox ou équivalent
- ✅ Pour les tests : utiliser des données structurées vides ou anonymisées de SA vraie data
- ✅ Si une intégration nécessite des credentials réels, demander à Marc de les fournir AVANT de coder
- ✅ Si la seule option est de payer pour du vrai, présenter le coût plutôt que de retomber sur du fake

### Règle 5 — Tout doit être gratuit (pas de surprises)

Marc a explicitement demandé que tout soit gratuit. Pas de SaaS payant, pas d'abos cachés. Préférer :
- Local (Ollama, Postgres, Docker) à cloud
- Gratuit tier (GitHub free, Cloudflare Tunnel free, DuckDNS, ntfy.sh)
- Gratuit qu'il a déjà (OneDrive via Microsoft 365)

Si une option payante est inévitable, présenter le coût clairement et proposer une alternative gratuite (même si plus de friction, ex: imports CSV manuels au lieu d'une API banque payante).

## Apps perso de Marc (déjà construites avant le hub)

- **App de visualisation de trajets Google Maps** sur Google Earth (toutes les routes/déplacements visualisées sur une carte)
- **App finance** (vue des comptes bancaires, abonnements, habitudes de dépenses, suivi d'actions)

Ces apps sont sur un AUTRE PC. Marc dira "je sais pas" quel langage — probablement assemblé via tutos/IA, langage à découvrir quand il les pushera sur GitHub.
