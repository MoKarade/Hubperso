// lib/authGuard.ts
//
// ⚠️ 01/09/2026 — une variable d'environnement (secret OAuth Google) changée sur Vercel
// sans aucun commit de CODE derrière n'a jamais été reconstruite : `build-necessaire.sh`
// ne voit que le diff git, jamais la configuration Vercel, donc « Redeploy » sur un
// commit de doc annule le build (« build ignoré : documentation et tests uniquement »)
// et le site continue de servir l'ancien secret. Vu en BACKLOG.md (H-18) — angle mort
// du script, pas un geste à corriger ici.
//
// Logique de garde du middleware, isolée en fonctions pures pour être testable sans
// mocker tout NextAuth. Deux responsabilités :
//   - `isPublicPath` : ce qui reste accessible sans session (doit rester aligné avec le
//     matcher du middleware) ;
//   - `decideGuard` : que faire d'une requête protégée non authentifiée (401 pour une
//     route API, redirection vers /login pour une page).

export type GuardDecision =
  | { type: "next" }
  | { type: "unauthorized" }
  | { type: "redirect"; location: string };

/** Routes toujours publiques : Auth.js, page de login, assets statiques de Next. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  // Pages légales publiques (confidentialité, conditions), exigées par la vérification
  // Google OAuth (Test → Production) : elles doivent rester lisibles sans session, y
  // compris par le robot de revue de Google qui n'en a pas. Même mécanisme que /login —
  // JAMAIS une exclusion du matcher de middleware.ts (CLAUDE.local.md). Elles n'affichent
  // aucune donnée personnelle : composant générique, texte statique.
  if (pathname === "/confidentialite" || pathname.startsWith("/confidentialite/")) return true;
  if (pathname === "/conditions" || pathname.startsWith("/conditions/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  // POST /api/acces : appel de SERVEUR À SERVEUR (une app demande si une adresse a accès
  // chez elle). Aucun navigateur, donc aucun cookie de session à présenter — la garder
  // derrière la session la rendrait inutilisable.
  //
  // « Public pour la middleware » ne veut PAS dire « ouverte » : la route exige un
  // `x-hub-token` d'app valide, comparé à temps constant, et ne répond que 401 sans lui
  // (app/api/acces/route.ts). C'est le même genre d'authentification que celle que chaque
  // app applique à son propre `/hub/summary`.
  //
  // ⚠️ Elle est ici plutôt que dans le matcher du middleware (CLAUDE.md : ne jamais ajouter
  // une route aux exclusions du matcher). La requête continue donc de traverser la
  // middleware — le refus global quand l'auth n'est pas configurée s'applique toujours.
  if (pathname === "/api/acces") return true;

  // POST /api/cron/releve : l'HORLOGE du hub, appelée par un workflow GitHub Actions
  // (.github/workflows/releve.yml). Deuxième route dans ce cas, et pour exactement la même
  // raison que ci-dessus : un workflow n'a pas de cookie de session à présenter.
  //
  // Elle n'est pas ouverte non plus : elle exige `Authorization: Bearer <CRON_SECRET>`,
  // comparé à temps constant, et répond 401 sans lui / 503 si le secret n'est pas configuré
  // (lib/cronAuth.ts). Le secret est DÉDIÉ et non un `HUB_TOKEN_*` d'app : ce qu'elle
  // déclenche est une écriture dans la mémoire du hub, un pouvoir qu'aucune app n'a de
  // raison d'avoir.
  //
  // ⚠️ Il y a donc DEUX exceptions, plus une seule. Le CLAUDE.md a longtemps écrit « c'est
  // la SEULE exception » ; il est corrigé en même temps que cette ligne, parce qu'une règle
  // qu'on sait fausse cesse d'être lue comme une règle. Ce qui n'a PAS changé, et qui est
  // le vrai garde-fou : le matcher du middleware ne gagne aucune exclusion (leçon n°4).
  if (pathname === "/api/cron/releve") return true;

  // POST /api/lia/ask : la question de LIA, relayée à MemoryAI. Appelée par les APPS (serveur à
  // serveur, `x-hub-token`) et par l'accueil (session). Elle traverse le garde pour laisser passer
  // le jeton, et se garde donc TOUTE SEULE : jeton valide ou session avec accès au hub, sinon 401
  // (app/api/lia/ask/route.ts). Jamais dans le matcher du middleware.
  if (pathname === "/api/lia/ask") return true;

  // GET|PUT /api/lia/etat : l'état partagé de LIA, relayé à MemoryAI. Même raison que /api/lia/ask : une app
  // (DriveAI, ADR-0069) le lit et l'écrit de serveur à serveur avec son `x-hub-token`, sans cookie du hub. La
  // route se garde TOUTE SEULE : jeton valide + `x-lia-proprietaire: 1`, ou session avec accès au hub ET propriétaire,
  // sinon 401 / 403 (app/api/lia/etat/route.ts). Égalité STRICTE, jamais le matcher du middleware (leçon n°4).
  if (pathname === "/api/lia/etat") return true;

  // POST /api/gantt : le PC de Marc y ENVOIE le relevé du Gantt (tour.py, toutes les 10 min).
  // Troisième route de serveur à serveur, même raisonnement : pas de cookie de session. Elle
  // exige `Authorization: Bearer <GANTT_SECRET>`, secret DÉDIÉ comparé à temps constant, et
  // répond 401 sans lui / 503 si le secret n'est pas configuré (app/api/gantt/route.ts).
  // Égalité STRICTE, jamais un préfixe, et jamais le matcher du middleware (leçon n°4).
  if (pathname === "/api/gantt") return true;

  // GET/POST /api/chantier/gestes/pc : le PC y LIT les gestes de l'onglet « À toi » (GET) et y
  // ACCUSE ceux qu'il a pris (POST). Quatrième route de serveur à serveur : même secret DÉDIÉ que
  // /api/gantt (`GANTT_SECRET`, Bearer, temps constant, 503 si absent, 401 si faux), égalité
  // STRICTE et jamais le matcher du middleware. Le dépôt des gestes (/api/chantier/gestes) reste,
  // lui, derrière la session.
  if (pathname === "/api/chantier/gestes/pc") return true;

  // GET /api/chantier/notes-lia : le PC y LIT le nombre de notes de LIA que le coordinateur n'a pas lues
  // (le hub lit le résumé de MemoryAI avec le HUB_TOKEN qu'il détient déjà). Cinquième route de serveur à
  // serveur : même secret DÉDIÉ (`GANTT_SECRET`, Bearer, temps constant, 503 si absent, 401 si faux),
  // égalité STRICTE et jamais le matcher du middleware. Elle ne rend qu'un nombre, jamais un contenu.
  if (pathname === "/api/chantier/notes-lia") return true;

  // POST /api/chantier/evenement : GitHub y ENVOIE ses événements (webhook : CI, déploiement, PR, issues) pour la page
  // Chantier. Sixième route de serveur à serveur, et la seule signée par l'ÉMETTEUR : `X-Hub-Signature-256`, HMAC SHA-256 du
  // corps avec un secret DÉDIÉ (`CHANTIER_WEBHOOK_SECRET`), comparé à temps constant ; 503 si le secret est absent, 401 si la
  // signature est fausse (app/api/chantier/evenement/route.ts). Égalité STRICTE, jamais le matcher du middleware.
  if (pathname === "/api/chantier/evenement") return true;

  // GET /api/sante : la sonde de santé de la vigie de l'Atelier (patron JobAI#49 /
  // BatchChef#154). TROISIÈME route qui traverse le garde, et la seule SANS aucune
  // authentification — délibérément : elle ne rend que `{ ok, cause }`, jamais une donnée,
  // un message brut ni un nom de variable. Derrière la garde, la vigie recevrait un 401 au
  // lieu d'un diagnostic et ne verrait JAMAIS une panne de base. Même mécanisme que les deux
  // ci-dessus : ici, jamais dans le matcher. `tests/gardePages.test.ts` la range dans une
  // catégorie à part (ROUTES_PUBLIQUES_MUETTES) et vérifie qu'elle n'importe aucun module
  // de données.
  if (pathname === "/api/sante") return true;

  // GET /api/cout : le coût API cumulé des apps, pour le relevé du suivi du projet (#191),
  // qui n'a aucun jeton. QUATRIÈME route qui traverse le garde, SANS authentification, et la
  // seule à rendre une donnée : un total en dollars, son heure de mesure et les identifiants
  // (publics) des apps — rien par app, rien de personnel (lib/coutCumule.ts). Oui de Marc,
  // 16/10/2026. Même mécanisme que les autres : ici, jamais dans le matcher.
  // `tests/gardePages.test.ts` la range dans ROUTES_PUBLIQUES_AGREGAT.
  if (pathname === "/api/cout") return true;
  if (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  ) {
    return true;
  }
  // Fichier avec extension (svg, png, css, …) → asset public.
  const lastSegment = pathname.split("/").pop() ?? "";
  return lastSegment.includes(".");
}

/**
 * Décide du sort d'une requête. `isAuthenticated` vient de la session Auth.js.
 * Une requête publique OU authentifiée passe ; sinon : 401 pour /api/*, redirection
 * vers /login (avec callbackUrl) pour une page.
 */
export function decideGuard(params: {
  isAuthenticated: boolean;
  pathname: string;
  search?: string;
}): GuardDecision {
  const { isAuthenticated, pathname, search = "" } = params;

  if (isPublicPath(pathname) || isAuthenticated) return { type: "next" };

  if (pathname.startsWith("/api/")) return { type: "unauthorized" };

  const callbackUrl = encodeURIComponent(pathname + search);
  return { type: "redirect", location: `/login?callbackUrl=${callbackUrl}` };
}
