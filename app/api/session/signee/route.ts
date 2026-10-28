// app/api/session/signee/route.ts — contrôle du cookie de session signé (ES256), pour le propriétaire.
//
//   GET /api/session/signee
//     200 { etat: "valide" | "absent" | "invalide" | "non-configure", kid?, expireLe? }
//     401 pas de session · 404 connecté mais pas le propriétaire · 429 trop vite
//
// Derrière la session (jamais dans les exclusions du middleware). `no-store`. Ne rend jamais le
// cookie ni une clé : seulement son état (lib/sessionSigneeControle.ts).

import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { NOM_COOKIE_SESSION_SIGNEE } from "@/lib/sessionSignee";
import { controlerSessionSignee } from "@/lib/sessionSigneeControle";

export const dynamic = "force-dynamic";

const ENTETES = { "cache-control": "no-store" } as const;
const limiteur = creerLimiteur({ max: 30, fenetreMs: 60_000 });

export async function GET(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const email = (await auth())?.user?.email;
  if (!email) {
    return Response.json({ error: "unauthorized", message: "Session invalide." }, { status: 401, headers: ENTETES });
  }
  if (!isAuthorizedEmail(email, process.env.AUTHORIZED_EMAIL)) {
    return Response.json({ error: "not_found", message: "Introuvable." }, { status: 404, headers: ENTETES });
  }

  const cookie = (await cookies()).get(NOM_COOKIE_SESSION_SIGNEE)?.value;
  return Response.json(await controlerSessionSignee(cookie, email), { headers: ENTETES });
}
