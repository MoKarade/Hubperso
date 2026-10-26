// lib/palette.ts — les commandes de la palette (Ctrl+K) et leur filtrage. PUR.
//
// ── CE QUE LA PALETTE FAIT, ET CE QU'ELLE NE FERA PAS ───────────────────────────────
//
// Elle NAVIGUE. Elle ne déclenche rien.
//
// Le hub sait depuis peu POSTer une action `kind: "trigger"` chez une app, avec son jeton
// (ADR 0002). Mettre ces actions dans une palette serait pourtant une faute : une palette
// est faite pour taper vite et valider sans relire — c'est même tout son intérêt. Une
// mutation réelle dans une app, déclenchée par une frappe approximative suivie d'un Entrée
// réflexe, n'a rien à faire là. Le champ `confirm` du contrat existe justement parce que ces
// actions méritent un temps d'arrêt ; la palette est l'endroit qui le supprime.
//
// Les actions restent donc sur les cartes, où l'on clique en ayant lu.
//
// ── POURQUOI L'INSENSIBILITÉ AUX ACCENTS N'EST PAS UN DÉTAIL ────────────────────────
//
// L'écosystème est francophone : « coûts », « accès », « détail ». Personne ne tape l'accent
// circonflexe dans un champ de recherche. Une comparaison naïve ferait qu'« couts » ne
// trouverait jamais « Coûts » — et la palette passerait pour cassée alors qu'elle marche.

type GenreCommande = "app" | "page" | "externe";

export interface Commande {
  id: string;
  /** Ce qu'on lit dans la liste. */
  libelle: string;
  /** Précision affichée en gris : nom de l'app, ou destination. */
  contexte?: string;
  genre: GenreCommande;
  /** Chemin interne (`/app/driveai`) ou URL absolue pour `externe`. */
  cible: string;
}

/**
 * Réduit une chaîne à sa forme comparable : minuscules, sans accents, sans ponctuation.
 *
 * `NFD` décompose « ô » en « o » + accent combinant, et la plage `̀-ͯ` retire les
 * accents ainsi séparés. C'est la même normalisation que BatchChef applique à son catalogue,
 * et pour la même raison.
 */
export function normaliserRecherche(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Garde les commandes dont le libellé OU le contexte contient tous les mots tapés.
 *
 * Tous les mots, dans n'importe quel ordre : « drive detail » et « detail drive » trouvent la
 * même chose. Un filtrage par sous-chaîne exacte de la requête entière obligerait à taper
 * dans l'ordre affiché, ce que personne ne fait.
 *
 * Une requête vide rend TOUT : la palette qui s'ouvre montre ce qu'elle sait faire, plutôt
 * qu'un vide qui laisse deviner.
 */
export function filtrer(commandes: Commande[], requete: string): Commande[] {
  const mots = normaliserRecherche(requete).split(" ").filter(Boolean);
  if (mots.length === 0) return commandes;

  return commandes.filter((commande) => {
    const foin = normaliserRecherche(`${commande.libelle} ${commande.contexte ?? ""}`);
    return mots.every((mot) => foin.includes(mot));
  });
}

export interface AppPalette {
  id: string;
  nom: string;
  /** URL publique de l'app, déjà filtrée par `safeHttpUrl` en amont. `null` si absente. */
  url: string | null;
}

/**
 * Construit la liste complète. L'ordre est celui de l'affichage : les pages du hub d'abord
 * (peu nombreuses, toujours pertinentes), puis les apps.
 */
export function commandes(apps: AppPalette[]): Commande[] {
  const pages: Commande[] = [
    { id: "page-accueil", libelle: "Tableau de bord", genre: "page", cible: "/" },
    { id: "page-attention", libelle: "Ce qui demande mon attention", genre: "page", cible: "/attention" },
    { id: "page-couts", libelle: "Coûts & quotas", genre: "page", cible: "/couts" },
    { id: "page-admin", libelle: "Administration", genre: "page", cible: "/administration" },
    { id: "page-graphes", libelle: "Graphes de code", genre: "page", cible: "/graphes" },
  ];

  const parApp = apps.flatMap<Commande>((app) => {
    const entrees: Commande[] = [
      {
        id: `app-${app.id}`,
        libelle: app.nom,
        contexte: "détail dans le hub",
        genre: "app",
        cible: `/app/${app.id}`,
      },
    ];
    if (app.url) {
      entrees.push({
        id: `ouvrir-${app.id}`,
        libelle: `Ouvrir ${app.nom}`,
        contexte: app.url,
        genre: "externe",
        cible: app.url,
      });
    }
    return entrees;
  });

  return [...pages, ...parApp];
}
