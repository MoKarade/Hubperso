// app/api/cout/route.ts — le coût API cumulé des apps, lisible par le suivi du projet.
//
// Demande de Marc (15/10/2026, « quota précis sans action de ma part »), tâche #191. Le
// relevé du suivi n'a aucun jeton et n'en recevra pas : la réponse est donc publique, comme
// `/api/sante`, et ne porte QUE ce qui peut l'être — un total en dollars, une heure de mesure,
// les identifiants (publics) des apps. Voir `lib/coutCumule.ts`.
//
// ⚠️ Route SANS authentification, délibérément (oui de Marc, 16/10/2026). Elle traverse le
// garde par `isPublicPath` (lib/authGuard.ts), JAMAIS par une exclusion du matcher de
// `middleware.ts`. `tests/gardePages.test.ts` la range dans une catégorie à part
// (ROUTES_PUBLIQUES_AGREGAT) : elle ne lit que la mémoire du hub, jamais une app, jamais un
// jeton, jamais la liste des personnes.
//
// Elle lit la MÉMOIRE (les relevés que `/api/cron/releve` écrit toutes les 30 min), pas les
// apps : un appel public ne déclenche donc aucun fetch sortant. Même frein que `/api/sante`
// contre le martelage de Neon : 10 appels par minute et par client.
//
// 503 quand la base ne répond pas : « je ne sais pas » ne doit jamais ressembler à « 0 $ ».

import { baseConfiguree } from "@/lib/db";
import { cumulerCouts } from "@/lib/coutCumule";
import { lireDerniersCouts } from "@/lib/historiqueDb";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { assurerMigrations } from "@/lib/migrations";
import { SOURCE_DEFS } from "@/lib/sources";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const limiteur = creerLimiteur({ max: 10, fenetreMs: 60_000 });

export async function GET(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const ids = SOURCE_DEFS.map((d) => d.id);
  // Même ordre que `/api/sante` : la base d'abord prête, puis la lecture (jamais d'échec vers l'appelant).
  if (baseConfiguree()) await assurerMigrations();
  const derniers = baseConfiguree() ? await lireDerniersCouts(ids) : null;
  if (derniers === null) {
    return Response.json({ ok: false, cause: "base" }, { status: 503, headers: NO_STORE });
  }

  return Response.json({ ok: true, ...cumulerCouts(ids, derniers) }, { headers: NO_STORE });
}
