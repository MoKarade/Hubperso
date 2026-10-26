"use client";

// components/Navigation.tsx — la navigation du hub : barre latérale (≥ 1024 px) ou barre du bas
// avec sa feuille « Plus » (en dessous). Maquette validée par Marc le 22/10/2026.
//
// Composant CLIENT parce qu'il lit l'URL (page active) et ouvre une feuille. Ce qu'il montre est
// décidé en amont : `lib/navigation.ts` (le contenu), `components/NavigationMontee.tsx` (qui a
// le droit de la voir). Ici on ne fait que peindre, sans jamais rien décider d'autorisation.
//
// Les DEUX barres sont toujours dans le DOM, et la feuille de style n'en laisse qu'une visible
// (`display: none` les retire aussi pour les lecteurs d'écran : une seule navigation annoncée).
// Les libellés des deux landmarks diffèrent quand même, au cas où une règle changerait.
//
// Accessibilité : `aria-current="page"` sur l'entrée active, anneau de focus du hub, cibles de
// 44 px, lien d'évitement vers le contenu, et la feuille « Plus » est un dialogue : le focus y
// entre, Tab y reste, Échap la ferme et le focus revient sur « Plus ».

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { aUnLogo } from "@/lib/logos";
import {
  estActive,
  rangBarre,
  sansNavigation,
  type EntreeNav,
  type IconeNav,
  type ModeleNav,
} from "@/lib/navigation";
import { LogoApp } from "./LogoApp";

/** Tracés sur une grille de 24, en `currentColor` : l'icône suit le texte, aucune couleur écrite. */
const TRACES: Record<IconeNav, ReactNode> = {
  accueil: (
    <>
      <path d="M4 11.5 12 4l8 7.5V20H4z" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  attention: (
    <>
      <path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" />
      <path d="M10 21h4" />
    </>
  ),
  plus: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
  graphes: (
    <>
      <circle cx="6" cy="7" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M8 7.5l8-1M7 9l4 7M17 8l-4 8" />
    </>
  ),
  chantier: (
    <>
      <path d="M4 7h7M7 12h10M5 17h8" />
    </>
  ),
  admin: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
};

function Icone({ nom }: { nom: IconeNav }) {
  return (
    <svg className="nav__ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {TRACES[nom]}
    </svg>
  );
}

/** Le logo de l'app dans sa couleur DÉCLARÉE ; une app sans logo garde son initiale, rien d'inventé. */
function Pastille({ entree }: { entree: EntreeNav }) {
  const style = entree.couleur ? ({ "--accent": entree.couleur } as CSSProperties) : undefined;
  if (entree.appId && aUnLogo(entree.appId)) {
    return (
      <span className="nav__logo" style={style} aria-hidden="true">
        <LogoApp id={entree.appId} />
      </span>
    );
  }
  return (
    <span className="nav__logo nav__initiale" style={style} aria-hidden="true">
      {entree.libelle.slice(0, 1)}
    </span>
  );
}

function Lien({ entree, chemin }: { entree: EntreeNav; chemin: string }) {
  const active = estActive(chemin, entree.href);
  return (
    <Link
      className="nav__lien"
      href={entree.href}
      aria-current={active ? "page" : undefined}
      prefetch={false}
    >
      {entree.icone ? <Icone nom={entree.icone} /> : <Pastille entree={entree} />}
      <span>{entree.libelle}</span>
    </Link>
  );
}

function Groupe({ titre, entrees, chemin }: { titre: string; entrees: EntreeNav[]; chemin: string }) {
  if (entrees.length === 0) return null;
  return (
    <div className="nav__groupe">
      <p className="nav__titre">{titre}</p>
      {entrees.map((entree) => (
        <Lien key={entree.id} entree={entree} chemin={chemin} />
      ))}
    </div>
  );
}

const FOCALISABLES = 'a[href], button:not([disabled])';

function Navigation({ modele, chemin }: { modele: ModeleNav; chemin: string }) {
  // La feuille n'est ouverte que pour la page où on l'a ouverte : changer de page la referme, sans
  // effet de bord à synchroniser (`ouvertePour` ≠ `chemin` suffit).
  const [ouvertePour, setOuvertePour] = useState<string | null>(null);
  const ouverte = ouvertePour === chemin;
  const feuilleRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ouverte) return;
    const bouton = plusRef.current;
    feuilleRef.current?.querySelector<HTMLElement>(FOCALISABLES)?.focus();
    return () => bouton?.focus();
  }, [ouverte]);

  const fermer = () => setOuvertePour(null);

  function surTouche(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      fermer();
      return;
    }
    if (e.key !== "Tab") return;
    // Le focus reste dans la feuille tant qu'elle est ouverte.
    const cibles = [...(feuilleRef.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? [])];
    const premiere = cibles[0];
    const derniere = cibles[cibles.length - 1];
    if (!premiere || !derniere) return;
    if (e.shiftKey && document.activeElement === premiere) {
      e.preventDefault();
      derniere.focus();
    } else if (!e.shiftKey && document.activeElement === derniere) {
      e.preventDefault();
      premiere.focus();
    }
  }

  const rang = rangBarre(chemin);

  return (
    <>
      <nav className="nav" aria-label="Navigation principale">
        <p className="nav__marque">hubperso</p>
        <Groupe titre="Vue" entrees={modele.vue} chemin={chemin} />
        <Groupe titre="Apps" entrees={modele.apps} chemin={chemin} />
        <Groupe titre="Gérer" entrees={modele.gerer} chemin={chemin} />
      </nav>

      <nav className="barre" aria-label="Navigation rapide">
        {modele.vue.map((entree) => (
          <Link
            key={entree.id}
            className="barre__item"
            href={entree.href}
            aria-current={!ouverte && rang === entree.id ? "page" : undefined}
            prefetch={false}
          >
            {entree.icone && <Icone nom={entree.icone} />}
            <span>{entree.libelle}</span>
          </Link>
        ))}
        <button
          ref={plusRef}
          type="button"
          className="barre__item"
          aria-haspopup="dialog"
          aria-expanded={ouverte}
          aria-current={ouverte || rang === "plus" ? "page" : undefined}
          onClick={() => setOuvertePour(ouverte ? null : chemin)}
        >
          <Icone nom="plus" />
          <span>Plus</span>
        </button>
      </nav>

      {ouverte && (
        <div className="feuille__fond" onClick={fermer} role="presentation">
          <div
            ref={feuilleRef}
            className="feuille"
            role="dialog"
            aria-modal="true"
            aria-label="Plus"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={surTouche}
          >
            <Groupe titre="Apps" entrees={modele.apps} chemin={chemin} />
            <Groupe titre="Gérer" entrees={modele.gerer} chemin={chemin} />
            <button type="button" className="feuille__fermer" onClick={fermer}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Le cadre des pages : la navigation autour, le contenu dedans. Sur la connexion, le refus et les
 * pages légales (`sansNavigation`), les pages sont rendues telles quelles.
 */
export function Cadre({ modele, children }: { modele: ModeleNav; children: ReactNode }) {
  const chemin = usePathname();
  if (sansNavigation(chemin)) return <>{children}</>;
  return (
    <div className="cadre">
      <a className="cadre__saut" href="#contenu">
        Aller au contenu
      </a>
      <Navigation modele={modele} chemin={chemin} />
      <div className="cadre__contenu" id="contenu" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
