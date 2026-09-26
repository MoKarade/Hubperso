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
import { elaguerHistorique, enregistrerReleve, type IssueReleve } from "@/lib/historiqueDb";
import { assurerMigrations, etatMigrations } from "@/lib/migrations";
import { memeJeton } from "@/lib/jetonApp";
import { getSources } from "@/lib/sources";
import { cleClient, creerLimiteur, reponse429 } from "@/lib/limiteDebit";

/**
 * Le workflow appelle toutes les 30 min : 10 par minute et par client, c'est très large et
 * arrête un martelage de la base (en mémoire de l'instance, voir lib/limiteDebit.ts).
 */
const limiteur = creerLimiteur({ max: 10, fenetreMs: 60_000 });

/** Jamais de cache : chaque appel doit vraiment aller interroger les apps. */
export const dynamic = "force-dynamic";

/**
 * Le budget de la fonction, en secondes. Doit rester AU-DESSUS de `TIMEOUT_CRON_MS`
 * (20 s) : sinon la plateforme coupe la fonction avant que le fetch le plus lent n'ait
 * rendu son verdict, et on perd le relevé sans jamais savoir pourquoi.
 */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const debit = limiteur.verifier(cleClient(request.headers));
  if (!debit.ok) return reponse429(debit.retryApresS);

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

  // ⚠️ LES MIGRATIONS, ET C'EST LA LEÇON N°5 UN ÉTAGE PLUS BAS.
  //
  // `lib/gardeHub.ts` appelle `assurerMigrations()` à chaque page et `app/api/acces/route.ts`
  // le fait aussi. Cette route, la SEULE conçue pour tourner sans personne devant, ne le
  // faisait pas. Conséquence mesurée le 15/09/2026 : la base venait d'être créée, aucune page
  // n'avait été chargée depuis le déploiement — le regroupement des requêtes Vercel montrait
  // `/api/cron/releve` comme unique route servie — donc AUCUNE table n'existait, et les cinq
  // insertions échouaient sur `relation "releves" does not exist`.
  //
  // « L'observateur était requis pour l'observation » s'appliquait donc encore, non plus aux
  // données mais au SCHÉMA. Une horloge qui ne peut pas créer sa propre table dépend d'un
  // humain pour commencer à mesurer — exactement ce qu'elle existe pour supprimer.
  //
  // Bénéfice de bord, et ce n'est pas un détail : cet import fait entrer `drizzle/*.sql` dans
  // le traçage de fichiers de Next pour CETTE fonction. Vérifié sur le build — le `.nft.json`
  // de cette route en comptait ZÉRO, celui de `app/page.tsx` en compte cinq. Aucun
  // `outputFileTracingIncludes` n'est nécessaire.
  await assurerMigrations();

  // Budget plus large que celui de l'affichage : personne n'attend devant, et un relevé
  // perdu est un trou définitif. Voir `TIMEOUT_CRON_MS`.
  const resultats = await fetchAllSummaries(getSources(), undefined, TIMEOUT_CRON_MS);

  // Séquentiel et non `Promise.all` : l'insertion porte un `WHERE NOT EXISTS` sur la
  // fenêtre d'espacement (`INTERVALLE_RELEVE_MS`), et cinq écritures simultanées sur des
  // `app_id` différents ne se gênent pas — mais l'ordre rend le journal lisible et la
  // charge sur un Neon gratuit reste dérisoire. Aucune raison de paralléliser.
  const releves: { appId: string; etat: string; issue: IssueReleve }[] = [];
  for (const resultat of resultats) {
    releves.push({
      appId: resultat.source.id,
      etat: resultat.state,
      issue: await enregistrerReleve(resultat),
    });
  }

  // L'élagage vit ici parce que c'est le seul endroit qui tourne SANS personne devant.
  // L'accrocher à l'affichage ferait payer à une page le nettoyage de la table.
  const elagues = await elaguerHistorique();

  const ecrits = releves.filter((r) => r.issue === "ecrit").length;
  const echecs = releves.filter((r) => r.issue === "echec").length;

  // ⚠️ UN ÉCHEC D'ÉCRITURE N'EST PAS UN ESPACEMENT, ET CETTE ROUTE A CONFONDU LES DEUX.
  //
  // Le 15/09/2026, les cinq insertions échouaient sur `relation "releves" does not exist` et
  // cette route répondait `HTTP 200` avec « le dernier relevé date de moins de l'espacement
  // minimal ». Elle ne mentait pas par choix : `enregistrerReleve` rendait un BOOLÉEN, donc
  // le cas sain et le cas grave arrivaient ici sous la même forme, et la seule phrase
  // disponible était celle du cas sain. Le run était vert, le workflow content, et zéro ligne
  // était écrite — la panne silencieuse dans le code écrit pour la supprimer.
  //
  // 500 et non 200 : le workflow échoue en ROUGE sur tout ce qui n'est pas 200, et c'est
  // exactement ce qu'on veut. `etatMigrations()` est joint parce que la cause la plus probable
  // d'un échec d'écriture est un schéma absent ou en retard — le diagnostic accompagne le
  // symptôme au lieu de se faire chercher dans les journaux d'une autre plateforme.
  if (echecs > 0) {
    return NextResponse.json(
      {
        ok: false,
        raison: `${echecs} relevé(s) sur ${releves.length} n'ont PAS pu être écrits — voir les journaux Vercel.`,
        migrations: etatMigrations(),
        ecrits,
        echecs,
        elagues,
        releves,
      },
      { status: 500 },
    );
  }

  // ⚠️ `ok: true` avec `ecrits: 0` est un cas NORMAL — mais seulement maintenant qu'un échec
  // ne peut plus s'y cacher. L'espacement (15 min) est plus court que la cadence de
  // l'horloge, et deux passages rapprochés — un rattrapage GitHub, un déclenchement manuel —
  // tombent légitimement dans la même fenêtre.
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
