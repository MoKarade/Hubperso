// components/ConstellationVivante.tsx — le ciel de l'accueil : un astre par app.
//
// Marc, 21/10/2026 : refonte de l'accueil, « peu de texte, gros caractères, beaucoup
// d'animations ». Chaque astre porte la couleur de son app et respire selon son VRAI état
// (`lib/astres.ts`, même source que le badge de la carte) : un astre calme est une app à jour,
// un anneau en tirets est une panne, un pointillé qui tourne est une app en construction.
// Rien n'est inventé : une app non déclarée dans `lib/sources.ts` n'a pas d'astre, et un astre
// n'a ni chiffre ni jauge.
//
// La scène ne dépend QUE du nombre d'apps (`dispositionAstres`) : elle part avant la moindre
// réponse, chaque astre remplace son attente quand SON app a répondu (rendu en flux).

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { SummaryResult } from "@/lib/fetchSummary";
import type { HubSource } from "@/lib/sources";
import { destinationAstre, etatAstre, type PositionAstre } from "@/lib/astres";
import { texteSur } from "@/lib/couleur";

/** Le fil qui relie l'astre au cœur du hub : dans la même liste que l'astre, donc streamé avec lui. */
function Lien({ position, n }: { position: PositionAstre; n: number }) {
  return (
    <svg
      className="ciel__lien"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      style={{ "--n": n } as CSSProperties}
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

/** Un astre dont l'app a répondu (ou échoué : l'échec est un état, pas une absence). */
export function AstreApp({
  result,
  position,
  n,
  grand,
}: {
  result: SummaryResult;
  position: PositionAstre;
  n: number;
  grand: boolean;
}) {
  const { genre, mot } = etatAstre(result);
  const nom = result.state === "ok" ? result.summary.app.name : result.source.name;
  const accent = result.state === "ok" ? result.summary.app.color : result.source.couleur;
  const { href, externe } = destinationAstre(result);
  const contenu: ReactNode = (
    <>
      <span className="astre__corps" aria-hidden>
        <span className="astre__halo" />
        <span className="astre__initiale">{nom.charAt(0)}</span>
      </span>
      <span className="astre__nom">{nom}</span>
      <span className="astre__mot">{mot}</span>
    </>
  );
  const props = {
    className: "astre",
    "data-etat": genre,
    "data-grand": grand ? "oui" : undefined,
    style: styleAstre(position, n, accent),
    "aria-label": `${nom} : ${mot}`,
  };
  return (
    <li className="ciel__item" role="listitem">
      <Lien position={position} n={n} />
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
  grand,
}: {
  source: HubSource;
  position: PositionAstre;
  n: number;
  grand: boolean;
}) {
  return (
    <li className="ciel__item" role="listitem" aria-busy="true">
      <Lien position={position} n={n} />
      <span
        className="astre"
        data-etat="attente"
        data-grand={grand ? "oui" : undefined}
        style={styleAstre(position, n, source.couleur)}
      >
        <span className="astre__corps" aria-hidden>
          <span className="astre__halo" />
          <span className="astre__initiale">{source.name.charAt(0)}</span>
        </span>
        <span className="astre__nom">{source.name}</span>
        <span className="astre__mot">Lecture…</span>
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
      <span className="ciel__coeur" aria-hidden />
      <ul className="ciel__liste">{children}</ul>
    </section>
  );
}
