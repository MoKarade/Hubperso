"use client";

// components/BilansVue.tsx — l'onglet « Bilans » : le bilan du jour ou de la semaine, avec les précédents à relire.
//
// La liste vient de `/api/bilans` (session du propriétaire, Drive côté serveur). Le bilan lui-même s'affiche dans
// un <iframe sandbox> (origine opaque, aucun réseau : `lib/bilans.ts`) — jamais inséré dans cette page. Aucune
// relecture automatique : un bilan se dépose une fois par jour, le bouton « Actualiser » suffit.

import { useEffect, useState } from "react";
import { SANDBOX_BILAN, type Bilan, type GenreBilan } from "@/lib/bilans";
import {
  bilansDeReponse,
  duGenre,
  libelleDateBilan,
  LIBELLE_GENRE,
  messageErreurBilans,
  URL_BILANS,
  VIDE_GENRE,
} from "@/lib/bilansVue";

type Etat = { type: "chargement" } | { type: "erreur"; message: string } | { type: "ok"; bilans: Bilan[] };

/** Lit la liste ; ne lève jamais : un échec est un état qui se dit. */
async function lireBilans(): Promise<Etat> {
  try {
    const r = await fetch(URL_BILANS, { cache: "no-store", credentials: "same-origin" });
    let json: unknown = null;
    try {
      json = await r.json();
    } catch {
      json = null;
    }
    if (!r.ok) return { type: "erreur", message: messageErreurBilans(r.status) };
    const bilans = bilansDeReponse(json);
    return bilans ? { type: "ok", bilans } : { type: "erreur", message: messageErreurBilans(502) };
  } catch {
    return { type: "erreur", message: messageErreurBilans(502) };
  }
}

export function BilansVue() {
  const [etat, setEtat] = useState<Etat>({ type: "chargement" });
  const [genre, setGenre] = useState<GenreBilan>("jour");
  const [choisi, setChoisi] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    void lireBilans().then((e) => {
      if (vivant) setEtat(e);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const actualiser = () => {
    setEtat({ type: "chargement" });
    void lireBilans().then(setEtat);
  };

  const liste = etat.type === "ok" ? duGenre(etat.bilans, genre) : [];
  const actif = liste.find((b) => b.id === choisi) ?? liste[0] ?? null;

  return (
    <div className="bilans">
      <div className="bilans__barre">
        <div className="bilans__onglets" role="tablist" aria-label="Genre de bilan">
          {(["jour", "semaine"] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              id={`bilans-onglet-${g}`}
              aria-selected={genre === g}
              aria-controls="bilans-panneau"
              className="bilans__onglet"
              onClick={() => {
                setGenre(g);
                setChoisi(null);
              }}
            >
              {LIBELLE_GENRE[g]}
            </button>
          ))}
        </div>
        <button type="button" className="bilans__actualiser" onClick={actualiser} disabled={etat.type === "chargement"}>
          Actualiser
        </button>
      </div>

      <div id="bilans-panneau" role="tabpanel" aria-labelledby={`bilans-onglet-${genre}`} className="bilans__panneau">
        {etat.type === "chargement" && (
          <p className="bilans__etat" role="status">
            Chargement…
          </p>
        )}
        {etat.type === "erreur" && (
          <p className="bilans__etat bilans__etat--erreur" role="alert">
            {etat.message}
          </p>
        )}
        {etat.type === "ok" && !actif && <p className="bilans__etat">{VIDE_GENRE[genre]}</p>}
        {etat.type === "ok" && actif && (
          <>
            <h2 className="bilans__date">{libelleDateBilan(actif.date)}</h2>
            <iframe
              key={actif.id}
              className="bilans__cadre"
              title={`Bilan ${LIBELLE_GENRE[genre].toLowerCase()} du ${libelleDateBilan(actif.date)}`}
              src={`${URL_BILANS}/${encodeURIComponent(actif.id)}`}
              sandbox={SANDBOX_BILAN}
              referrerPolicy="no-referrer"
            />
            {liste.length > 1 && (
              <nav className="bilans__precedents" aria-label="Bilans précédents">
                {liste.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="bilans__precedent"
                    aria-current={b.id === actif.id ? "true" : undefined}
                    onClick={() => setChoisi(b.id)}
                  >
                    {libelleDateBilan(b.date)}
                  </button>
                ))}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
