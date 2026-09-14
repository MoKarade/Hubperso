// app/api/cron/releve/route.ts — L'HORLOGE DU HUB.
//
// ── CE QUE ÇA RÉPARE, ET C'ÉTAIT LA PANNE PRINCIPALE ────────────────────────────────
//
// `enregistrerReleve` n'était appelée que depuis `app/page.tsx`. Rien ne s'enregistrait
// quand personne ne regardait : l'observateur était requis pour l'observation. Trois
// conséquences, toutes invisibles à l'écran :
//
//   1. aucun historique en dehors des moments où Marc avait un onglet ouvert, donc aucune
//      courbe d'évolution possible sur autre chose que ses heures de consultation ;
//   2. `inchangeDepuisMs` et `figeDepuisMs` (`lib/historique.ts`) — tout l'appareil conçu
//      pour repérer une métrique GELÉE — ne pouvaient rien repérer, faute de deux relevés
//      encadrant le gel ;
//   3. une app tombée le vendredi et relevée le lundi ne laissait aucune trace du week-end.
//
// Cette route fait ce que faisait l'affichage, sans l'affichage. Le workflow
// `.github/workflows/releve.yml` l'appelle périodiquement.
//
// ── POURQUOI GITHUB ACTIONS ET PAS UN CRON VERCEL ───────────────────────────────────
//
// Le plan Vercel Hobby n'autorise que des crons QUOTIDIENS — un relevé par jour ne
// mesurerait rien. GitHub Actions donne la fréquence sans rien payer. En contrepartie sa
// cadence n'est PAS garantie : mesuré le 14/09/2026 sur le poll de CarAI, un `*/30`
// déclaré tournait environ trois fois moins souvent, avec un trou de 6 h 53, tous les runs
// verts. Le choix de Marc (14/09) est de garder GitHub Actions et de rendre le retard
// VISIBLE plutôt que de prétendre l'avoir réglé — c'est le rôle de `continuite`
// (`lib/gel.ts`), qui affiche le nombre de trous et le pire écart au lieu d'une courbe
// lisse qui mentirait sur ce qui s'est passé entre deux points.
//
// ── CETTE ROUTE ÉCRIT, DONC ELLE EST EN POST ────────────────────────────────────────
//
// Un GET ne doit rien changer. Le POST a aussi un effet pratique : un préchargement de
// navigateur, un crawler ou un lien cliqué par erreur ne déclenchent rien.
//
// ⚠️ Elle traverse `isPublicPath` (`lib/authGuard.ts`) — comme `/api/acces`, et pour la
// même raison : un workflow n'a pas de cookie de session. Elle n'est PAS ouverte, elle est
// authentifiée autrement, par `CRON_SECRET`. Le matcher du middleware reste INCHANGÉ ; la
// requête continue donc de traverser la garde globale, y compris le refus quand
// l'authentification du hub n'est pas configurée.

import { NextResponse } from "next/server";
import { decideCron } from "@/lib/cronAuth";
import { fetchAllSummaries, TIMEOUT_CRON_MS } from "@/lib/fetchSummary";
import { baseConfiguree } from "@/lib/db";
import { elaguerHistorique, enregistrerReleve } from "@/lib/historiqueDb";
import { memeJeton } from "@/lib/jetonApp";
import { getSources } from "@/lib/sources";

/** Jamais de cache : chaque appel doit vraiment aller interroger les apps. */
export const dynamic = "force-dynamic";

/**
 * Le budget de la fonction, en secondes. Doit rester AU-DESSUS de `TIMEOUT_CRON_MS`
 * (20 s) : sinon la plateforme coupe la fonction avant que le fetch le plus lent n'ait
 * rendu son verdict, et on perd le relevé sans jamais savoir pourquoi.
 */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const decision = decideCron(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
    memeJeton,
  );

  if (decision.type === "non-configure") {
    return NextResponse.json(
      {
        ok: false,
        raison: "CRON_SECRET absent côté serveur — horloge désactivée.",
      },
      { status: 503 },
    );
  }
  if (decision.type === "refuse") {
    return NextResponse.json({ ok: false, raison: "secret refusé" }, { status: 401 });
  }

  // Sans base, il n'y a nulle part où écrire. 503 et pas un 200 optimiste : une horloge qui
  // tourne toutes les trente minutes sans rien enregistrer, en restant verte, est exactement
  // le mode de panne silencieux que cette route existe pour supprimer.
  if (!baseConfiguree()) {
    return NextResponse.json(
      { ok: false, raison: "DATABASE_URL absente — aucun relevé ne peut être écrit." },
      { status: 503 },
    );
  }

  // Budget plus large que celui de l'affichage : personne n'attend devant, et un relevé
  // perdu est un trou définitif. Voir `TIMEOUT_CRON_MS`.
  const resultats = await fetchAllSummaries(getSources(), undefined, TIMEOUT_CRON_MS);

  // Séquentiel et non `Promise.all` : l'insertion porte un `WHERE NOT EXISTS` sur la
  // fenêtre d'espacement (`INTERVALLE_RELEVE_MS`), et cinq écritures simultanées sur des
  // `app_id` différents ne se gênent pas — mais l'ordre rend le journal lisible et la
  // charge sur un Neon gratuit reste dérisoire. Aucune raison de paralléliser.
  const releves: { appId: string; etat: string; ecrit: boolean }[] = [];
  for (const resultat of resultats) {
    releves.push({
      appId: resultat.source.id,
      etat: resultat.state,
      ecrit: await enregistrerReleve(resultat),
    });
  }

  // L'élagage vit ici parce que c'est le seul endroit qui tourne SANS personne devant.
  // L'accrocher à l'affichage ferait payer à une page le nettoyage de la table.
  const elagues = await elaguerHistorique();

  const ecrits = releves.filter((r) => r.ecrit).length;

  // ⚠️ `ok: true` avec `ecrits: 0` est un cas NORMAL, pas un échec : l'espacement des
  // relevés (15 min) est plus court que la cadence de l'horloge, mais deux passages
  // rapprochés — un rattrapage GitHub, un déclenchement manuel — tombent légitimement dans
  // la même fenêtre. Le workflow le signale en avertissement sans teindre le run en rouge :
  // c'est au champ `raison` de dire pourquoi, jamais au code HTTP de le deviner.
  return NextResponse.json({
    ok: true,
    ...(ecrits === 0
      ? { raison: "aucun relevé écrit — le dernier date de moins de l'espacement minimal" }
      : {}),
    ecrits,
    elagues,
    releves,
  });
}
