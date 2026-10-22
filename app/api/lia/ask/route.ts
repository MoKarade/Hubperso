// app/api/lia/ask/route.ts — la question de LIA, relayée à MemoryAI.
//
//   POST /api/lia/ask   corps : { "question": "…", "page"?: "/…" }
//   → 200 { text, chips?, mood?, blocks? }   (contrat : commun/assistant/CONTRAT-ask-lia.md)
//
// DEUX appelants, un seul point d'entrée :
//   - une APP (serveur à serveur) : `x-hub-token` = son `HUB_TOKEN`, comparé à temps constant
//     (`appDuJeton`) ; l'app est identifiée par le jeton, jamais par le corps ;
//   - l'ACCUEIL du hub (même origine) : session + accès au hub, lus ICI (la route traverse le
//     garde pour laisser passer le jeton, donc elle se garde seule). `source` vaut alors « hub ».
// Un `x-hub-token` PRÉSENT mais faux est refusé, sans repli sur la session.
//
// Le hub est le seul détenteur des jetons (ADR « maison de LIA ») : il relaie à MemoryAI avec
// le jeton qu'il détient déjà pour elle. Tout échec (MemoryAI absente, lente, en erreur, réponse
// hors contrat) = 503 : LIA dit « indisponible », jamais une réponse inventée. La QUESTION n'est
// jamais journalisée (ni ici ni dans les erreurs).

import { HUB_TOKEN_HEADER } from "@mokarade/hub-contract";
import { auth } from "@/auth";
import { assurerMigrations } from "@/lib/migrations";
import { aAcces, APP_HUB } from "@/lib/personnes";
import { appDuJeton } from "@/lib/jetonApp";
import { SOURCE_DEFS } from "@/lib/sources";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import {
  CORPS_MAX_OCTETS,
  DELAI_MEMORYAI_MS,
  corpsPourMemoryAi,
  validerDemande,
  validerReponse,
} from "@/lib/liaAsk";

export const dynamic = "force-dynamic";

const limiteur = creerLimiteur({ max: 30, fenetreMs: 60_000 });
const ENTETES = { "cache-control": "no-store" } as const;

const erreur = (status: number, error: string, message: string): Response =>
  Response.json({ error, message }, { status, headers: ENTETES });

/** Qui parle : l'id de l'app (jeton), « hub » (session), ou `null` (refus). */
async function appelant(req: Request): Promise<string | null> {
  const jeton = req.headers.get(HUB_TOKEN_HEADER);
  if (jeton !== null) return appDuJeton(jeton);
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  // La liste des invités vit en base : on s'assure du schéma avant de la lire (lib/migrations.ts).
  await assurerMigrations();
  if (!(await aAcces(email, APP_HUB))) return null;
  return "hub";
}

export async function POST(req: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(req.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const source = await appelant(req);
  if (!source) return erreur(401, "unauthorized", "Jeton d'app ou session invalide.");

  const texte = await req.text();
  if (Buffer.byteLength(texte, "utf8") > CORPS_MAX_OCTETS) {
    return erreur(413, "payload_too_large", "Corps trop gros (8 Ko au plus).");
  }
  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return erreur(400, "bad_request", "Corps JSON attendu : { question, page? }.");
  }
  const demande = validerDemande(corps);
  if (!demande.ok) return erreur(400, "bad_request", demande.raison);

  const memoire = SOURCE_DEFS.find((d) => d.id === "memoryai");
  const jetonMemoire = memoire ? process.env[memoire.tokenEnv]?.trim() : undefined;
  if (!memoire || !jetonMemoire) {
    return erreur(503, "unavailable", "LIA n'est pas configurée sur le hub.");
  }

  try {
    const r = await fetch(`${memoire.accueilUrl}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", [HUB_TOKEN_HEADER]: jetonMemoire },
      body: corpsPourMemoryAi(demande.valeur, source),
      signal: AbortSignal.timeout(DELAI_MEMORYAI_MS),
      cache: "no-store",
    });
    if (!r.ok) return erreur(503, "unavailable", `MemoryAI a répondu ${r.status}.`);
    const reponse = validerReponse(await r.json());
    if (!reponse.ok) return erreur(503, "unavailable", "Réponse de MemoryAI hors contrat.");
    return Response.json(reponse.valeur, { headers: ENTETES });
  } catch (e) {
    // Jamais la question : seulement le type d'erreur (délai, réseau, JSON illisible).
    console.error("[lia/ask] relais MemoryAI en échec :", e instanceof Error ? e.name : "inconnue");
    return erreur(503, "unavailable", "MemoryAI injoignable.");
  }
}
