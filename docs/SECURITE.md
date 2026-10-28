# Sécurité — décisions issues de l'audit du 26/09/2026

Source : rapport `hubperso-securite-0926` (0 critique, 0 élevée). Ce fichier ne garde que ce
que le code fait ou ne fait pas encore.

## Limite de débit (F2) — `lib/limiteDebit.ts`
- `POST /api/acces` : 60 requêtes par minute et par client ; `POST /api/cron/releve` : 10.
  Au-delà : `429` + `retry-after`, avant même la lecture du jeton.
- Clé du client = `x-vercel-forwarded-for`, puis `x-real-ip`, puis premier saut de `x-forwarded-for`. Mémoire bornée à 1000 clés (éviction de la plus ancienne).
- **Limite honnête** : le compteur est en mémoire de chaque instance serverless, le plafond est
  donc par instance, pas global. Aucune dépendance, aucun service payant. Le plafond global est
  le rate-limit du Vercel Firewall (gratuit) : à poser dans la console (à faire, hors code).

## `/api/acces` (F1)
Même corps `{ appId, acces }` que l'adresse existe ou non, et durée minimale de 250 ms sur
toute réponse authentifiée, pour qu'un porteur de jeton ne distingue pas « invité connu » de
« inconnu » à la durée. Un plancher réduit l'écart, il ne le prouve pas nul.

## `trustHost: true` (F4)
Conservé. Sûr sur Vercel, où la plateforme fixe l'en-tête Host. Si le hub est un jour hébergé
ailleurs, il faudra une liste d'hôtes attendus (refus d'un Host inattendu) : **non faite
maintenant**, car les préversions Vercel ont des hôtes variables et une liste trop stricte
enfermerait dehors. À reprendre avec le déploiement.

## Préversions (M2) — `vercel.json`
`git.deploymentEnabled` coupe tout (`**` et `*`, motifs minimatch de la doc Vercel : `*` ne franchit
pas `/`, d'où `**`) et rouvre la seule `main`. Aucune branche ne crée de préversion, ni `claude/*`,
`agence/**`, `dependabot/**` ni les branches `mergify/merge-queue/*` (Hubperso#160, 16/10/2026,
même règle qu'app-template). Verrou : `tests/vercelJson.test.ts`. Cela évite des préversions inutiles. **Reste à vérifier dans la
console** (par `hubperso-deploiement` ou Marc, noms seulement, jamais les valeurs) : qu'aucune
variable de production (`DATABASE_URL`, `HUB_TOKEN_*`, `CRON_SECRET`) n'est dans le scope
Preview. Le code ne peut pas le garantir.

## CSP `'unsafe-inline'` (F3)
Choix documenté dans `next.config.mjs` : aucune ressource externe, `connect-src 'self'`,
`frame-ancestors 'none'`. Un nonce est envisageable quand le lot CSP de l'Atelier le
généralisera. Rien de changé ici.

## Clé de signature de la session (chantier auth-asym)
Plan : `plan-auth-asym-hubperso.md` (Option A). Le cookie de session partagé est un JWS
**ES256** `__Secure-hub.session` : Hubperso SEUL détient la clé privée et signe
(`lib/sessionSignee.ts`, posé par `middleware.ts`) ; JobAI, CarAI, MemoryAI et FinanceAI ne
reçoivent que la clé publique et vérifient, sans pouvoir fabriquer de session. **Sans
`HUB_SESSION_PRIVATE_JWK` (et `AUTH_COOKIE_DOMAIN`), le hub n'émet rien** : le cookie chiffré
d'Auth.js reste la référence. Une fois émis : durée 30 jours, re-signé à mi-vie ou à la
rotation de clé, effacé à la déconnexion du hub et dès que sa session n'est plus valide.
⚠️ Une app qui accepte ce cookie doit l'effacer à SA déconnexion aussi, sinon elle reste
ouverte jusqu'à son expiration.

### Où va chaque clé
| Clé | Où | Variable | Type Vercel |
|---|---|---|---|
| PRIVÉE (JWK, champ `d`) | projet `hubperso` UNIQUEMENT | `HUB_SESSION_PRIVATE_JWK` | Sensible, Production seulement |
| PUBLIQUE (JWKS d'une ou deux clés) | hub ET les satellites | `HUB_SESSION_PUBLIC_KEYS` | Normale, Production seulement |

Jamais dans le dépôt, jamais dans Preview/Development (comme `AUTH_COOKIE_DOMAIN`), jamais dans
un message, un journal ou une capture. Le `kid` (empreinte RFC 7638 de la clé publique)
identifie la clé dans l'en-tête du jeton : c'est lui qui permet de faire coexister deux clés
pendant une rotation.

### Générer (Marc, en local, une fois)
1. `npm run cle-session` dans une copie du dépôt Hubperso (Node seul, aucun réseau).
2. Le script affiche le `kid` et le JWKS PUBLIC sur une ligne. Il écrit la clé privée dans un
   fichier du dossier temporaire du système, hors dépôt, en création exclusive (il n'écrase
   jamais un fichier existant). Le script REFUSE un fichier de sortie situé dans le dépôt.
3. Vercel, projet `hubperso` : créer `HUB_SESSION_PRIVATE_JWK` (Sensible) avec le CONTENU du
   fichier. Puis **supprimer le fichier** aussitôt (sous Windows le mode 0600 ne protège pas :
   le fichier hérite des droits du dossier).
4. Créer `HUB_SESSION_PUBLIC_KEYS` avec la ligne affichée (forme `{"keys":[{"kty":"EC","crv":"P-256","x":"…","y":"…","kid":"…"}]}`), dans le hub et dans chaque app qui vérifie le cookie signé `__Secure-hub.session`.
5. Redéployer. ⚠️ Un changement de variable sans commit ne déclenche PAS de build
   (`build-necessaire.sh`, BACKLOG H-18) : forcer un déploiement.
Le script n'affiche jamais la clé privée ; s'il l'affichait un jour, c'est un bug à signaler
(un test le vérifie : `tests/cleSession.test.ts`).

### Vérifier que le hub émet bien le cookie
Connecté en propriétaire, ouvrir `https://www.hubperso.com/api/session/signee` : `{"etat":"valide","kid":"…"}`
avec le même `kid` que celui affiché à la génération. `non-configure` = `HUB_SESSION_PUBLIC_KEYS` absente du
hub ; `absent` = le hub n'a pas encore posé le cookie (clé privée absente, ou pas de navigation depuis la
pose) ; `invalide` = signé par une autre clé ou pour une autre adresse. La route ne rend jamais le cookie.

### Faire tourner la clé (rotation)
1. `npm run cle-session -- --garder '<JWKS actuel>'` : génère une NOUVELLE paire et affiche un
   JWKS à deux clés (l'ancienne + la nouvelle). Le script refuse un `kid` déjà présent et un
   JWKS qui contiendrait une clé privée.
2. Poser ce JWKS à deux clés partout et redéployer : les satellites acceptent maintenant les
   deux `kid`.
3. Remplacer `HUB_SESSION_PRIVATE_JWK` du hub par la nouvelle clé privée, redéployer : le hub
   signe avec la nouvelle.
4. Attendre la durée de vie maximale du cookie, puis retirer l'ancienne clé publique du JWKS
   (partout) et redéployer. Supprimer le fichier de la clé privée.
Rotation d'urgence (privée fuitée) : sauter l'attente de l'étape 4 — toutes les sessions
signées par l'ancienne clé tombent, chacun se reconnecte une fois.

### Ce que cette clé ne protège pas
Elle empêche de FORGER une session. Elle n'empêche pas une app compromise de VOLER puis
rejouer le cookie d'un utilisateur qui la visite (limite du plan, §3).
