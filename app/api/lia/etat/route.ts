// app/api/lia/etat/route.ts — l'état partagé de LIA, relayé à MemoryAI.
//
//   GET /api/lia/etat   → 200 + l'état, ou 204 s'il n'y en a aucun
//   PUT /api/lia/etat   corps : l'état de LIA (contrat `commun/assistant/CONTRAT-etat-lia.md`)
//                       → 200 + l'état gardé, 409 + l'état plus récent de MemoryAI, 400 / 413 corps refusé
//   503 : mémoire gelée, absente, ou réponse hors contrat · 401 : pas de session ni de jeton · 403 : invité · 429 : trop vite
//
// UNE seule LIA, un seul état (Marc, 23/10/2026) : MemoryAI le garde, la page (`etatHttp("/api/lia/etat")`,
// `components/LiaBoot.tsx`) le lit et l'écrit par ici, avec son cookie de session. Une APP (DriveAI, ADR-0069) le
// lit et l'écrit aussi, de serveur à serveur : elle présente son `x-hub-token` (l'app est identifiée par le jeton,
// jamais par le corps) et dit `x-lia-proprietaire: 1` après avoir vérifié SA session. Jeton connu sans cet en-tête :
// 403, MemoryAI n'est pas appelée ; jeton faux : 401 SANS repli sur la session ; aucun jeton : la session, comme avant.
//
// Une app n'a pas de cookie du hub : la route traverse donc le garde (`isPublicPath`, égalité stricte, comme
// `/api/lia/ask`) et se garde TOUTE SEULE, jeton ou session avec accès au hub puis propriétaire. Un invité du hub
// n'atteint JAMAIS l'état de LIA de Marc (403), et sans jeton ni session il n'y a aucun appel à MemoryAI (401).
// Jamais dans le matcher du middleware. Le chemin du jeton ne lit ni session ni base : il ne coûte rien de plus.
//
// Le hub est le seul détenteur des jetons (ADR « maison de LIA ») : il relaie avec le `HUB_TOKEN` qu'il détient
// déjà pour MemoryAI (aucun nouveau secret) et dit `x-lia-proprietaire: 1` après avoir vérifié la session. Le
// jeton n'est jamais dans une réponse. Ce qui passe dans un sens ou l'autre est jugé par `lib/liaEtatPartage.ts` :
// jamais réparé, jamais inventé.

import { HUB_TOKEN_HEADER } from "@mokarade/hub-contract";
import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { DELAI_ETAT_MS, EN_TETE_PROPRIETAIRE, lireCorpsEtat, relayerReponse, type Relais } from "@/lib/liaEtatPartage";
import { appDuJeton } from "@/lib/jetonApp";
import { assurerMigrations } from "@/lib/migrations";
import { aAcces, APP_HUB } from "@/lib/personnes";
import { SOURCE_DEFS } from "@/lib/sources";

export const dynamic = "force-dynamic";

/** LIA lit chaque minute et écrit toutes les 20 s au plus : 90 par minute laissent de la marge à plusieurs onglets. */
const limiteur = creerLimiteur({ max: 90, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

function repondre({ status, corps }: Relais): Response {
  return corps === null ? new Response(null, { status, headers: ENTETES }) : Response.json(corps, { status, headers: ENTETES });
}

/**
 * `undefined` = ni jeton ni session valides (401) ; `"invite"` = pas le propriétaire (403).
 * Un `x-hub-token` PRÉSENT est jugé seul : faux = 401, jamais de repli sur la session ; connu = l'app, qui doit dire
 * `x-lia-proprietaire: 1` après avoir vérifié sa propre session (une app a des invités, MemoryAI jamais).
 */
async function appelant(req: Request): Promise<"proprietaire" | "invite" | undefined> {
  const jeton = req.headers.get(HUB_TOKEN_HEADER);
  if (jeton !== null) {
    if (!appDuJeton(jeton)) {
      console.error("[lia/etat] jeton d'app inconnu (401)");
      return undefined;
    }
    return req.headers.get(EN_TETE_PROPRIETAIRE) === "1" ? "proprietaire" : "invite";
  }
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return undefined;
  // La liste des invités vit en base : on s'assure du schéma avant de la lire (lib/migrations.ts).
  await assurerMigrations();
  if (!(await aAcces(email, APP_HUB))) return undefined;
  return isAuthorizedEmail(email, process.env.AUTHORIZED_EMAIL) ? "proprietaire" : "invite";
}

async function relayer(req: Request, methode: "GET" | "PUT"): Promise<Response> {
  const debit = limiteur.verifier(cleClient(req.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const qui = await appelant(req);
  if (!qui) return erreur(401, "unauthorized", "Session invalide.");
  if (qui === "invite") return erreur(403, "forbidden", "L'état de LIA est réservé au propriétaire.");

  // Le corps de la page est jugé AVANT tout saut réseau : un état hors contrat n'atteint pas MemoryAI.
  let corps: string | undefined;
  if (methode === "PUT") {
    const lu = lireCorpsEtat(await req.text());
    if (!lu.ok) return erreur(lu.status, lu.error, lu.message);
    corps = JSON.stringify(lu.etat);
  }

  const memoire = SOURCE_DEFS.find((d) => d.id === "memoryai");
  const jetonMemoire = memoire ? process.env[memoire.tokenEnv]?.trim() : undefined;
  if (!memoire || !jetonMemoire) return erreur(503, "unavailable", "L'état de LIA n'est pas configuré sur le hub.");

  try {
    const r = await fetch(`${memoire.accueilUrl}/api/etat-lia`, {
      method: methode,
      headers: {
        [HUB_TOKEN_HEADER]: jetonMemoire,
        [EN_TETE_PROPRIETAIRE]: "1",
        ...(corps !== undefined && { "content-type": "application/json" }),
      },
      ...(corps !== undefined && { body: corps }),
      signal: AbortSignal.timeout(DELAI_ETAT_MS),
      cache: "no-store",
    });
    return repondre(relayerReponse(methode, r.status, await r.text()));
  } catch (e) {
    // Jamais l'état ni le jeton : seulement le type d'erreur (délai, réseau).
    console.error("[lia/etat] relais MemoryAI en échec :", e instanceof Error ? e.name : "inconnue");
    return erreur(503, "unavailable", "MemoryAI injoignable.");
  }
}

export const GET = (req: Request): Promise<Response> => relayer(req, "GET");
export const PUT = (req: Request): Promise<Response> => relayer(req, "PUT");
