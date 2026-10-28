// app/api/chantier/notes-lia/route.ts — le PC de Marc LIT le nombre de notes de LIA que le coordinateur n'a pas lues.
//
// Cinquième route de serveur à serveur. LIA peut laisser une note au coordinateur (MemoryAI, ADR 0022) ; rien ne le
// réveillait. Le PC n'a aucun jeton MemoryAI, son seul secret est `GANTT_SECRET` : le hub lit donc le résumé de MemoryAI
// (avec le `HUB_TOKEN` qu'il détient déjà) et rend le NOMBRE, jamais le contenu. Même modèle que `/api/chantier/gestes/pc` :
// `Authorization: Bearer <GANTT_SECRET>` comparé à temps constant, égalité STRICTE dans `isPublicPath`.
//
//   GANTT_SECRET absent côté hub → 503 (jamais 401 : le diagnostic est « configure Vercel »)
//   secret absent ou faux        → 401, et MemoryAI n'est pas interrogée
//   GET → 200 { ok: true, notesLia: <entier ≥ 0> | null }   (null = inconnu : jamais 0 pour cacher une panne)
//
// Résumé lu EN DIRECT (`fetchSummaryLive`), pas depuis le cache de résilience : un nombre vieux de 30 minutes réveillerait
// le coordinateur pour rien, ou ne le réveillerait pas quand il faut.

import { NextResponse } from "next/server";
import { decideCron } from "@/lib/cronAuth";
import { fetchSummaryLive } from "@/lib/fetchSummary";
import { memeJeton } from "@/lib/jetonApp";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { notesLiaNonLues } from "@/lib/notesLia";
import { getSources } from "@/lib/sources";

/** Le PC passe toutes les quelques minutes : 30 par minute et par client arrête un martelage de MemoryAI. */
const limiteur = creerLimiteur({ max: 30, fenetreMs: 60_000 });

export const dynamic = "force-dynamic";

const SANS_CACHE = { "cache-control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const decision = decideCron(request.headers.get("authorization"), process.env.GANTT_SECRET, memeJeton);
  if (decision.type === "non-configure") {
    return NextResponse.json(
      { ok: false, raison: "GANTT_SECRET absent côté serveur — lecture des notes de LIA désactivée." },
      { status: 503, headers: SANS_CACHE },
    );
  }
  if (decision.type === "refuse") {
    return NextResponse.json({ ok: false, raison: "secret refusé" }, { status: 401, headers: SANS_CACHE });
  }

  const source = getSources().find((s) => s.id === "memoryai");
  // `getSources` déclare MemoryAI : son absence serait une erreur de code, pas une panne à masquer en `null`.
  if (!source) {
    return NextResponse.json({ ok: false, raison: "source MemoryAI non déclarée." }, { status: 500, headers: SANS_CACHE });
  }
  const notesLia = notesLiaNonLues(await fetchSummaryLive(source));
  return NextResponse.json({ ok: true, notesLia }, { headers: SANS_CACHE });
}
