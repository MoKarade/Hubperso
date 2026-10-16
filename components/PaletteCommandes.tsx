"use client";

// La palette de commandes (Ctrl+K / ⌘K). Composant CLIENT : elle vit du clavier.
//
// Aucune librairie : la CSP du hub est enforcée (`default-src 'self'`), et le besoin tient
// en une centaine de lignes. Le FILTRAGE, lui, est pur et vit dans `lib/palette.ts`, où il
// se teste sans monter de DOM — c'est là qu'est la logique, ici il n'y a que du clavier.
//
// ⚠️ Elle NAVIGUE, elle ne déclenche rien. Voir l'en-tête de `lib/palette.ts` : une palette
// est faite pour taper vite et valider sans relire, ce qui est exactement le contraire de ce
// qu'on veut avant une mutation dans une app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { filtrer, type Commande } from "@/lib/palette";

export function PaletteCommandes({ commandes }: { commandes: Commande[] }) {
  const router = useRouter();
  const [ouverte, setOuverte] = useState(false);
  const [requete, setRequete] = useState("");
  const [curseur, setCurseur] = useState(0);
  const champRef = useRef<HTMLInputElement>(null);

  const resultats = useMemo(() => filtrer(commandes, requete), [commandes, requete]);

  const fermer = useCallback(() => {
    setOuverte(false);
    setRequete("");
    setCurseur(0);
  }, []);

  // Ctrl+K / ⌘K ouvre, Échap ferme. Écouté sur le document parce que le raccourci doit
  // marcher où que soit le focus.
  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOuverte((o) => !o);
        return;
      }
      if (e.key === "Escape") fermer();
    }
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [fermer]);

  useEffect(() => {
    if (ouverte) champRef.current?.focus();
  }, [ouverte]);

  const lancer = useCallback(
    (commande: Commande) => {
      fermer();
      if (commande.genre === "externe") {
        // `noopener` : la page ouverte ne doit pas garder une poignée sur le hub.
        window.open(commande.cible, "_blank", "noopener,noreferrer");
        return;
      }
      router.push(commande.cible);
    },
    [fermer, router],
  );

  if (!ouverte) return null;

  const surToucheChamp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCurseur((c) => (resultats.length === 0 ? 0 : (c + 1) % resultats.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCurseur((c) => (resultats.length === 0 ? 0 : (c - 1 + resultats.length) % resultats.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const choisie = resultats[curseur];
      if (choisie) lancer(choisie);
    }
  };

  return (
    <div className="palette__fond" onClick={fermer} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={champRef}
          className="palette__champ"
          type="text"
          value={requete}
          onChange={(e) => {
            setRequete(e.target.value);
            // Le curseur revient en tête à chaque frappe : sinon il resterait sur un index qui ne
            // désigne plus la même commande, et Entrée ouvrirait autre chose que ce qui est surligné.
            setCurseur(0);
          }}
          onKeyDown={surToucheChamp}
          placeholder="Aller à une app, une page…"
          aria-label="Rechercher une commande"
          aria-controls="palette-liste"
          aria-activedescendant={resultats[curseur] ? `palette-${resultats[curseur].id}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {resultats.length === 0 ? (
          <p className="palette__vide">Aucune commande ne correspond.</p>
        ) : (
          <ul className="palette__liste" id="palette-liste" role="listbox">
            {resultats.map((commande, i) => (
              <li
                key={commande.id}
                id={`palette-${commande.id}`}
                role="option"
                aria-selected={i === curseur}
                className="palette__ligne"
                data-actif={i === curseur ? "" : undefined}
                onMouseEnter={() => setCurseur(i)}
                onClick={() => lancer(commande)}
              >
                <span className="palette__libelle">{commande.libelle}</span>
                {commande.contexte && (
                  <span className="palette__contexte">{commande.contexte}</span>
                )}
                {commande.genre === "externe" && (
                  <span className="palette__externe" aria-label="ouvre dans un nouvel onglet">
                    ↗
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
