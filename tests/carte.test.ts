// tests/carte.test.ts — ce qu'une carte décide d'afficher, testé sans rendu.

import { describe, expect, it } from "vitest";
import type { HubAlert, HubMetric, HubSummary } from "@mokarade/hub-contract";
import {
  SEUIL_INCHANGE_MS,
  etatCarte,
  recommandation,
  traceSparkline,
  variationLisible,
} from "@/lib/carte";
import type { Releve } from "@/lib/historique";

const JOUR = 24 * 60 * 60_000;
const T0 = Date.UTC(2026, 7, 20, 12, 0, 0);

function m(label: string, value: number | string): HubMetric {
  return { label, value, format: typeof value === "number" ? "number" : "text" };
}

function summary(
  metrics: HubMetric[],
  alerts: HubAlert[] = [],
  reste: Partial<HubSummary> = {},
): HubSummary {
  return {
    contractVersion: 1,
    app: { id: "batchchef", name: "BatchChef", url: "https://batchchef.hubperso.com", color: "#c2410c" },
    generatedAt: new Date(T0).toISOString(),
    status: "ok",
    metrics,
    alerts,
    actions: [],
    ...reste,
  };
}

function releve(decalageMs: number, metriques: HubMetric[]): Releve {
  return {
    appId: "batchchef",
    releveLe: T0 + decalageMs,
    etat: "ok",
    dataAsOf: null,
    metriques,
    cout: null,
  };
}

describe("etatCarte — le héros", () => {
  it("prend la PREMIÈRE métrique publiée, pas la plus grande", () => {
    // C'est un choix de l'app : elle seule sait ce qui mérite la grande police. Élire « la
    // plus grande valeur » ferait dépendre la mise en page des données et changerait la
    // carte au gré des chiffres.
    const etat = etatCarte(summary([m("Recettes", 12), m("Batchs", 9999)]), [], T0);
    expect(etat.heros!.metrique.label).toBe("Recettes");
    expect(etat.secondaires.map((x) => x.metrique.label)).toEqual(["Batchs"]);
  });

  it("rend null quand l'app ne publie aucune métrique", () => {
    const etat = etatCarte(summary([]), [], T0);
    expect(etat.heros).toBeNull();
  });

  it("obéit à `primary: true` MÊME quand la métrique est publiée en dernier", () => {
    // Le cas qui compte : avant le contrat v1.3, une app devait réordonner sa liste pour
    // changer de héros, donc mêler « ce qui domine » à « dans quel ordre je publie ». Mettre
    // la désignée en PREMIÈRE position rendrait ce test vert même si le drapeau était
    // ignoré — d'où la dernière place.
    const etat = etatCarte(
      summary([m("Recettes", 12), m("Batchs", 3), { ...m("Charge", 84), primary: true }]),
      [],
      T0,
    );
    expect(etat.heros!.metrique.label).toBe("Charge");
    // Et la désignée ne doit pas aussi figurer dans les secondaires : elle s'afficherait
    // deux fois sur la même carte, une fois en grand et une fois en petit.
    expect(etat.secondaires.map((x) => x.metrique.label)).toEqual(["Recettes", "Batchs"]);
  });

  it("ignore un `primary: false` explicite et retombe sur la première", () => {
    // `primary: false` n'est pas « ne me choisis pas » : c'est l'absence de désignation. Le
    // traiter comme une candidature ferait du drapeau une valeur à trois états.
    const etat = etatCarte(
      summary([m("Recettes", 12), { ...m("Batchs", 3), primary: false }]),
      [],
      T0,
    );
    expect(etat.heros!.metrique.label).toBe("Recettes");
  });
});

describe("recommandation", () => {
  it("rend null quand l'app n'en publie pas — le cas le plus courant", () => {
    expect(recommandation(summary([]))).toBeNull();
    expect(etatCarte(summary([]), [], T0).recommandation).toBeNull();
  });

  it("porte le libellé, le pourquoi et un lien http(s) validé", () => {
    const reco = recommandation(
      summary([], [], {
        recommendation: {
          label: "Cotiser 5 000 $ au CELI avant décembre",
          why: "L'espace inutilisé ne se reporte qu'une fois.",
          href: "https://finance.hubperso.com/celi",
        },
      }),
    );
    expect(reco).toEqual({
      label: "Cotiser 5 000 $ au CELI avant décembre",
      pourquoi: "L'espace inutilisé ne se reporte qu'une fois.",
      href: "https://finance.hubperso.com/celi",
    });
  });

  it("REFUSE un href non http(s) sans masquer le conseil", () => {
    // Le champ traverse `z.string().url()` au contrat, qui accepte `javascript:`. Sans
    // `safeHttpUrl`, chaque app deviendrait un vecteur d'exécution dans le hub.
    //
    // Et le conseil reste LISIBLE : refuser le lien n'est pas refuser le texte. Rendre
    // `null` pour toute la recommandation ferait disparaître un contenu légitime à cause
    // d'un seul champ fautif, et personne ne saurait qu'il y avait quelque chose à lire.
    const reco = recommandation(
      summary([], [], {
        recommendation: { label: "Cliquez ici", href: "javascript:alert(1)" },
      }),
    );
    expect(reco).not.toBeNull();
    expect(reco!.label).toBe("Cliquez ici");
    expect(reco!.href).toBeNull();
  });

  it("rend `pourquoi` à null quand l'app ne le publie pas, jamais une chaîne vide", () => {
    // `""` s'afficherait comme un paragraphe vide sous le libellé — une ligne blanche que
    // personne ne peut expliquer.
    const reco = recommandation(
      summary([], [], { recommendation: { label: "Réviser les quotas" } }),
    );
    expect(reco!.pourquoi).toBeNull();
    expect(reco!.href).toBeNull();
  });
});

describe("etatCarte — « inchangé depuis »", () => {
  const historiqueFige = [
    releve(-14 * JOUR, [m("Traités", 322)]),
    releve(-7 * JOUR, [m("Traités", 322)]),
    releve(0, [m("Traités", 322)]),
  ];

  it("signale un gel ancien — le cas de la campagne bloquée à 322/1207", () => {
    const etat = etatCarte(summary([m("Traités", 322)]), historiqueFige, T0);
    expect(etat.heros!.inchangeDepuisMs).toBe(14 * JOUR);
  });

  it("SE TAIT sous le seuil : « inchangé depuis 20 min » n'apprend rien", () => {
    // Mutation : retirer le seuil ferait écrire une évidence sur chaque carte, à chaque
    // rafraîchissement — et le message utile se noierait dedans.
    const recent = [
      releve(-SEUIL_INCHANGE_MS / 2, [m("Traités", 322)]),
      releve(0, [m("Traités", 322)]),
    ];
    expect(etatCarte(summary([m("Traités", 322)]), recent, T0).heros!.inchangeDepuisMs).toBeNull();
  });

  it("ne dit rien sans mémoire", () => {
    expect(etatCarte(summary([m("Traités", 322)]), [], T0).heros!.inchangeDepuisMs).toBeNull();
  });
});

describe("etatCarte — les alertes", () => {
  it("remonte la plus GRAVE, pas la première publiée", () => {
    const etat = etatCarte(
      summary([], [
        { label: "info", severity: "info" },
        { label: "grave", severity: "alert" },
        { label: "moyen", severity: "warn" },
      ]),
      [],
      T0,
    );
    expect(etat.alertePrincipale!.label).toBe("grave");
  });

  it("COMPTE les autres au lieu de les cacher en silence", () => {
    // Une alerte escamotée sans trace est une alerte perdue.
    const etat = etatCarte(
      summary([], [
        { label: "a", severity: "alert" },
        { label: "b", severity: "warn" },
        { label: "c", severity: "info" },
      ]),
      [],
      T0,
    );
    expect(etat.autresAlertes).toBe(2);
  });

  it("aucune alerte ⇒ null et zéro", () => {
    const etat = etatCarte(summary([]), [], T0);
    expect(etat.alertePrincipale).toBeNull();
    expect(etat.autresAlertes).toBe(0);
  });
});

describe("traceSparkline", () => {
  it("normalise en 0→100 et inverse l'axe Y (repère SVG)", () => {
    const d = traceSparkline([
      { t: 1, v: 0 },
      { t: 2, v: 10 },
    ]);
    // La plus petite valeur est EN BAS : y = 100. La plus grande en haut : y = 0.
    expect(d).toBe("M0.00,100.00 L100.00,0.00");
  });

  it("rend null sous deux points — un trait plat affirmerait une stabilité non observée", () => {
    // Mutation : accepter un seul point dessine une ligne droite qui ressemble à « stable ».
    expect(traceSparkline([{ t: 1, v: 5 }])).toBeNull();
    expect(traceSparkline([])).toBeNull();
  });

  it("trace une série CONSTANTE à mi-hauteur, sans diviser par zéro", () => {
    const d = traceSparkline([
      { t: 1, v: 7 },
      { t: 2, v: 7 },
      { t: 3, v: 7 },
    ]);
    expect(d).toBe("M0.00,50.00 L50.00,50.00 L100.00,50.00");
    expect(d).not.toContain("NaN");
  });
});

describe("variationLisible — la ligne que Marc ne comprenait pas", () => {
  const HEURE = 60 * 60_000;

  /** Deux relevés espacés de `ecartMs`, portant la même métrique à deux valeurs. */
  function deuxReleves(label: string, avant: number, apres: number, ecartMs: number) {
    return [
      releve(-ecartMs, [{ label, value: avant, format: "percent" }]),
      releve(0, [{ label, value: apres, format: "percent" }]),
    ];
  }

  it("dit la durée RÉELLEMENT couverte, pas la fenêtre de recherche", () => {
    // LE MENSONGE MESURÉ LE 15/09/2026. La carte affichait « sur 7 j » alors que
    // l'historique avait quatre heures. `FENETRE_VARIATION_MS` est la fenêtre dans laquelle
    // on CHERCHE des relevés, jamais la durée de l'écart trouvé.
    const historique = deuxReleves("Charge", 84, 90, 4 * HEURE);
    const v = etatCarte(
      summary([{ label: "Charge", value: 90, format: "percent" }]),
      historique,
      T0,
    ).heros!.variation;

    const lisible = variationLisible({ label: "Charge", value: 90, format: "percent" }, v);
    expect(lisible!.sur).toBe("4 h");
    expect(lisible!.sur).not.toContain("j");
  });

  it("parle en POINTS sur un pourcentage, jamais en pourcentage relatif", () => {
    // « Charge 90 %, +7,1 % » est indécidable : 7,1 points ou 7,1 % de 84 ? Les deux
    // lectures sont plausibles et donnent des nombres différents.
    const metrique = { label: "Charge", value: 90, format: "percent" } as const;
    const v = etatCarte(summary([metrique]), deuxReleves("Charge", 84, 90, 4 * HEURE), T0)
      .heros!.variation;

    const lisible = variationLisible(metrique, v);
    expect(lisible!.ecart).toBe("+6 points");
    // La formulation relative ne doit PAS apparaître : c'est elle qui était ambiguë.
    expect(lisible!.ecart).not.toContain("%");
    expect(lisible!.sens).toBe("hausse");
  });

  it("accorde le singulier : un seul point ne prend pas de s", () => {
    const metrique = { label: "Charge", value: 85, format: "percent" } as const;
    const v = etatCarte(summary([metrique]), deuxReleves("Charge", 84, 85, HEURE), T0)
      .heros!.variation;
    expect(variationLisible(metrique, v)!.ecart).toBe("+1 point");
  });

  it("dit DE QUOI À QUOI — l'information qui manquait pour comprendre l'écart", () => {
    const metrique = { label: "Charge", value: 90, format: "percent" } as const;
    const v = etatCarte(summary([metrique]), deuxReleves("Charge", 84, 90, 4 * HEURE), T0)
      .heros!.variation;
    expect(variationLisible(metrique, v)!.entre).toBe("de 84 % à 90 %");
  });

  it("traite l'absence de changement comme PLATE, jamais comme une hausse", () => {
    // `deltaAbsolu >= 0` rangeait zéro du côté des hausses : une métrique immobile
    // s'affichait en VERT, comme une amélioration. C'est le cas de JobAI sur la capture du
    // 15/09 — « 0 % sur 7 j », en vert.
    const metrique = { label: "Charge", value: 78, format: "percent" } as const;
    const v = etatCarte(summary([metrique]), deuxReleves("Charge", 78, 78, 2 * HEURE), T0)
      .heros!.variation;

    const lisible = variationLisible(metrique, v);
    expect(lisible!.sens).toBe("plat");
    expect(lisible!.sens).not.toBe("hausse");
    expect(lisible!.ecart).toBe("inchangé");
  });

  it("garde le pourcentage relatif pour ce qui n'est PAS un pourcentage", () => {
    // La correction ne supprime pas le relatif : sur un compteur, « +25 % » est la bonne
    // formulation. Ce qui était ambigu, c'était le relatif SUR un pourcentage.
    const metrique = { label: "Offres suivies", value: 1500, format: "number" } as const;
    const v = etatCarte(
      summary([metrique]),
      [
        releve(-2 * HEURE, [{ label: "Offres suivies", value: 1200, format: "number" }]),
        releve(0, [{ label: "Offres suivies", value: 1500, format: "number" }]),
      ],
      T0,
    ).heros!.variation;
    expect(variationLisible(metrique, v)!.ecart).toBe("+25 %");
  });

  it("rend null quand il n'y a pas de variation — pas une ligne vide", () => {
    // La carte doit alors dire « pas encore d'historique », jamais « 0 % » : on ne SAIT
    // pas, et l'ignorance ne s'affiche pas comme une stabilité.
    expect(variationLisible({ label: "X", value: 1, format: "number" }, null)).toBeNull();
  });
});

// ══ LA PLACE DISPONIBLE DÉCIDE DE CE QUE LA CARTE MONTRE ══════════════════════════════
//
// Marc, 23/09/2026, capture à l'appui : « remplis plus la carte FinanceAI […] trop de vide ».
// Mesuré sur sa capture — ~420 px entre le dernier chiffre et le bouton. La cause n'était pas
// un manque de données (FinanceAI publie les 6 métriques du contrat, plus des alertes et des
// blocs `details`) mais une carte RÉSERVÉE sur 2×2 cases dont le contenu n'en remplissait
// qu'une, `.actions` ramassant tout le surplus en un seul trou par son `margin-top: auto`.
//
// ⚠️ CE QUE CES CAS GARDENT VRAIMENT : que la carte d'UNE colonne ne grossisse pas au
// passage. C'est le risque réel du lot — une carte `--md` qui se mettrait à lister quatre
// alertes et huit lignes de détail casserait la grille, ce que l'arbitrage du 15/09 voulait
// justement éviter. Chaque cas « large » a donc son jumeau « normale ».

const alerte = (label: string, severity: HubAlert["severity"] = "warn"): HubAlert => ({
  label,
  severity,
});

const section = (title: string, n: number) => ({
  title,
  items: Array.from({ length: n }, (_, i) => ({
    label: `${title} ${i + 1}`,
    value: i,
    format: "number" as const,
  })),
});

describe("etatCarte — ce que la place autorise", () => {
  it("une carte NORMALE ne liste aucune alerte secondaire et aucun détail", () => {
    const etat = etatCarte(
      summary([m("A", 1)], [alerte("un"), alerte("deux"), alerte("trois")], {
        details: [section("Frais", 8)],
      }),
      [],
      T0,
    );
    expect(etat.alertesSecondaires).toEqual([]);
    expect(etat.details).toEqual([]);
    // Et le compteur dit bien ce qui reste : deux alertes non montrées sous le bandeau.
    expect(etat.autresAlertes).toBe(2);
  });

  it("une carte LARGE liste les alertes suivantes, bornées", () => {
    // Cinq alertes : une au bandeau, trois listées, une comptée. Le plafond doit MORDRE —
    // avec quatre alertes, un `slice` absent rendrait le même résultat.
    const etat = etatCarte(
      summary(
        [m("A", 1)],
        [alerte("un"), alerte("deux"), alerte("trois"), alerte("quatre"), alerte("cinq")],
      ),
      [],
      T0,
      "large",
    );
    expect(etat.alertesSecondaires.map((a) => a.label)).toEqual(["deux", "trois", "quatre"]);
    expect(etat.autresAlertes).toBe(1);
  });

  it("`autresAlertes` compte ce qu'AUCUNE des deux surfaces ne montre", () => {
    // ⚠️ Le défaut plausible est `total − 1`, qui aurait affiché « + 3 autres » SOUS une
    // liste qui en montre trois : le compteur aurait contredit ce qu'on lit juste au-dessus.
    const etat = etatCarte(
      summary([m("A", 1)], [alerte("un"), alerte("deux"), alerte("trois")]),
      [],
      T0,
      "large",
    );
    expect(etat.alertesSecondaires).toHaveLength(2);
    expect(etat.autresAlertes).toBe(0);
  });

  it("une carte LARGE borne les `details` en sections ET en lignes", () => {
    const etat = etatCarte(
      summary([m("A", 1)], [], {
        details: [section("Un", 8), section("Deux", 2), section("Trois", 5)],
      }),
      [],
      T0,
      "large",
    );
    expect(etat.details.map((s) => s.title)).toEqual(["Un", "Deux"]);
    // La première est COUPÉE à 4 : sans la borne par ligne, elle en rendrait 8.
    expect(etat.details[0]!.items).toHaveLength(4);
    // La seconde en a moins que la borne : on ne la complète pas, on la laisse telle quelle.
    expect(etat.details[1]!.items).toHaveLength(2);
  });

  it("ne rend pas une section de `details` VIDE", () => {
    // Le contrat ne l'interdit pas côté hub : une app peut publier une section sans ligne,
    // et un titre seul sur la carte occuperait de la place en ne disant rien.
    const etat = etatCarte(summary([m("A", 1)], [], { details: [section("Vide", 0)] }), [], T0, "large");
    expect(etat.details).toEqual([]);
  });

  it("une carte LARGE donne sa courbe à chaque métrique SECONDAIRE", () => {
    const historique = [
      releve(-3 * JOUR, [m("A", 10), m("B", 100)]),
      releve(-1 * JOUR, [m("A", 12), m("B", 140)]),
    ];
    const large = etatCarte(summary([m("A", 12), m("B", 140)]), historique, T0, "large");
    expect(large.secondaires[0]!.metrique.label).toBe("B");
    expect(large.secondaires[0]!.serie.length).toBeGreaterThan(1);

    // ⚠️ Anti-vacuité : la MÊME mémoire ne doit RIEN donner à une carte d'une colonne. Sans
    // ce jumeau, le cas ci-dessus passerait aussi si la série était calculée partout — et la
    // carte `--md` porterait des courbes qu'elle n'a pas la hauteur d'afficher.
    const normale = etatCarte(summary([m("A", 12), m("B", 140)]), historique, T0);
    expect(normale.secondaires[0]!.serie).toEqual([]);
  });

  it("la série d'une secondaire est cherchée par son LIBELLÉ, pas par sa position", () => {
    // `[HUB-METRIQUE-LIBELLE-EST-UNE-CLE]` : l'historique est keyé par le libellé. Une
    // recherche par index rendrait la série de « A » sous la valeur de « B » — un graphe
    // faux sous un bon chiffre, et rien ne le signalerait à l'écran.
    const historique = [
      releve(-3 * JOUR, [m("A", 10), m("B", 100)]),
      releve(-1 * JOUR, [m("A", 12), m("B", 140)]),
    ];
    const etat = etatCarte(summary([m("A", 12), m("B", 140)]), historique, T0, "large");
    expect(etat.secondaires[0]!.serie.map((p) => p.v)).toEqual([100, 140]);
  });
});
