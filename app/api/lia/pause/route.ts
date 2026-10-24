// app/api/lia/pause/route.ts — l'interrupteur « LIA en pause », gardé par le serveur du hub.
//
//   GET /api/lia/pause   → 200 { pause, modifieLe }
//   PUT /api/lia/pause   corps : { "pause": true | false } → 200 { pause, modifieLe } · 400 / 413 corps refusé
//   503 : base absente ou illisible (jamais « pas en pause » par défaut) · 401 : pas de session · 403 : invité · 429 : trop vite
//
// Tant que la pause est posée, `POST /api/lia/ask` rend 423 SANS appeler MemoryAI, pour la page du hub comme pour les apps
// (`app/api/lia/ask/route.ts`). La route reste DERRIÈRE le garde du hub (aucune exception dans `lib/authGuard.ts`) et se
// garde encore seule : session, accès au hub, puis propriétaire. Un invité ne lit ni ne change la pause (403).

import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { lireCorpsPause } from "@/lib/liaPause";
import { ecrirePause, lirePause } from "@/lib/liaPauseDb";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { assurerMigrations } from "@/lib/migrations";
import { aAcces, APP_HUB } from "@/lib/personnes";

export const dynamic = "force-dynamic";

/** La page relit la pause à l'occasion ; 60 par minute laissent de la marge à plusieurs onglets. */
const limiteur = creerLimiteur({ max: 60, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

/** `undefined` = pas de session ou pas d'accès (401) ; `"invite"` = connecté mais pas le propriétaire (403). */
async function appelant(): Promise<"proprietaire" | "invite" | undefined> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return undefined;
  // La liste des invités vit en base : on s'assure du schéma avant de la lire (lib/migrations.ts).
  await assurerMigrations();
  if (!(await aAcces(email, APP_HUB))) return undefined;
  return isAuthorizedEmail(email, process.env.AUTHORIZED_EMAIL) ? "proprietaire" : "invite";
}

async function garde(req: Request): Promise<Response | null> {
  const debit = limiteur.verifier(cleClient(req.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);
  const qui = await appelant();
  if (!qui) return erreur(401, "unauthorized", "Session invalide.");
  if (qui === "invite") return erreur(403, "forbidden", "La pause de LIA est réservée au propriétaire.");
  return null;
}

export async function GET(req: Request): Promise<Response> {
  const refus = await garde(req);
  if (refus) return refus;
  const etat = await lirePause();
  if (etat === "indisponible") return erreur(503, "unavailable", "La pause de LIA est illisible.");
  return Response.json(etat, { headers: ENTETES });
}

export async function PUT(req: Request): Promise<Response> {
  const refus = await garde(req);
  if (refus) return refus;
  const lu = lireCorpsPause(await req.text());
  if (!lu.ok) return erreur(lu.status, lu.error, lu.message);
  const etat = await ecrirePause(lu.pause);
  if (etat === "indisponible") return erreur(503, "unavailable", "La pause de LIA n'a pas pu être enregistrée.");
  return Response.json(etat, { headers: ENTETES });
}
