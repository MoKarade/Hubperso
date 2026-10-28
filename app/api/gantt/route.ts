// app/api/gantt/route.ts — le hub REÇOIT le relevé du Gantt, envoyé par le PC de Marc.
//
// `outils/gantt-pc/tour.py` (MoKarade/.github) POSTe ici toutes les 10 minutes, après avoir
// déposé la même chose dans le Drive. Voir `lib/gantt.ts` pour le pourquoi (Drive privé, rien à
// lire côté hub, pas d'URL publique).
//
// ── MÊME MODÈLE QUE /api/cron/releve ────────────────────────────────────────────────
//
// Un serveur qui appelle un serveur : pas de cookie de session. La route traverse
// `isPublicPath` (`lib/authGuard.ts`, égalité STRICTE) mais n'est pas ouverte : elle exige
// `Authorization: Bearer <GANTT_SECRET>`, comparé à temps constant (`decideCron` + `memeJeton`).
// Le secret est DÉDIÉ : ce que la route déclenche est une écriture dans la mémoire du hub, un
// pouvoir qu'aucune app n'a de raison d'avoir (voir `lib/cronAuth.ts`).
//
//   GANTT_SECRET absent côté hub → 503 (jamais 401 : le diagnostic est « configure Vercel »)
//   secret absent ou faux        → 401, et rien n'est lu ni écrit
//   corps trop gros              → 413 ; corps illisible ou incomplet → 400 (la ligne en base
//                                  n'est PAS touchée : seul un envoi valide remplace le dernier)
//   sans base                    → 503 ; écriture impossible → 500 (jamais un 200 qui la cache)

import { after, NextResponse } from "next/server";
import { decideCron } from "@/lib/cronAuth";
import { baseConfiguree } from "@/lib/db";
import { TAILLE_MAX_OCTETS, validerEnvoi } from "@/lib/gantt";
import { pousserSortiesChantier } from "@/lib/chantierSortiesEnvoi";
import { enregistrerGantt } from "@/lib/ganttDb";
import { memeJeton } from "@/lib/jetonApp";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";
import { assurerMigrations } from "@/lib/migrations";

/** Un envoi toutes les 10 min : 10 par minute et par client arrête un martelage de la base. */
const limiteur = creerLimiteur({ max: 10, fenetreMs: 60_000 });

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

  const decision = decideCron(
    request.headers.get("authorization"),
    process.env.GANTT_SECRET,
    memeJeton,
  );
  if (decision.type === "non-configure") {
    return NextResponse.json(
      { ok: false, raison: "GANTT_SECRET absent côté serveur — réception désactivée." },
      { status: 503 },
    );
  }
  if (decision.type === "refuse") {
    return NextResponse.json({ ok: false, raison: "secret refusé" }, { status: 401 });
  }

  if (!baseConfiguree()) {
    return NextResponse.json(
      { ok: false, raison: "DATABASE_URL absente — aucun relevé ne peut être rangé." },
      { status: 503 },
    );
  }

  // La taille est jugée AVANT de lire le corps quand le client l'annonce, puis sur le texte
  // réellement reçu : un en-tête menteur ne fait pas entrer un corps géant.
  const annonce = Number(request.headers.get("content-length") ?? 0);
  if (annonce > TAILLE_MAX_OCTETS) {
    return NextResponse.json({ ok: false, raison: "corps trop gros" }, { status: 413 });
  }
  const texte = await request.text();
  if (texte.length > TAILLE_MAX_OCTETS) {
    return NextResponse.json({ ok: false, raison: "corps trop gros" }, { status: 413 });
  }

  let corps: unknown;
  try {
    corps = JSON.parse(texte);
  } catch {
    return NextResponse.json({ ok: false, raison: "corps : JSON illisible" }, { status: 400 });
  }
  const validation = validerEnvoi(corps);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, raison: validation.raison }, { status: 400 });
  }

  // Même leçon que l'horloge (`/api/cron/releve`) : cette route tourne sans personne devant,
  // elle crée donc elle-même sa table plutôt que d'attendre une page.
  await assurerMigrations();

  try {
    const recu = await enregistrerGantt(validation.envoi);
    // LIA lit le chantier dans les sorties de MemoryAI (Hubperso#651) : une poussée par heure, APRÈS la réponse au
    // PC, et un échec ne la touche jamais (la ligne est rangée, c'est ce que le PC attend).
    after(async () => {
      await pousserSortiesChantier({
        donneesGzB64: validation.envoi.donnees_gz_b64,
        maintenant: new Date(),
        jeton: process.env.MEMORYAI_SORTIES_TOKEN,
      });
    });
    return NextResponse.json({ ok: true, recu });
  } catch (err) {
    console.error("[gantt] écriture impossible", err);
    return NextResponse.json(
      { ok: false, raison: "l'écriture en base a échoué — voir les journaux Vercel." },
      { status: 500 },
    );
  }
}
