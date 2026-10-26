// app/api/chantier/releve/route.ts — la page Chantier relit ici le dernier relevé du Gantt.
//
//   GET /api/chantier/releve
//     200 + le JSON du Gantt (gzip tel que le PC l'a envoyé, `Content-Encoding: gzip`) + ETag
//     304 si `If-None-Match` désigne déjà le dernier relevé : ni corps, ni lecture du contenu en base
//     401 pas de session (ou pas d'accès au hub) · 404 connecté mais pas le propriétaire
//     404 `aucun` : le PC n'a encore rien envoyé · 429 trop vite · 500 lecture impossible · 503 sans base
//
// Le relevé contient les titres de tâches PRIVÉS de Marc (FinanceAI, DriveAI) : la route reste DERRIÈRE
// le garde du hub (aucune exception dans `lib/authGuard.ts`, jamais le matcher du middleware) et se
// garde encore seule, comme `/api/lia/etat` : session, accès au hub, puis propriétaire. Un invité du hub
// reçoit 404, pas 403 : il n'apprend pas que la page existe. Rien d'une réponse n'est mis en cache
// (`no-store`) ; la page revalide à la main avec `If-None-Match` (voir `lib/chantierReleve.ts`).
//
// NO FAKE DATA : sans relevé, `aucun` ; base injoignable, 500 — jamais un relevé vide présenté comme vrai.

import { auth } from "@/auth";
import { etagCorrespond, etagDuReleve, octetsGzip } from "@/lib/chantierReleve";
import { baseConfiguree } from "@/lib/db";
import { lireEnteteGantt, lireGantt } from "@/lib/ganttDb";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { assurerMigrations } from "@/lib/migrations";
import { aAcces, APP_HUB, estProprietaire } from "@/lib/personnes";

export const dynamic = "force-dynamic";

/** Une lecture par minute et par onglet : 30 par minute laissent de la marge sans permettre un martelage. */
const limiteur = creerLimiteur({ max: 30, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return erreur(401, "unauthorized", "Session invalide.");

  if (!baseConfiguree()) return erreur(503, "unavailable", "Aucune base : le relevé ne peut pas être lu.");

  try {
    // La liste des invités vit en base : on s'assure du schéma avant de la lire (lib/migrations.ts).
    await assurerMigrations();
    if (!(await aAcces(email, APP_HUB))) return erreur(401, "unauthorized", "Session invalide.");
    if (!estProprietaire(email)) return erreur(404, "not_found", "Introuvable.");

    // D'abord les deux heures seules : un relevé déjà connu de la page ne coûte pas sa lecture complète.
    const entete = await lireEnteteGantt();
    if (!entete) return erreur(404, "aucun", "Aucun relevé reçu pour l'instant.");
    if (etagCorrespond(request.headers.get("if-none-match"), etagDuReleve(entete.recuLe))) {
      return new Response(null, { status: 304, headers: { ...ENTETES, etag: etagDuReleve(entete.recuLe) } });
    }

    const releve = await lireGantt();
    if (!releve) return erreur(404, "aucun", "Aucun relevé reçu pour l'instant.");
    const octets = octetsGzip(releve.donneesGzB64);
    if (!octets) return erreur(500, "illisible", "Le relevé rangé n'est pas un gzip lisible.");

    return new Response(new Uint8Array(octets), {
      status: 200,
      headers: {
        ...ENTETES,
        "content-type": "application/json; charset=utf-8",
        "content-encoding": "gzip",
        etag: etagDuReleve(releve.recuLe),
        "x-releve-envoye": releve.envoyeLe.toISOString(),
        "x-releve-recu": releve.recuLe.toISOString(),
      },
    });
  } catch (err) {
    console.error("[chantier] lecture du relevé impossible", err);
    return erreur(500, "internal", "Lecture du relevé impossible — voir les journaux Vercel.");
  }
}
