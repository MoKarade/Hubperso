// app/api/chantier/evenement/route.ts — GitHub y ENVOIE ses événements (webhook) pour la page Chantier.
//
// Un serveur appelle un serveur : aucun cookie de session. La route traverse `isPublicPath` par égalité STRICTE mais n'est
// pas ouverte : chaque livraison porte `X-Hub-Signature-256`, un HMAC SHA-256 du corps avec `CHANTIER_WEBHOOK_SECRET`
// (secret DÉDIÉ, jamais `GANTT_SECRET` ni un jeton d'app), comparé à temps constant.
//
//   CHANTIER_WEBHOOK_SECRET absent côté hub → 503 (jamais 401 : le diagnostic est « configure Vercel »)
//   signature absente ou fausse            → 401, et rien n'est lu ni écrit
//   corps trop gros 413 · JSON illisible 400 · événement retenu mais illisible ou dépôt inconnu 422
//   type ou action non retenus (ping compris) → 200 { ok:true, ignore:true, raison } : GitHub n'a pas à réessayer
//   retenu → 200 { ok:true, nouveau } : `nouveau:false` = livraison déjà rangée (renvoi) ; une livraison NOUVELLE part aussi
//            à MemoryAI (sorties, Hubperso#651), après la réponse
//   sans base 503 · base en panne 500 (jamais un 200 qui la cache : GitHub propose de rejouer la livraison)

import { NextResponse, after } from "next/server";
import { formeSignature, lireEvenement, signer, TAILLE_MAX_EVENEMENT } from "@/lib/chantierEvenements";
import { ranger } from "@/lib/chantierEvenementsDb";
import { pousserSortieWebhook } from "@/lib/chantierSortiesEnvoi";
import { baseConfiguree } from "@/lib/db";
import { memeJeton } from "@/lib/jetonApp";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { assurerMigrations } from "@/lib/migrations";

/** Dix dépôts qui s'emballent en même temps (un merge, une CI) : 300 par minute et par client, bien au-dessus du réel. */
const limiteur = creerLimiteur({ max: 300, fenetreMs: 60_000 });

export const dynamic = "force-dynamic";

const SANS_CACHE = { "cache-control": "no-store" };
const rep = (corps: Record<string, unknown>, status = 200) => NextResponse.json(corps, { status, headers: SANS_CACHE });

export async function POST(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const secret = process.env.CHANTIER_WEBHOOK_SECRET?.trim();
  if (!secret) return rep({ ok: false, raison: "CHANTIER_WEBHOOK_SECRET absent côté serveur — événements désactivés." }, 503);

  const annonce = Number(request.headers.get("content-length") ?? 0);
  if (annonce > TAILLE_MAX_EVENEMENT) return rep({ ok: false, raison: "corps trop gros" }, 413);
  const texte = await request.text();
  if (texte.length > TAILLE_MAX_EVENEMENT) return rep({ ok: false, raison: "corps trop gros" }, 413);

  // La signature se juge sur le texte BRUT, avant tout JSON.parse : un corps réécrit ne porterait plus la même.
  const fournie = request.headers.get("x-hub-signature-256");
  if (!formeSignature(fournie) || !memeJeton(signer(texte, secret), fournie)) return rep({ ok: false, raison: "signature refusée" }, 401);

  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return rep({ ok: false, raison: "corps : JSON illisible" }, 400);
  }

  const lecture = lireEvenement(request.headers.get("x-github-event") ?? "", request.headers.get("x-github-delivery") ?? "", corps, new Date());
  if (!lecture.ok) {
    return lecture.ignore ? rep({ ok: true, ignore: true, raison: lecture.raison }) : rep({ ok: false, raison: lecture.raison }, 422);
  }

  if (!baseConfiguree()) return rep({ ok: false, raison: "DATABASE_URL absente — aucun événement ne peut être rangé." }, 503);
  try {
    // Même leçon que `/api/gantt` : la route tourne sans personne devant, elle crée donc elle-même sa table.
    await assurerMigrations();
    const rangee = await ranger(lecture.evenement);
    // Hubperso#651 : MemoryAI reçoit l'événement à l'instant où il arrive, sans attendre le relevé du PC (qui reste le filet).
    // Après la réponse, jamais avant : un échec là-bas ne change rien au 200 que GitHub reçoit. Un renvoi (`nouveau:false`) ne repart pas.
    if (rangee.nouveau) after(() => pousserSortieWebhook({ evenement: lecture.evenement, jeton: process.env.MEMORYAI_SORTIES_TOKEN }));
    return rep({ ok: true, ...rangee });
  } catch (err) {
    console.error("[chantier] événement non rangé", err);
    return rep({ ok: false, raison: "l'écriture en base a échoué — voir les journaux Vercel." }, 500);
  }
}
