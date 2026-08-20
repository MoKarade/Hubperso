"use client";

// components/BoutonTrigger.tsx — le seul bouton du hub qui MUTE une app.
//
// Les champs cachés (`appId`, `href`) sont sous le contrôle du navigateur : on peut les
// réécrire avec les outils de développement avant d'envoyer. C'est normal, et c'est
// précisément pourquoi le serveur ne leur fait aucune confiance — il refetche le résumé de
// l'app et exige que l'href fasse partie des actions `trigger` qu'elle vient de publier,
// sur sa propre origine (`lib/declencher.ts`). Ce composant est de l'ergonomie ; la
// sécurité est entièrement de l'autre côté.

import { useActionState } from "react";
import type { HubAction } from "@mokarade/hub-contract";
import { actionDeclencher, type EtatDeclenchement } from "@/app/actions";

const INERTE: EtatDeclenchement = { statut: "inerte" };

export function BoutonTrigger({ action, appId }: { action: HubAction; appId: string }) {
  const [etat, envoyer, enCours] = useActionState(actionDeclencher, INERTE);

  return (
    <form
      className="action-trigger"
      action={envoyer}
      onSubmit={(evenement) => {
        // `confirm` vient du contrat : l'app déclare elle-même qu'un geste mérite d'être
        // confirmé. Le hub ne décide pas à sa place lesquels le méritent.
        if (action.confirm && !window.confirm(action.confirm)) {
          evenement.preventDefault();
        }
      }}
    >
      <input type="hidden" name="appId" value={appId} />
      <input type="hidden" name="href" value={action.href} />
      <button className="action action--trigger" type="submit" disabled={enCours}>
        {enCours ? "En cours…" : action.label}
      </button>
      {etat.statut !== "inerte" && (
        <p
          className={`action-trigger__retour action-trigger__retour--${etat.statut}`}
          // Une erreur interrompt : elle est annoncée. Un succès informe : il est poli.
          role={etat.statut === "erreur" ? "alert" : "status"}
        >
          {etat.message}
        </p>
      )}
    </form>
  );
}
