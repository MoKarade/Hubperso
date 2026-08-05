// components/WidgetSkeleton.tsx
//
// Place tenue par une carte pendant que son app répond. Ce n'est PAS de la fausse donnée :
// aucune valeur, aucun chiffre, aucun nom d'app inventé — seulement des barres neutres et
// le nom DÉCLARÉ de la source (celui de `lib/sources.ts`, connu sans réseau), plus la
// mention explicite « interrogation… ». Un lecteur ne peut pas confondre ça avec un résultat.
//
// Il porte la MÊME classe de taille que la carte qui le remplacera (`widgetSize` avec les
// mêmes arguments côté page), pour que la grille ne bouge pas au moment de la substitution.

import type { CSSProperties } from "react";
import { widgetSize } from "@/lib/bento";

export function WidgetSkeleton({ name, featured = false }: { name: string; featured?: boolean }) {
  // Un squelette n'a pas de données : `ok=false, metrics=0` → `--sm` hors héros, ce qui
  // occupe la même colonne que le `--md` de la carte réelle (cf. note dans bento.ts).
  const size = widgetSize(false, 0, featured);
  const bars = featured ? 4 : 2;

  return (
    <article
      className={`widget widget--loading ${size}`}
      style={{ "--enter-delay": "0ms" } as CSSProperties}
      aria-busy="true"
    >
      <header className="widget__head">
        <h2 className="widget__title">{name}</h2>
        <span className="badge badge--neutral">interrogation…</span>
      </header>
      <div className="widget__body">
        {Array.from({ length: bars }, (_, i) => (
          <span key={i} className="skeleton__bar" aria-hidden />
        ))}
        <span className="sr-only">Chargement du résumé de {name}…</span>
      </div>
    </article>
  );
}
