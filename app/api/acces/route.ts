// app/api/acces/route.ts — la seule question que le hub répond aux autres apps.
//
//   POST /api/acces      en-tête : x-hub-token (le jeton de l'app appelante)
//                        corps   : { "email": "…" }
//   → 200 { "appId": "batchchef", "acces": true }
//
// L'app connaît déjà l'adresse : elle décode le cookie de session partagé avec le même
// AUTH_SECRET (voir docs/CONNEXION-UNIQUE.md). Ce qu'elle ne peut pas savoir seule, c'est
// si CETTE adresse a le droit d'entrer CHEZ ELLE — cette liste vit dans le hub, pour
// pouvoir inviter quelqu'un sur BatchChef sans lui ouvrir JobAI, et sans redéployer.
//
// POURQUOI POST ET PAS GET
// L'adresse voyage dans le CORPS, pas dans l'URL. Une URL se retrouve dans les journaux
// d'accès de Vercel et de tout intermédiaire ; l'adresse courriel des personnes invitées
// n'a rien à y faire. Le corollaire (pas de cache HTTP) est voulu : l'appelant met en
// cache une minute côté client, une révocation prend effet au plus tard une minute après.
//
// POURQUOI CETTE ROUTE N'EST PAS DERRIÈRE LA SESSION
// C'est un appel de SERVEUR À SERVEUR : il n'y a pas de navigateur, donc pas de cookie de
// session à présenter. La garder derrière la middleware la rendrait inutilisable. Elle a
// sa propre authentification, du même genre que celle que chaque app applique à son
// `/hub/summary` : un secret partagé, comparé à temps constant, qui identifie l'appelant.
// C'est déclaré une seule fois dans `isPublicPath` (lib/authGuard.ts) — et « public pour
// la middleware » n'y veut pas dire « ouvert » : sans jeton valide, cette route ne répond
// que 401.

import { HUB_TOKEN_HEADER } from "@mokarade/hub-contract";
import { appDuJeton } from "@/lib/jetonApp";
import { aAcces } from "@/lib/personnes";
import { assurerMigrations } from "@/lib/migrations";

/** Jamais de mise en cache : une révocation ne doit pas survivre dans un intermédiaire. */
const ENTETES = { "cache-control": "no-store" } as const;

export async function POST(req: Request): Promise<Response> {
  const appId = appDuJeton(req.headers.get(HUB_TOKEN_HEADER));
  if (!appId) {
    // Volontairement avare : ni « jeton inconnu », ni « app inconnue ». Un appelant
    // légitime a son jeton ; un autre n'apprend rien de la réponse.
    return Response.json(
      { error: "unauthorized", message: "Jeton d'app absent ou invalide." },
      { status: 401, headers: ENTETES },
    );
  }

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return Response.json(
      { error: "bad_request", message: "Corps JSON attendu : { \"email\": \"…\" }." },
      { status: 400, headers: ENTETES },
    );
  }

  const email =
    typeof corps === "object" && corps !== null && "email" in corps
      ? (corps as { email?: unknown }).email
      : undefined;

  if (typeof email !== "string" || !email.trim()) {
    return Response.json(
      { error: "bad_request", message: "Champ `email` manquant." },
      { status: 400, headers: ENTETES },
    );
  }

  // Sans base configurée, cet appel ne fait rien (voir lib/migrations.ts) ; avec, il
  // garantit que la table existe avant la première lecture, sans commande à lancer.
  await assurerMigrations();

  const acces = await aAcces(email, appId);
  return Response.json({ appId, acces }, { headers: ENTETES });
}
