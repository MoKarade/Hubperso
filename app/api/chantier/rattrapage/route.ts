// app/api/chantier/rattrapage/route.ts — la page Chantier rattrape ici le trou entre le dernier relevé du PC et les premiers événements.
//
//   GET /api/chantier/rattrapage[?depuis=<ISO>]
//     200 { ok: true, evenements, incomplets, erreurs, lu_le } : l'état courant des issues et des PR touchées depuis `depuis`
//         (au plus 14 jours ; sans `depuis`, 14 jours), sous forme d'événements `snapshot` (lib/chantierRattrapage.ts)
//     401 pas de session (ou pas d'accès au hub) · 404 connecté mais pas le propriétaire · 400 `depuis` illisible
//     429 trop vite · 503 sans jeton GitHub (`CHANTIER_GITHUB_TOKEN`) : « non branché », aucun appel réseau
//
// Comme `/api/chantier/releve` : DERRIÈRE le garde du hub (aucune exception dans `lib/authGuard.ts`), session, accès au hub, puis
// propriétaire ; un invité reçoit 404. La page la demande UNE fois à son ouverture, jamais sur minuterie ; le résultat est gardé 5 minutes
// en mémoire pour ne pas dépenser le quota GitHub à chaque rechargement. Le jeton ne sort jamais du serveur (lecture seule : Issues,
// Pull requests, Metadata).

import { auth } from "@/auth";
import { rattraper, type Api, type Rattrapage } from "@/lib/chantierRattrapage";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { assurerMigrations } from "@/lib/migrations";
import { aAcces, APP_HUB, estProprietaire } from "@/lib/personnes";

export const dynamic = "force-dynamic";

const limiteur = creerLimiteur({ max: 6, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;
/** Garde en mémoire : un rechargement de la page n'est pas une nouvelle lecture de GitHub. */
const MEMOIRE_MS = 5 * 60_000;
let memoire: { depuis: number; lu: number; valeur: Rattrapage } | null = null;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

const jeton = (): string | null => process.env.CHANTIER_GITHUB_TOKEN?.trim() || null;

const apiGithub = (token: string): Api => async (chemin) => {
  const r = await fetch(`https://api.github.com${chemin}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "hubperso-chantier" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export async function GET(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return erreur(401, "unauthorized", "Session invalide.");

  const brut = new URL(request.url).searchParams.get("depuis");
  const depuis = brut ? new Date(brut) : null;
  if (depuis && Number.isNaN(depuis.getTime())) return erreur(400, "bad_request", "`depuis` : date ISO attendue.");

  try {
    await assurerMigrations();
    if (!(await aAcces(email, APP_HUB))) return erreur(401, "unauthorized", "Session invalide.");
    if (!estProprietaire(email)) return erreur(404, "not_found", "Introuvable.");

    const token = jeton();
    if (!token) return erreur(503, "unavailable", "Non branché : le hub n'a pas de jeton de lecture GitHub (CHANTIER_GITHUB_TOKEN).");

    const maintenant = Date.now();
    const cle = depuis?.getTime() ?? 0;
    if (!memoire || maintenant - memoire.lu > MEMOIRE_MS || cle < memoire.depuis) {
      memoire = { depuis: cle, lu: maintenant, valeur: await rattraper({ api: apiGithub(token), depuis }) };
    }
    const { valeur, lu } = memoire;
    return Response.json({ ok: true, ...valeur, lu_le: new Date(lu).toISOString() }, { headers: ENTETES });
  } catch (err) {
    console.error("[chantier] rattrapage GitHub impossible", err);
    return erreur(500, "internal", "Rattrapage impossible — voir les journaux Vercel.");
  }
}
