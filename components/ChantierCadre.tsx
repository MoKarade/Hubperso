"use client";

// components/ChantierCadre.tsx — la page Chantier dans son cadre isolé, et le relevé qui lui arrive.
//
// Le cadre (`/api/chantier/cadre`, origine opaque, aucun réseau) ne peut rien lire seul : c'est CE
// composant, avec la session du propriétaire, qui relit le relevé (`/api/chantier/releve`) et le
// POSTE au cadre. Voir `lib/chantierCadre.ts` pour l'isolement.
//
// ── CE QUI NE DOIT PAS ARRIVER ───────────────────────────────────────────────────────
//
//  - le cadre ne se recharge pas (l'`<iframe>` garde son `src`, la page garde son état) ;
//  - la base n'est pas relue à chaque tour : le relevé est redemandé avec `If-None-Match`, la route
//    répond 304 sans lire le contenu tant que le PC n'a rien envoyé de neuf (toutes les 10 min) ;
//  - rien n'est demandé onglet caché ; au retour sur l'onglet, une lecture tout de suite.
//
// `postMessage(…, "*")` : l'origine du cadre est OPAQUE, aucune valeur de `targetOrigin` ne la
// désigne. Le destinataire est donc fixé par la fenêtre (`contentWindow` de CET `<iframe>`), et la
// page n'a aucun lien qui ne s'ouvre pas dans une autre fenêtre (verrou : `tests/chantierCadre.test.ts`).

import { useEffect, useRef } from "react";
import {
  MESSAGE_ETAT,
  MESSAGE_PING,
  MESSAGE_RELEVE,
  SANDBOX_CADRE,
  URL_CADRE,
  URL_RELEVE,
  consigneDeReponse,
  estGzip,
  estMessagePret,
} from "@/lib/chantierCadre";

async function decompresser(gzip: ArrayBuffer): Promise<ArrayBuffer> {
  const flux = new Blob([gzip]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(flux).arrayBuffer();
}

/** Le PC envoie toutes les 10 min ; relire chaque minute suffit, et 304 ne coûte pas la lecture en base. */
const INTERVALLE_MS = 60_000;

/** Tant que le cadre ne s'est pas annoncé, on le sonde chaque seconde (voir `ping`). */
const SONDE_MS = 1_000;

export function ChantierCadre() {
  const cadre = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let pret = false;
    let etag: string | null = null;
    let bandeau = false;
    let enCours = false;

    // Le cadre et le hub chargent chacun à leur rythme : le « prêt » du cadre peut partir AVANT que ce
    // composant écoute (l'hydratation vient après le document), et il serait perdu. Le hub sonde donc
    // le cadre (au montage, à son chargement, puis chaque seconde) jusqu'à ce qu'il réponde « prêt ».
    const ping = () => cadre.current?.contentWindow?.postMessage({ type: MESSAGE_PING }, "*");

    const dire = (message: string) => {
      cadre.current?.contentWindow?.postMessage({ type: MESSAGE_ETAT, message }, "*");
      bandeau = message !== "";
    };

    async function lire() {
      const fenetre = cadre.current?.contentWindow;
      if (!pret || !fenetre || enCours) return;
      enCours = true;
      try {
        const reponse = await fetch(URL_RELEVE, {
          cache: "no-store",
          credentials: "same-origin",
          headers: etag ? { "If-None-Match": etag } : {},
        });
        const consigne = consigneDeReponse(reponse.status);
        if (consigne.type === "poster") {
          let octets = await reponse.arrayBuffer();
          if (estGzip(octets)) octets = await decompresser(octets);
          etag = reponse.headers.get("etag");
          fenetre.postMessage({ type: MESSAGE_RELEVE, octets }, "*", [octets]);
          bandeau = false;
        } else if (consigne.type === "inchange") {
          if (bandeau) dire("");
        } else {
          dire(consigne.message);
        }
      } catch {
        dire("Le relevé est indisponible : le hub ne répond pas.");
      } finally {
        enCours = false;
      }
    }

    function surMessage(evenement: MessageEvent) {
      // Seul NOTRE cadre est écouté : n'importe quelle autre fenêtre est ignorée.
      if (evenement.source !== cadre.current?.contentWindow || !estMessagePret(evenement.data)) return;
      if (pret) return; // le cadre répond aussi aux sondes : un deuxième « prêt » ne redemande rien
      pret = true;
      void lire();
    }

    const surVisibilite = () => {
      if (document.visibilityState === "visible") void lire();
    };

    const surChargement = () => ping();
    const cadreEl = cadre.current;

    window.addEventListener("message", surMessage);
    document.addEventListener("visibilitychange", surVisibilite);
    cadreEl?.addEventListener("load", surChargement);
    const minuteur = setInterval(surVisibilite, INTERVALLE_MS);
    const sonde = setInterval(() => (pret ? clearInterval(sonde) : ping()), SONDE_MS);
    ping();
    return () => {
      window.removeEventListener("message", surMessage);
      document.removeEventListener("visibilitychange", surVisibilite);
      cadreEl?.removeEventListener("load", surChargement);
      clearInterval(minuteur);
      clearInterval(sonde);
    };
  }, []);

  return (
    <iframe
      ref={cadre}
      className="chantier-cadre"
      title="Chantier : suivi des tâches, Gantt et coûts"
      src={URL_CADRE}
      sandbox={SANDBOX_CADRE}
      referrerPolicy="no-referrer"
    />
  );
}
