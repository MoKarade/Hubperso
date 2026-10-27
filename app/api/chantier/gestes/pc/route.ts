// app/api/chantier/gestes/pc/route.ts — le PC de Marc LIT les gestes de l'onglet « À toi » et ACCUSE ceux qu'il a pris.
//
// Le dépôt des gestes (`../route.ts`) est derrière la session. Ici, un serveur appelle un serveur :
// `outils/gantt-pc/reponses.py` (MoKarade/.github) lit les gestes en attente, les applique sur GitHub, puis
// accuse. Même modèle que `/api/gantt` : `Authorization: Bearer <GANTT_SECRET>`, secret DÉDIÉ comparé à temps
// constant (`decideCron` + `memeJeton`), la route traverse `isPublicPath` par égalité STRICTE mais n'est pas ouverte.
//
//   GANTT_SECRET absent côté hub → 503 (jamais 401 : le diagnostic est « configure Vercel »)
//   secret absent ou faux        → 401, et rien n'est lu ni écrit
//   GET   → 200 { ok, gestes: [...] } : les gestes pas encore pris, du plus ancien au plus récent (50 au plus)
//   POST  → { ids } : pose `prise_le` sur ces gestes ; 200 { ok, pris: [ids réellement accusés] }
//           corps trop gros 413, illisible 400, hors contrat 422 ; sans base 503 ; base en panne 500
//
// Lire ne marque rien : un PC qui plante entre la lecture et l'accusé relira les mêmes gestes (idempotent côté PC,
// qui vérifie l'état réel sur GitHub). Seul l'accusé les retire de la liste.

import { NextResponse } from "next/server";
import { TAILLE_MAX_ACCUSE, validerAccuse } from "@/lib/chantierGestes";
import { accuserGestes, gestesEnAttente } from "@/lib/chantierGestesDb";
import { decideCron } from "@/lib/cronAuth";
import { baseConfiguree } from "@/lib/db";
import { memeJeton } from "@/lib/jetonApp";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { assurerMigrations } from "@/lib/migrations";

/** Le PC passe toutes les quelques minutes : 30 par minute et par client arrête un martelage de la base. */
const limiteur = creerLimiteur({ max: 30, fenetreMs: 60_000 });

export const dynamic = "force-dynamic";

const SANS_CACHE = { "cache-control": "no-store" };

/** Limite, secret, base : le même portail pour la lecture et l'accusé. `null` = la requête peut continuer. */
async function portail(request: Request): Promise<Response | null> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const decision = decideCron(
    request.headers.get("authorization"),
    process.env.GANTT_SECRET,
    memeJeton,
  );
  if (decision.type === "non-configure") {
    return NextResponse.json(
      { ok: false, raison: "GANTT_SECRET absent côté serveur — lecture des gestes désactivée." },
      { status: 503, headers: SANS_CACHE },
    );
  }
  if (decision.type === "refuse") {
    return NextResponse.json({ ok: false, raison: "secret refusé" }, { status: 401, headers: SANS_CACHE });
  }
  if (!baseConfiguree()) {
    return NextResponse.json(
      { ok: false, raison: "DATABASE_URL absente — aucun geste à lire." },
      { status: 503, headers: SANS_CACHE },
    );
  }
  // Même leçon que `/api/gantt` : la route tourne sans personne devant, elle crée donc elle-même sa table.
  await assurerMigrations();
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await portail(request);
  if (refus) return refus;
  try {
    return NextResponse.json({ ok: true, gestes: await gestesEnAttente() }, { headers: SANS_CACHE });
  } catch (err) {
    console.error("[chantier] gestes non lus", err);
    return NextResponse.json(
      { ok: false, raison: "la lecture en base a échoué — voir les journaux Vercel." },
      { status: 500, headers: SANS_CACHE },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await portail(request);
  if (refus) return refus;

  // Taille jugée avant de lire le corps quand le client l'annonce, puis sur le texte reçu.
  const annonce = Number(request.headers.get("content-length") ?? 0);
  if (annonce > TAILLE_MAX_ACCUSE) {
    return NextResponse.json({ ok: false, raison: "corps trop gros" }, { status: 413, headers: SANS_CACHE });
  }
  const texte = await request.text();
  if (texte.length > TAILLE_MAX_ACCUSE) {
    return NextResponse.json({ ok: false, raison: "corps trop gros" }, { status: 413, headers: SANS_CACHE });
  }

  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return NextResponse.json({ ok: false, raison: "corps : JSON illisible" }, { status: 400, headers: SANS_CACHE });
  }
  const validation = validerAccuse(corps);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, raison: validation.raison }, { status: 422, headers: SANS_CACHE });
  }

  try {
    return NextResponse.json({ ok: true, pris: await accuserGestes(validation.ids) }, { headers: SANS_CACHE });
  } catch (err) {
    console.error("[chantier] accusé non rangé", err);
    return NextResponse.json(
      { ok: false, raison: "l'écriture en base a échoué — voir les journaux Vercel." },
      { status: 500, headers: SANS_CACHE },
    );
  }
}
