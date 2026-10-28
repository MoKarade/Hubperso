// tests/composantsAffichage.test.ts — rendu des composants d'AFFICHAGE encore sans test.
//
// Même méthode que tests/detailApp.test.ts : HTML statique (`renderToStaticMarkup`, sans
// navigateur ni nouvelle dépendance), et on vérifie ce que Marc lit à l'écran ET les règles
// du dépôt que ces composants portent — liens seulement via `safeHttpUrl`, icône de forme
// distincte par gravité, rien d'inventé quand une donnée manque.
//
// Fichier .ts (la config ne prend que `tests/**/*.test.ts`) : `createElement`, pas de JSX.
// Aucune valeur métier inventée : les montants et valeurs ne servent qu'à vérifier le
// FORMAT de rendu, pas à simuler une donnée réelle.

import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HubAlert, HubMetric } from "@mokarade/hub-contract";
import { StatusBadge } from "@/components/StatusBadge";
import { Sparkline } from "@/components/Sparkline";
import { WidgetSkeleton } from "@/components/WidgetSkeleton";
import { AlertBanner } from "@/components/AlertBanner";
import { AlertList } from "@/components/AlertList";
import { MetricList } from "@/components/MetricList";
import { LignesDetail } from "@/components/LignesDetail";
import { Recommandation } from "@/components/Recommandation";
import { BandeauAttention } from "@/components/BandeauAttention";
import { PagePublique } from "@/components/PagePublique";
import { CostsCard } from "@/components/CostsCard";
import type { Attention } from "@/lib/attention";
import { TAUX_PAR_DEFAUT } from "@/lib/tauxChange";
import type { UsageDigest } from "@/lib/usage";

/** Le texte visible, sans balises ni séparateurs `<!-- -->` que React insère entre textes. */
function texte(html: string): string {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const rendre = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);

describe("StatusBadge", () => {
  it("porte le ton en classe et le libellé en texte, pastille masquée aux lecteurs d'écran", () => {
    const html = rendre(h(StatusBadge, { tone: "danger", label: "injoignable" }));
    expect(html).toContain('class="badge badge--danger"');
    expect(html).toContain('aria-hidden="true"');
    expect(texte(html)).toBe("injoignable");
  });
});

describe("Sparkline", () => {
  it("sans assez de points : ne rend RIEN (pas de trait plat qui affirmerait une stabilité)", () => {
    expect(rendre(h(Sparkline, { points: [], label: "Solde" }))).toBe("");
    expect(rendre(h(Sparkline, { points: [{ t: 1, v: 1 }], label: "Solde" }))).toBe("");
  });

  it("avec une série : un SVG étiqueté, et un tracé", () => {
    const html = rendre(
      h(Sparkline, {
        points: [
          { t: 1, v: 1 },
          { t: 2, v: 3 },
          { t: 3, v: 2 },
        ],
        label: "Solde",
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Évolution de Solde sur les relevés conservés"');
    expect(html).toMatch(/<path class="sparkline__trace" d="M[^"]+"/);
  });
});

describe("WidgetSkeleton", () => {
  it("état de chargement annoncé : aria-busy, nom de l'app, texte pour lecteur d'écran", () => {
    const html = rendre(h(WidgetSkeleton, { name: "CarAI" }));
    expect(html).toContain('aria-busy="true"');
    expect(texte(html)).toContain("CarAI");
    expect(texte(html)).toContain("interrogation…");
    expect(texte(html)).toContain("Chargement du résumé de CarAI…");
    expect(html.match(/skeleton__bar/g)).toHaveLength(2);
  });

  it("la tuile héros réserve plus de barres", () => {
    const html = rendre(h(WidgetSkeleton, { name: "FinanceAI", featured: true }));
    expect(html.match(/skeleton__bar/g)).toHaveLength(4);
  });
});

const alerte = (over: Partial<HubAlert> = {}): HubAlert =>
  ({ label: "Synchronisation en échec", severity: "alert", ...over }) as HubAlert;

describe("AlertBanner", () => {
  it("gravité alert : role=alert, icône, libellé, lien http(s) ouvert", () => {
    const html = rendre(h(AlertBanner, { alert: alerte({ href: "https://exemple.test/x" }) }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("bandeau__icone");
    expect(texte(html)).toContain("Synchronisation en échec");
    expect(html).toContain('href="https://exemple.test/x"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("un lien non http(s) n'est JAMAIS rendu cliquable", () => {
    const html = rendre(h(AlertBanner, { alert: alerte({ href: "javascript:alert(1)" }) }));
    expect(html).not.toContain("<a");
    expect(html).not.toContain("javascript:");
  });

  it("gravité info : pas d'icône (un pictogramme partout n'en signale plus aucun)", () => {
    const html = rendre(h(AlertBanner, { alert: alerte({ severity: "info" as HubAlert["severity"] }) }));
    expect(html).not.toContain("<svg");
  });
});

describe("AlertList", () => {
  it("liste vide : ne rend rien", () => {
    expect(rendre(h(AlertList, { alerts: [] }))).toBe("");
  });

  it("une ligne par alerte : icône pour alert/warn, pastille sinon ; lien seulement s'il est sûr", () => {
    const html = rendre(
      h(AlertList, {
        alerts: [
          alerte({ href: "https://exemple.test/a" }),
          alerte({ label: "Quota proche", severity: "warn", href: "ftp://exemple.test" }),
          alerte({ label: "Note", severity: "info" as HubAlert["severity"] }),
        ],
      }),
    );
    expect(html.match(/<li class="alert"/g)).toHaveLength(3);
    expect(html).toContain("icone--danger");
    expect(html).toContain("icone--warn");
    expect(html).toContain("alert__dot alert__dot--info");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain("ftp:");
  });
});

const metrique = (over: Partial<HubMetric> = {}): HubMetric =>
  ({ label: "Relevés", value: 0, format: "number", ...over }) as HubMetric;

describe("MetricList", () => {
  it("aucune métrique : ne rend rien", () => {
    expect(rendre(h(MetricList, { metrics: [] }))).toBe("");
  });

  it("libellé, valeur, ton de gravité, tendance et courbe seulement si une série existe", () => {
    const html = rendre(
      h(MetricList, {
        metrics: [
          {
            metrique: metrique({ severity: "warn", trend: -0.1 }),
            serie: [
              { t: 1, v: 1 },
              { t: 2, v: 2 },
            ],
          },
          { metrique: metrique({ label: "Sans série" }), serie: [] },
        ],
      }),
    );
    expect(texte(html)).toContain("Relevés");
    expect(texte(html)).toContain("Sans série");
    expect(html).toContain('data-tone="warn"');
    expect(html).toContain('data-dir="down"');
    // Une seule courbe : la métrique sans série n'a pas de trait plat inventé.
    expect(html.match(/metric__courbe/g)).toHaveLength(1);
  });
});

describe("LignesDetail", () => {
  it("une ligne par item, indice en texte, icône seulement pour warn/alert", () => {
    const html = rendre(
      h(LignesDetail, {
        items: [
          { label: "Tâche A", value: 0, format: "number", severity: "alert", hint: "depuis hier" },
          { label: "Tâche B", value: 0, format: "number", trend: 0.2 },
          { label: "Tâche C", value: 0, format: "number", severity: "ok" },
        ] as never,
      }),
    );
    expect(html.match(/detail__ligne"/g)).toHaveLength(3);
    expect(texte(html)).toContain("depuis hier");
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('data-tone="ok"');
    expect(html).toContain('data-dir="up"');
    // Icônes : l'alerte + la flèche de tendance ; la ligne « ok » n'en porte pas.
    expect(html.match(/<svg/g)).toHaveLength(2);
  });

  it("aucun item : liste vide, sans ligne inventée", () => {
    const html = rendre(h(LignesDetail, { items: [] }));
    expect(html).toBe('<ul class="detail__lignes"></ul>');
  });
});

describe("Recommandation", () => {
  const reco = { label: "Relancer la synchro", pourquoi: "Dernier succès il y a 3 jours", href: null };

  it("sans lien : texte seul ; le pourquoi est affiché en mode complet", () => {
    const html = rendre(h(Recommandation, { reco }));
    expect(html).not.toContain("<a");
    expect(texte(html)).toContain("Relancer la synchro");
    expect(texte(html)).toContain("Dernier succès il y a 3 jours");
    expect(html).not.toContain("data-compact");
  });

  it("compact : le pourquoi est retiré ; avec lien : cliquable", () => {
    const html = rendre(
      h(Recommandation, { reco: { ...reco, href: "https://exemple.test/r" }, compact: true }),
    );
    expect(html).toContain('data-compact=""');
    expect(html).toContain('href="https://exemple.test/r"');
    expect(texte(html)).not.toContain("Dernier succès");
  });
});

const attention = (gravite: Attention["gravite"]): Attention => ({
  appId: "carai",
  appNom: "CarAI",
  gravite,
  libelle: "x",
  href: null,
  duHub: false,
});

describe("BandeauAttention", () => {
  it("rien à régler ni à surveiller : ne rend rien (les infos seules ne font pas de bruit)", () => {
    expect(rendre(h(BandeauAttention, { liste: [] }))).toBe("");
    expect(rendre(h(BandeauAttention, { liste: [attention("info")] }))).toBe("");
  });

  it("compte par gravité, lien vers /attention, gravité la plus haute en attribut", () => {
    const html = rendre(
      h(BandeauAttention, {
        liste: [attention("alert"), attention("warn"), attention("warn")],
      }),
    );
    expect(html).toContain('href="/attention"');
    expect(html).toContain('data-gravite="alert"');
    expect(texte(html)).toContain("1 à régler · 2 à surveiller");
  });

  it("seulement des avertissements : gravité warn", () => {
    const html = rendre(h(BandeauAttention, { liste: [attention("warn")] }));
    expect(html).toContain('data-gravite="warn"');
    expect(texte(html)).toContain("1 à surveiller");
    expect(texte(html)).not.toContain("à régler");
  });
});

describe("PagePublique", () => {
  it("titre, date de mise à jour, retour au tableau de bord et contenu", () => {
    const html = rendre(
      h(PagePublique, {
        titre: "Confidentialité",
        maj: "30 septembre 2026",
        children: h("p", null, "Corps"),
      }),
    );
    expect(html).toContain('aria-labelledby="legal-title"');
    expect(html).toContain('id="legal-title"');
    expect(html).toContain('href="/"');
    expect(texte(html)).toContain("Confidentialité");
    expect(texte(html)).toContain("Dernière mise à jour : 30 septembre 2026");
    expect(texte(html)).toContain("Corps");
  });
});

describe("CostsCard", () => {
  const vide: UsageDigest = { apps: [], totalsByPeriod: [], trackedCount: 0, quotaWarnings: 0, change: TAUX_PAR_DEFAUT };
  const MAINTENANT = Date.parse("2026-10-22T20:00:00Z");

  it("aucune app ne publie ses coûts : le dit, sans montant inventé", () => {
    const html = rendre(h(CostsCard, { digest: vide, maintenant: MAINTENANT }));
    expect(texte(html)).toContain("Aucune app ne publie encore ses coûts. Rien inventé.");
    expect(html).not.toContain("couts-panneau__montant");
    expect(html).not.toContain("couts-panneau__alerte");
  });

  it("le propriétaire a « Voir le détail » vers l'onglet Coûts du Chantier (le panneau n'est plus une carte-lien)", () => {
    const html = rendre(h(CostsCard, { digest: vide, maintenant: MAINTENANT, detail: true }));
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toContain('href="/chantier?onglet=couts"');
    expect(texte(html)).toContain("Voir le détail");
  });

  it("un invité du hub n'a aucun lien : la page de détail est réservée au propriétaire", () => {
    const html = rendre(h(CostsCard, { digest: vide, maintenant: MAINTENANT }));
    expect(html).not.toContain("<a");
    expect(texte(html)).not.toContain("Voir le détail");
  });

  it("quotas à surveiller : singulier et pluriel", () => {
    const un = rendre(h(CostsCard, { digest: { ...vide, quotaWarnings: 1 }, maintenant: MAINTENANT }));
    const deux = rendre(h(CostsCard, { digest: { ...vide, quotaWarnings: 2 }, maintenant: MAINTENANT }));
    expect(texte(un)).toContain("1 quota à surveiller");
    expect(texte(deux)).toContain("2 quotas à surveiller");
  });
});
