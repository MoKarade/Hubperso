// components/ConstellationVivante.tsx — le ciel de l'accueil : un astre par app.
//
// Marc, 21/10/2026 : refonte de l'accueil, « presque aucun texte, plus fin, plus rempli, plus
// animé, plus de détails ». Chaque astre porte la couleur de son app et respire selon son VRAI
// état (`lib/astres.ts`, même source que le badge de la carte). L'état se lit à la FORME
// (anneau plein, tirets, pointillé, pastille à pictogramme) avant la teinte ; le mot du badge
// reste dans la page : lu par les lecteurs d'écran, montré au survol et au focus.
// Détails qui disent quelque chose de vrai : un satellite par alerte publiée, un segment de
// l'anneau du cœur par app, un paquet de lumière qui part du cœur vers chaque app à jour.
// Le fond (étoiles, orbites) est du DÉCOR : il ne représente aucune donnée.
//
// La scène ne dépend QUE du nombre d'apps (`dispositionAstres`) : elle part avant la moindre
// réponse, chaque astre remplace son attente quand SON app a répondu (rendu en flux).

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { SummaryResult } from "@/lib/fetchSummary";
import type { HubSource } from "@/lib/sources";
import {
  destinationAstre,
  etatAstre,
  etoiles,
  satellitesAstre,
  type GenreAstre,
  type PositionAstre,
} from "@/lib/astres";
import { texteSur } from "@/lib/couleur";

const ETOILES = etoiles(56);

/** Tracés des pastilles, grille 24×24 : une FORME par genre, pas seulement une teinte. */
const GLYPHES: Record<GenreAstre | "attente", ReactNode> = {
  vivant: <path d="m6.5 12.5 3.6 3.6 7.4-8" />,
  retard: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 8v4.2l2.8 1.8" />
    </>
  ),
  panne: (
    <>
      <path d="M12 6.5v6.2" />
      <path d="M12 16.6h.01" />
    </>
  ),
  construction: (
    <>
      <path d="M7.2 12h.01" />
      <path d="M12 12h.01" />
      <path d="M16.8 12h.01" />
    </>
  ),
  absent: <path d="M7 12h10" />,
  attente: <path d="M12 6.5a5.5 5.5 0 1 0 5.5 5.5" />,
};

function Glyphe({ genre }: { genre: GenreAstre | "attente" }) {
  return (
    <svg
      className="astre__glyphe"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHES[genre]}
    </svg>
  );
}

/** Le fil qui relie l'astre au cœur du hub : dans la même liste que l'astre, donc streamé avec lui. */
function Lien({ position }: { position: PositionAstre }) {
  return (
    <svg
      className="ciel__lien"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <line
        className="ciel__fil ciel__fil--rond"
        x1="50"
        y1="50"
        x2={position.x}
        y2={position.y}
        vectorEffect="non-scaling-stroke"
      />
      <line
        className="ciel__fil ciel__fil--rangee"
        x1="50"
        y1="50"
        x2={position.lx}
        y2={position.ly}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Le segment de l'anneau du cœur qui revient à cette app : l'anneau complet est la somme des
 * astres, un segment par app, à la teinte de son état. Dessiné ici (et non dans le cœur) pour
 * être streamé avec l'astre : l'anneau se remplit à mesure que les apps répondent.
 */
function Segment({
  n,
  total,
  genre,
  accent,
}: {
  n: number;
  total: number;
  genre: GenreAstre | "attente";
  accent?: string;
}) {
  const part = 360 / total;
  const vide = Math.min(10, part * 0.3);
  return (
    <svg
      className="ciel__segment"
      data-etat={genre}
      style={(accent ? { "--accent": accent } : undefined) as CSSProperties | undefined}
      viewBox="0 0 100 100"
      aria-hidden
      focusable="false"
    >
      <circle
        cx="50"
        cy="50"
        r="46"
        pathLength="360"
        strokeDasharray={`${part - vide} ${360 - part + vide}`}
        strokeDashoffset={-(n * part + vide / 2)}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}

function styleAstre(position: PositionAstre, n: number, accent?: string): CSSProperties {
  const texte = texteSur(accent);
  return {
    "--x": `${position.x}%`,
    "--y": `${position.y}%`,
    "--lx": `${position.lx}%`,
    "--ly": `${position.ly}%`,
    "--n": n,
    ...(accent ? { "--accent": accent } : null),
    ...(texte ? { "--accent-texte": texte } : null),
  } as CSSProperties;
}

/** Le corps de l'astre : disque, graduation, souffle, satellites, initiale, pastille d'état. */
function Corps({
  nom,
  genre,
  tons,
}: {
  nom: string;
  genre: GenreAstre | "attente";
  tons: readonly string[];
}) {
  return (
    <span className="astre__corps" aria-hidden>
      <span className="astre__graduation" />
      <span className="astre__halo" />
      {tons.length > 0 && (
        <span className="astre__orbite">
          {tons.map((ton, k) => (
            <i
              key={k}
              className="astre__sat"
              data-ton={ton}
              style={{ "--a": `${(360 / tons.length) * k}deg` } as CSSProperties}
            />
          ))}
        </span>
      )}
      <span className="astre__initiale">{nom.charAt(0)}</span>
      <span className="astre__pastille" data-etat={genre}>
        <Glyphe genre={genre} />
      </span>
    </span>
  );
}

/** Un astre dont l'app a répondu (ou échoué : l'échec est un état, pas une absence). */
export function AstreApp({
  result,
  position,
  n,
  total,
  grand,
}: {
  result: SummaryResult;
  position: PositionAstre;
  n: number;
  total: number;
  grand: boolean;
}) {
  const { genre, mot } = etatAstre(result);
  const { tons, total: nbAlertes } = satellitesAstre(result);
  const nom = result.state === "ok" ? result.summary.app.name : result.source.name;
  const accent = result.state === "ok" ? result.summary.app.color : result.source.couleur;
  const { href, externe } = destinationAstre(result);
  const alertes = nbAlertes > 0 ? `, ${nbAlertes} alerte${nbAlertes > 1 ? "s" : ""}` : "";
  const contenu: ReactNode = (
    <>
      <Corps nom={nom} genre={genre} tons={tons} />
      <span className="astre__nom">{nom}</span>
      <span className="astre__mot">{mot}</span>
    </>
  );
  const props = {
    className: "astre",
    "data-etat": genre,
    "data-grand": grand ? "oui" : undefined,
    style: styleAstre(position, n, accent),
    "aria-label": `${nom} : ${mot}${alertes}`,
  };
  return (
    <li className="ciel__item" role="listitem">
      <Lien position={position} />
      {genre === "vivant" && <i className="ciel__paquet" style={styleAstre(position, n, accent)} />}
      <Segment n={n} total={total} genre={genre} accent={accent} />
      {externe ? (
        // Pas de `target="_blank"` : même verrou PWA que le titre d'une carte (`tests/pwaLiens.test.ts`).
        <a {...props} href={href} rel="noreferrer">
          {contenu}
        </a>
      ) : (
        <Link {...props} href={href}>
          {contenu}
        </Link>
      )}
    </li>
  );
}

/** L'astre pendant que son app répond : le nom, un pointillé qui tourne, aucun état affirmé. */
export function AstreAttente({
  source,
  position,
  n,
  total,
  grand,
}: {
  source: HubSource;
  position: PositionAstre;
  n: number;
  total: number;
  grand: boolean;
}) {
  return (
    <li className="ciel__item" role="listitem" aria-busy="true">
      <Lien position={position} />
      <Segment n={n} total={total} genre="attente" accent={source.couleur} />
      <span
        className="astre"
        data-etat="attente"
        data-grand={grand ? "oui" : undefined}
        style={styleAstre(position, n, source.couleur)}
      >
        <Corps nom={source.name} genre="attente" tons={[]} />
        <span className="astre__nom">{source.name}</span>
        <span className="sr-only">Lecture en cours</span>
      </span>
    </li>
  );
}

/**
 * La scène. `children` reçoit les astres (un par source, dans l'ordre de `lib/sources.ts`, donc
 * l'ordre de tabulation est celui des cartes) ; leurs positions viennent de `dispositionAstres`.
 */
export function ConstellationVivante({ children }: { children: ReactNode }) {
  return (
    <section className="ciel" aria-label="État des apps">
      <div className="ciel__fond" aria-hidden>
        {ETOILES.map((e, i) => (
          <i
            key={i}
            className="ciel__etoile"
            style={{ "--x": `${e.x}%`, "--y": `${e.y}%`, "--r": `${e.r}px`, "--d": `${e.d}s` } as CSSProperties}
          />
        ))}
        <i className="ciel__filante" />
        <i className="ciel__filante ciel__filante--2" />
        <span className="ciel__orbite ciel__orbite--1">
          <i />
        </span>
        <span className="ciel__orbite ciel__orbite--2">
          <i />
        </span>
        <span className="ciel__orbite ciel__orbite--3">
          <i />
        </span>
      </div>
      <span className="ciel__coeur" aria-hidden>
        <span className="ciel__noyau" />
      </span>
      <ul className="ciel__liste">{children}</ul>
    </section>
  );
}
