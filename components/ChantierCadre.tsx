"use client";

// components/ChantierCadre.tsx — la page Chantier dans son cadre isolé, et le relevé qui lui arrive.
//
// Le cadre (`/api/chantier/cadre`, origine opaque, aucun réseau) ne peut rien lire seul : c'est CE
// composant, avec la session du propriétaire, qui relit le relevé (`/api/chantier/releve`) et le
// POSTE au cadre. Voir `lib/chantierCadre.ts` pour l'isolement.
//
// ── CE QUI NE DOIT PAS ARRIVER ───────────────────────────────────────────────────────
//
//  - le cadre ne se recharge pas (l'`<iframe>` garde son `src`, la page garde son état) — ni en changeant
//    de page du hub : `ChantierPersistant` le monte dans la mise en page, il y reste caché hors de `/chantier` ;
//  - la base n'est pas relue à chaque tour : le relevé est redemandé avec `If-None-Match`, la route
//    répond 304 sans lire le contenu tant que le PC n'a rien envoyé de neuf (toutes les 10 min) ;
//  - rien n'est demandé onglet caché, ni cadre caché (hors de `/chantier`) ; au retour, une lecture tout de suite.
//
// Le cadre se présente avec un canal (`MessagePort`, voir `estMessagePret`) : le hub n'écrit QUE dans ce
// canal, jamais par `postMessage(…, "*")` — l'origine du cadre est opaque et un « * » livrerait le relevé à
// n'importe quel document qui occuperait la fenêtre. Le cadre se représente chaque seconde (le hub peut
// n'écouter qu'après l'hydratation) jusqu'à ce que le hub lui réponde « ok » par le canal.

import { useEffect, useRef, useState } from "react";
import { erreurGeste } from "@/lib/chantierGestes";
import { EVENEMENT_LIA_CLIC_CADRE } from "@/lib/lia";
import {
  MESSAGE_CLIC_DROIT,
  MESSAGE_COUTS,
  MESSAGE_ETAT,
  MESSAGE_GESTE,
  MESSAGE_OK,
  MESSAGE_ONGLET,
  MESSAGE_RECHARGE,
  MESSAGE_RELEVE,
  MESSAGE_VERSION_NEUVE,
  SANDBOX_CADRE,
  URL_CADRE,
  URL_COUTS,
  URL_GESTES,
  URL_RELEVE,
  consigneDeReponse,
  erreurCouts,
  estGzip,
  estMessagePret,
  lireClicDroit,
  type ONGLETS,
} from "@/lib/chantierCadre";

async function decompresser(gzip: ArrayBuffer): Promise<ArrayBuffer> {
  const flux = new Blob([gzip]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(flux).arrayBuffer();
}

/** Le PC envoie toutes les 10 min ; relire chaque minute suffit, et 304 ne coûte pas la lecture en base. */
const INTERVALLE_MS = 60_000;

/** Les coûts demandent un tour chez chaque app : toutes les 5 min, onglet visible seulement. */
const INTERVALLE_COUTS_MS = 300_000;

/** La version du document du cadre (son ETag, sans lire la base) : toutes les 5 min, onglet visible seulement. */
const INTERVALLE_VERSION_MS = 300_000;

type Onglet = (typeof ONGLETS)[number];

export function ChantierCadre({ onglet = null, actif = true }: { onglet?: Onglet | null; actif?: boolean }) {
  const cadre = useRef<HTMLIFrameElement>(null);
  // L'adresse du cadre ne change jamais après le premier rendu : un autre `src` rechargerait le document.
  const [src] = useState(() => (onglet ? `${URL_CADRE}#${onglet}` : URL_CADRE));
  const actifRef = useRef(actif);
  const actions = useRef<{ reveiller: () => void; onglet: (o: Onglet) => void } | null>(null);

  useEffect(() => {
    let canal: MessagePort | null = null;
    let etag: string | null = null;
    let bandeau = false;
    let enCours = false;
    let coutsEnCours = false;
    let coutsLusA = 0;
    let versionLueA = 0;
    let versionCadre: string | null = null;

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

    async function lireCouts() {
      const sortie = canal;
      if (!sortie || coutsEnCours) return;
      coutsEnCours = true;
      try {
        const reponse = await fetch(URL_COUTS, { cache: "no-store", credentials: "same-origin" });
        if (reponse.ok) {
          sortie.postMessage({ type: MESSAGE_COUTS, couts: await reponse.json() });
        } else {
          sortie.postMessage({ type: MESSAGE_COUTS, erreur: erreurCouts(reponse.status) });
        }
      } catch {
        sortie.postMessage({ type: MESSAGE_COUTS, erreur: "Les coûts des apps sont indisponibles : le hub ne répond pas." });
      } finally {
        coutsLusA = Date.now();
        coutsEnCours = false;
      }
    }

    /**
     * Le cadre ne se recharge jamais seul : un déploiement qui change `chantier/cadre.html` ne l'atteindrait pas avant que la
     * personne recharge la page. On relit donc l'ETag du document (HEAD : aucun corps, aucune lecture en base) ; s'il change,
     * le cadre est prévenu et se recharge quand plus personne ne s'en sert (il garde son onglet dans son adresse).
     */
    async function verifierVersion() {
      versionLueA = Date.now();
      try {
        const reponse = await fetch(URL_CADRE, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
        const version = reponse.status === 200 ? reponse.headers.get("etag") : null;
        if (!version) return;
        const changee = versionCadre !== null && version !== versionCadre;
        versionCadre = version;
        if (changee) canal?.postMessage({ type: MESSAGE_VERSION_NEUVE });
      } catch {
        // Un hub qui ne répond pas ne change rien : la prochaine vérification réessaie.
      }
    }

    /**
     * Le cadre remet un geste (Fusionner, Fait, une réponse) : le hub le dépose avec la session du propriétaire, le
     * cadre n'ayant ni réseau ni Drive. Le serveur valide tout ; ici on ne relaie que ce qui a la forme d'un geste,
     * et la réponse repart dans le canal avec l'`id` du geste (jamais ailleurs).
     */
    async function deposerGeste(donnee: unknown) {
      const sortie = canal;
      const geste = (donnee as { geste?: unknown } | null)?.geste;
      const id = (geste as { id?: unknown } | null)?.id;
      if (!sortie || typeof geste !== "object" || geste === null || typeof id !== "string") return;
      try {
        const reponse = await fetch(URL_GESTES, {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(geste),
        });
        sortie.postMessage(
          reponse.ok
            ? { type: MESSAGE_GESTE, id, ok: true }
            : { type: MESSAGE_GESTE, id, ok: false, erreur: erreurGeste(reponse.status) },
        );
      } catch {
        sortie.postMessage({ type: MESSAGE_GESTE, id, ok: false, erreur: "Le geste n'est pas déposé : le hub ne répond pas." });
      }
    }

    /**
     * Un clic droit (ou un appui long) dans le cadre : LIA ne peut pas lire ce document, c'est donc ici qu'il lui est dit, par la
     * fenêtre (`LiaBoot` écoute). Ce que le cadre envoie est une donnée : seule la forme validée (`lireClicDroit`) passe.
     */
    function relayerClicDroit(donnee: unknown) {
      const iframe = cadre.current;
      const clic = lireClicDroit(donnee);
      if (!iframe || !clic || !actifRef.current) return;
      window.dispatchEvent(new CustomEvent(EVENEMENT_LIA_CLIC_CADRE, { detail: { cadre: iframe, ...clic } }));
    }

    function surMessage(evenement: MessageEvent) {
      // Seul NOTRE cadre est écouté (et son origine est opaque : « null ») ; le premier canal reçu est
      // le bon, les suivants (le cadre se représente tant qu'il n'a pas reçu « ok ») sont ignorés.
      if (evenement.source !== cadre.current?.contentWindow || evenement.origin !== "null") return;
      if (!estMessagePret(evenement.data) || canal) return;
      const [port] = evenement.ports;
      if (!port) return;
      canal = port;
      canal.onmessage = (m: MessageEvent) => {
        const type = (m.data as { type?: unknown } | null)?.type;
        if (type === MESSAGE_GESTE) void deposerGeste(m.data);
        else if (type === MESSAGE_CLIC_DROIT) relayerClicDroit(m.data);
        else if (type === MESSAGE_RECHARGE) {
          // Le cadre se recharge : son document neuf se présentera avec un canal neuf, qu'il faut alors accepter.
          canal?.close();
          canal = null;
          etag = null;
          bandeau = false;
        }
      };
      canal.postMessage({ type: MESSAGE_OK, gestes: true });
      void lire();
      void lireCouts();
    }

    const surVisibilite = () => {
      if (!actifRef.current || document.visibilityState !== "visible") return;
      void lire();
      if (Date.now() - coutsLusA >= INTERVALLE_COUTS_MS) void lireCouts();
      if (Date.now() - versionLueA >= INTERVALLE_VERSION_MS) void verifierVersion();
    };

    actions.current = {
      reveiller: surVisibilite,
      onglet: (o) => canal?.postMessage({ type: MESSAGE_ONGLET, onglet: o }),
    };
    window.addEventListener("message", surMessage);
    document.addEventListener("visibilitychange", surVisibilite);
    const minuteur = setInterval(surVisibilite, INTERVALLE_MS);
    return () => {
      window.removeEventListener("message", surMessage);
      document.removeEventListener("visibilitychange", surVisibilite);
      clearInterval(minuteur);
      actions.current = null;
      canal?.close();
    };
  }, []);

  // Cadre caché → rien n'est lu ; de retour sur `/chantier` → une lecture tout de suite, et l'onglet demandé par l'adresse.
  useEffect(() => {
    actifRef.current = actif;
    if (!actif) return;
    actions.current?.reveiller();
    if (onglet) actions.current?.onglet(onglet);
  }, [actif, onglet]);

  return (
    <iframe
      ref={cadre}
      className={actif ? "chantier-cadre" : "chantier-cadre chantier-cadre--cache"}
      title="Chantier : suivi des tâches, Gantt et coûts"
      src={src}
      sandbox={SANDBOX_CADRE}
      referrerPolicy="no-referrer"
    />
  );
}
