# HANDOVER — Authentification du hub (Google, une seule adresse)

## État

Le hub est désormais **privé** : login Google via Auth.js (NextAuth v5), restreint à
une **seule adresse** (`AUTHORIZED_EMAIL` = `marc.richard4@gmail.com`). Tout autre compte
Google est refusé (aucune session). Couche **additive** : le dashboard, les widgets, le
contrat et les jetons `HUB_TOKEN_*` sont inchangés.

Vérifs vertes en local : `npm run typecheck`, `npm run test` (42 tests), `npm run lint`,
`npm run build`.

### Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `auth.ts` | Config Auth.js : provider Google, session JWT, callback `signIn` (filtre email), `pages` → `/login`. |
| `lib/authorized.ts` | Filtre email pur `isAuthorizedEmail` (lower-case + trim). Testé. |
| `lib/authGuard.ts` | Décision du middleware (`isPublicPath`, `decideGuard`), pure et testée. |
| `middleware.ts` | Garde global : pages non authentifiées → `/login`, `/api/*` → 401 JSON. |
| `app/api/auth/[...nextauth]/route.ts` | Handlers Auth.js (`/api/auth/*`). |
| `app/login/page.tsx` | Page de login (bouton Google, message « Accès non autorisé »). |
| `components/SignOutButton.tsx` | Déconnexion discrète dans le header. |
| `app/page.tsx` | Garde `auth()` en tête (défense en profondeur) + bouton de déconnexion. |
| `tests/authorized.test.ts`, `tests/authGuard.test.ts` | Tests unitaires du filtre et de la garde. |
| `.env.example`, `README.md`, `CLAUDE.md` | Documentation des variables et du fonctionnement. |

## Déploiement Vercel (à faire par Marc)

1. **Poser les 5 variables** dans Vercel (Project → Settings → Environment Variables),
   Production **et** Preview :
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `AUTH_SECRET` (générer : `npx auth secret` ou `openssl rand -base64 32`)
   - `AUTHORIZED_EMAIL` = `marc.richard4@gmail.com`
   - `AUTH_URL` — **optionnelle** (la config utilise `trustHost`). À poser seulement pour
     forcer le domaine canonique en prod : `https://hubperso.com` (avec le protocole).

   > Les jetons des apps (`HUB_TOKEN_FINANCEAI`, `HUB_TOKEN_DRIVEAI`, …) restent tels
   > quels, inchangés.

2. **Vérifier les redirect URIs Google** (Cloud Console, client OAuth "Web application") :
   ```
   https://hubperso.com/api/auth/callback/google
   https://<projet>.vercel.app/api/auth/callback/google
   http://localhost:3000/api/auth/callback/google
   ```

3. **Redéployer**, puis **tester le login sur l'URL `.vercel.app`** :
   - accès sans session → redirection `/login` ;
   - bouton Google + `marc.richard4@gmail.com` → accès au hub ;
   - tout autre compte Google → refus (« Accès non autorisé — ce hub est privé »).

4. **Rebrancher `hubperso.com`** une fois le login validé sur `.vercel.app`.

## Note Cloudflare Access

Le hub a maintenant sa **propre** authentification applicative. Cloudflare Access (Google
OAuth + MFA) peut rester devant comme couche réseau additionnelle, mais n'est plus la
seule barrière : même sans elle, aucune donnée n'est servie sans session valide.
