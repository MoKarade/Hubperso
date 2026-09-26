# Sécurité — décisions issues de l'audit du 26/09/2026

Source : rapport `hubperso-securite-0926` (0 critique, 0 élevée). Ce fichier ne garde que ce
que le code fait ou ne fait pas encore.

## Limite de débit (F2) — `lib/limiteDebit.ts`
- `POST /api/acces` : 60 requêtes par minute et par client ; `POST /api/cron/releve` : 10.
  Au-delà : `429` + `retry-after`, avant même la lecture du jeton.
- Clé du client = premier saut de `x-forwarded-for` (posé par Vercel).
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
`git.deploymentEnabled` refuse maintenant `claude/*`, `agence/**` et `dependabot/**` (motifs
minimatch, vérifiés dans la doc Vercel : `*` ne franchit pas `/`, d'où `**` pour
`agence/<session>/<sujet>`). Cela évite des préversions inutiles. **Reste à vérifier dans la
console** (par `hubperso-deploiement` ou Marc, noms seulement, jamais les valeurs) : qu'aucune
variable de production (`DATABASE_URL`, `HUB_TOKEN_*`, `CRON_SECRET`) n'est dans le scope
Preview. Le code ne peut pas le garantir.

## CSP `'unsafe-inline'` (F3)
Choix documenté dans `next.config.mjs` : aucune ressource externe, `connect-src 'self'`,
`frame-ancestors 'none'`. Un nonce est envisageable quand le lot CSP de l'Atelier le
généralisera. Rien de changé ici.
