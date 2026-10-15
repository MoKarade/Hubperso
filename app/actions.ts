// app/actions.ts — le déclenchement d'une action `trigger` publiée par une app.
//
// REVÉRIFICATION SERVEUR, PAS SEULEMENT AFFICHAGE. Une Server Action est un point d'entrée
// POST à part entière, atteignable directement sans passer par le rendu de la page qui
// l'affiche. Se fier au fait que le bouton n'est montré qu'aux ayants droit reviendrait à
// vérifier à l'AFFICHAGE ce qui doit l'être à l'ÉCRITURE — même raisonnement que
// `app/administration/actions.ts`.
//
// ⚠️ `tests/gardePages.test.ts` énumère les `page.tsx` : il ne voit PAS ce fichier. C'est
// pourquoi il énumère désormais aussi les `actions.ts` — une Server Action non gardée est
// exactement le même trou qu'une page non gardée, en moins visible.
//
// ── DEUX ACCÈS, PAS UN ──────────────────────────────────────────────────────────────
//
// Voir le hub et MUTER une app ne sont pas la même capacité. Le tableau de bord montre les
// cinq apps à quiconque a `aAcces(…, APP_HUB)` — c'est un choix assumé (cf. `lib/gardeHub.ts`).
// Déclencher une action, en revanche, écrit dans une app précise : on repose donc la seconde
// question du modèle d'accès (ADR 0001), `aAcces(email, source.id)`. Quelqu'un invité sur
// BatchChef ne déclenche pas les actions de DriveAI parce qu'il a le droit d'entrer au hub.
//
// Marc n'est jamais bloqué par ce resserrement : le propriétaire est reconnu en premier et
// SANS réseau, donc `aAcces` lui répond vrai pour toute app, même base en panne.

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { posterAction } from "@/lib/declencher";
import { messageResultat, messageSansConfirmation } from "@/lib/messageAction";
import { fetchSummaryLive } from "@/lib/fetchSummary";
import { assurerMigrations } from "@/lib/migrations";
import { APP_HUB, aAcces } from "@/lib/personnes";
import { getSources } from "@/lib/sources";

export type EtatDeclenchement =
  | { statut: "inerte" }
  | { statut: "succes"; message: string }
  | { statut: "erreur"; message: string };

/**
 * Déclenche l'action d'href `href` sur l'app `appId`.
 *
 * Signature `useActionState` : le premier paramètre est l'état précédent, ignoré ici (aucune
 * accumulation d'un clic à l'autre — chaque déclenchement se juge seul).
 */
export async function actionDeclencher(
  _precedent: EtatDeclenchement,
  formData: FormData,
): Promise<EtatDeclenchement> {
  const appId = champ(formData, "appId");
  const href = champ(formData, "href");

  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { statut: "erreur", message: "Session expirée." };

  // ⚠️ LE SCHÉMA AVANT LA PREMIÈRE LECTURE DE LA BASE, ET CE FICHIER L'OUBLIAIT.
  //
  // Les pages passent par `exigerAccesHub()`, qui appelle `assurerMigrations()` en premier.
  // Cette Server Action est un point d'entrée POST à part entière : elle peut être la
  // PREMIÈRE chose servie par un déploiement neuf, avant toute page. `aAcces` lirait alors
  // des tables inexistantes — et comme le modèle d'accès échoue FERMÉ, une personne
  // légitimement invitée se verrait refuser l'action sans que rien n'explique pourquoi.
  //
  // Trouvé le 15/09/2026 par `tests/migrationsAppelees.test.ts`, écrit pour le même oubli
  // dans `/api/cron/releve`. Deux instances du même défaut, dont une qu'on ne cherchait pas.
  // Mémorisé par processus : après le premier appel, c'est un no-op.
  await assurerMigrations();

  if (!(await aAcces(email, APP_HUB))) {
    return { statut: "erreur", message: "Accès au hub requis." };
  }

  const source = getSources().find((s) => s.id === appId);
  // App inconnue : on ne dit pas laquelle existe, mais on ne prétend pas non plus avoir agi.
  if (!source) return { statut: "erreur", message: "App inconnue." };

  if (!(await aAcces(email, source.id))) {
    return {
      statut: "erreur",
      message: `Aucun accès à ${source.name} — le déclenchement est réservé à qui a accès à l'app.`,
    };
  }

  // Le résumé qui AUTORISE est refetché à l'instant, jamais tiré du cache de résilience.
  const resume = await fetchSummaryLive(source);
  if (resume.state !== "ok") {
    return {
      statut: "erreur",
      message: messageSansConfirmation(source.name),
    };
  }

  const resultat = await posterAction({
    source,
    summary: resume.summary,
    hrefDemande: href,
  });

  // L'app vient (peut-être) de changer d'état : le widget doit être refait au prochain rendu.
  if (resultat.etat === "ok") revalidatePath("/");

  return messageResultat(source.name, resultat);
}

function champ(formData: FormData, nom: string): string {
  const valeur = formData.get(nom);
  return typeof valeur === "string" ? valeur : "";
}
