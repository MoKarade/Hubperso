// app/api/session/moi/route.ts — « cette session est-elle celle du propriétaire ? », pour une app sans session serveur.
//
//   GET /api/session/moi   cookie de session du hub
//   → 200 { "proprietaire": true | false }   (false : connecté, mais pas le propriétaire)
//   → 401 { "error": "unauthorized" }        (pas de session)
//
// POURQUOI (FinanceAI#1159, Marc 28/10/2026). FinanceAI est une SPA Vite sur Vercel, sans Auth.js ni `AUTH_SECRET` : elle ne
// sait pas lire le cookie chiffré du hub, et le cookie signé ES256 que ses satellites liront plus tard n'est pas encore émis
// (phase 2 de la session asymétrique). Plutôt que de copier un secret dans une app de plus, le middleware de FinanceAI
// TRANSMET ce cookie au hub, qui le lit avec ce qu'il détient déjà, et il décide selon `proprietaire`. Aucun secret ne sort
// du hub, aucune variable n'est à poser côté app.
//
// CE QUE LA ROUTE RÉPOND, ET RIEN D'AUTRE : un booléen sur la session de L'APPELANT. Ni l'adresse, ni la liste des invités,
// ni un nom de variable. Elle reste DERRIÈRE le garde du hub (aucune exception dans `lib/authGuard.ts`, jamais le matcher
// de `middleware.ts`) et se garde encore seule : `auth()` sans adresse = 401. Le propriétaire se reconnaît SANS base ni réseau
// (`AUTHORIZED_EMAIL`) : la route ne touche pas Neon. `AUTHORIZED_EMAIL` absent = personne n'est propriétaire (échec fermé).
// Pas de cache : une session révoquée ne doit pas survivre dans un intermédiaire.

import { auth } from "@/auth";
import { isAuthorizedEmail } from "@/lib/authorized";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";

export const dynamic = "force-dynamic";

/** L'app met un « oui » en cache une minute côté serveur : quelques appels par minute en usage normal, 300 laissent de la marge. */
const limiteur = creerLimiteur({ max: 300, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

export async function GET(req: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(req.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: ENTETES });
  }
  return Response.json(
    { proprietaire: isAuthorizedEmail(email, process.env.AUTHORIZED_EMAIL) },
    { status: 200, headers: ENTETES },
  );
}
