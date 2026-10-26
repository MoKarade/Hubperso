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
// Le cadre se présente avec un canal (`MessagePort`, voir `estMessagePret`) : le hub n'écrit QUE dans ce
// canal, jamais par `postMessage(…, "*")` — l'origine du cadre est opaque et un « * » livrerait le relevé à
// n'importe quel document qui occuperait la fenêtre. Le cadre se représente chaque seconde (le hub peut
// n'écouter qu'après l'hydratation) jusqu'à ce que le hub lui réponde « ok » par le canal.

import { useEffect, useRef } from "react";
import {
  MESSAGE_ETAT,
  MESSAGE_OK,
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

export function ChantierCadre() {
  const cadre = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let canal: MessagePort | null = null;
    let etag: string | null = null;
    let bandeau = false;
    let enCours = false;

    const dire = (message: string) => {
      canal?.postMessage({ type: MESSAGE_ETAT, message });
      bandeau = message !== "";
    };

    async function lire() {
      const sortie = canal;
      if (!sortie || enCours) return;
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
          sortie.postMessage({ type: MESSAGE_RELEVE, octets }, [octets]);
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
      // Seul NOTRE cadre est écouté (et son origine est opaque : « null ») ; le premier canal reçu est
      // le bon, les suivants (le cadre se représente tant qu'il n'a pas reçu « ok ») sont ignorés.
      if (evenement.source !== cadre.current?.contentWindow || evenement.origin !== "null") return;
      if (!estMessagePret(evenement.data) || canal) return;
      const [port] = evenement.ports;
      if (!port) return;
      canal = port;
      canal.postMessage({ type: MESSAGE_OK });
      void lire();
    }

    const surVisibilite = () => {
      if (document.visibilityState === "visible") void lire();
    };

    window.addEventListener("message", surMessage);
    document.addEventListener("visibilitychange", surVisibilite);
    const minuteur = setInterval(surVisibilite, INTERVALLE_MS);
    return () => {
      window.removeEventListener("message", surMessage);
      document.removeEventListener("visibilitychange", surVisibilite);
      clearInterval(minuteur);
      canal?.close();
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
