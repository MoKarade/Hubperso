// lib/navigation.ts — ce que la navigation du hub propose, et où on est.
//
// Marc, 22/10/2026 (maquette validée) : une barre latérale à l'ordinateur, une barre du bas au
// téléphone, les mêmes entrées dans les deux : Vue (accueil, attention, et le chantier pour le propriétaire), Apps, Gérer.
// (La page Coûts a disparu le 26/10/2026 : ses infos vivent dans l'onglet Coûts du chantier.)
// Ce fichier est PUR : il décide QUOI afficher et QUELLE entrée est active, il ne rend rien. Le
// composant (`components/Navigation.tsx`) ne fait que peindre ce que lui rend `modeleNavigation`.
//
// ⚠️ Aucune donnée d'état ici : ni point de couleur par app, ni compteur d'alertes. Les deux
// exigeraient de relire les résumés des six apps à CHAQUE navigation (la barre vit dans le
// layout, donc sur toutes les pages) ; une pastille périmée ou inventée serait pire que pas de
// pastille. L'état d'une app se lit sur sa carte et sur /attention.

/** Les icônes de la navigation (tracés dans `components/Navigation.tsx`). */
export type IconeNav = "accueil" | "attention" | "plus" | "graphes" | "chantier" | "admin";

export interface EntreeNav {
  /** Stable : sert de clé et, pour une app, de `HubSource.id`. */
  id: string;
  libelle: string;
  href: string;
  /** Une entrée de page porte une icône ; une entrée d'app porte son logo (`appId`). */
  icone?: IconeNav;
  appId?: string;
  /** Couleur DÉCLARÉE de l'app (`lib/sources.ts`), jamais une couleur d'état. */
  couleur?: string;
}

export interface ModeleNav {
  vue: EntreeNav[];
  apps: EntreeNav[];
  /** Vide pour quiconque n'est pas le propriétaire : graphes et administration lui sont réservés. */
  gerer: EntreeNav[];
}

/** Ce que la navigation sait d'une app : ce qui est DÉCLARÉ, pas ce que l'app publie. */
export interface AppNav {
  id: string;
  nom: string;
  couleur?: string;
}

/** Où se tient la barre du bas : ses trois entrées de page, ou la quatrième, « Plus » (la feuille). */
export type RangBarre = "accueil" | "attention" | "chantier" | "plus";

export function modeleNavigation(apps: readonly AppNav[], proprietaire: boolean): ModeleNav {
  return {
    vue: [
      { id: "accueil", libelle: "Accueil", href: "/", icone: "accueil" },
      { id: "attention", libelle: "Attention", href: "/attention", icone: "attention" },
      // Le Chantier (suivi, Gantt, coûts) prend la place que tenait « Coûts » : propriétaire seul.
      ...(proprietaire ? [{ id: "chantier", libelle: "Chantier", href: "/chantier", icone: "chantier" as const }] : []),
    ],
    apps: apps.map((app) => ({
      id: app.id,
      libelle: app.nom,
      href: `/app/${encodeURIComponent(app.id)}`,
      appId: app.id,
      couleur: app.couleur,
    })),
    gerer: proprietaire
      ? [
          { id: "graphes", libelle: "Graphes de code", href: "/graphes", icone: "graphes" },
          { id: "administration", libelle: "Administration", href: "/administration", icone: "admin" },
        ]
      : [],
  };
}

/** Cette entrée est-elle la page affichée ? « / » ne vaut que pour l'accueil lui-même. */
export function estActive(chemin: string, href: string): boolean {
  if (href === "/") return chemin === "/";
  return chemin === href || chemin.startsWith(`${href}/`);
}

/**
 * Où la barre du bas se tient. Une page d'app est « un cran sous l'accueil » (on y arrive depuis
 * une carte) ; graphes et administration vivent dans « Plus ».
 */
export function rangBarre(chemin: string): RangBarre {
  if (estActive(chemin, "/attention")) return "attention";
  if (estActive(chemin, "/chantier")) return "chantier";
  if (estActive(chemin, "/graphes") || estActive(chemin, "/administration")) {
    return "plus";
  }
  return "accueil";
}

/**
 * Les pages sans navigation : la connexion, le refus d'accès et les pages légales, ouvertes à
 * des gens qui n'ont pas (ou pas encore) accès au hub. Le montage serveur ne rend déjà rien
 * sans accès ; cette liste couvre en plus quelqu'un d'autorisé qui lit les conditions.
 */
const PAGES_SANS_NAVIGATION = ["/login", "/sans-acces", "/conditions", "/confidentialite"];

export function sansNavigation(chemin: string): boolean {
  return PAGES_SANS_NAVIGATION.some((page) => estActive(chemin, page));
}
