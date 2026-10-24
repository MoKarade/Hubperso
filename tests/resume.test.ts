// tests/resume.test.ts — la phrase d'état de l'accueil (maquette validée par Marc, 22/10/2026) :
// vraie ou absente, jamais décorative. Un test par état du badge, et un test que la phrase ne
// dit « à jour » que si chaque app branchée l'est.

import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SummaryResult } from "@/lib/fetchSummary";
import { attentions, type Attention } from "@/lib/attention";
import { MAX_POINTS, resumeHub } from "@/lib/resume";
import { ResumeHub } from "@/components/ResumeHub";
import { hubSource, validSummary } from "./helpers";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const src = (id: string, name: string) => hubSource({ id, name });

const ok = (id: string, name: string, over = {}): SummaryResult => ({
  state: "ok",
  source: src(id, name),
  summary: validSummary({ app: { id, name, url: `https://${id}.exemple.invalid`, color: "#336699" }, ...over }),
});
const etat = (state: string, id: string, name: string, extra = {}): SummaryResult =>
  ({ state, source: src(id, name), ...extra }) as SummaryResult;

const resume = (resultats: SummaryResult[]) => resumeHub(resultats, attentions(resultats, NOW));
const texte = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("phrase d'état", () => {
  it("toutes les apps à jour : « Tout est à jour. »", () => {
    const r = resume([ok("a", "Alpha"), ok("b", "Bravo")]);
    expect(r.phrase).toBe("Tout est à jour.");
    expect(r.ton).toBe("ok");
    expect(r.points).toEqual([]);
  });

  it("une seule app : la phrase est au singulier", () => {
    expect(resume([ok("a", "Alpha")]).phrase).toBe("L’app est à jour.");
  });

  it("une app injoignable : elle est nommée, la phrase est rouge, jamais « tout est à jour »", () => {
    const r = resume([ok("a", "Alpha"), etat("unreachable", "b", "Bravo", { detail: "délai" })]);
    expect(r.phrase).toBe("Une app est à jour. Bravo ne répond plus.");
    expect(r.ton).toBe("danger");
    expect(r.points.map((p) => p.appNom)).toEqual(["Bravo"]);
  });

  it("plusieurs apps en panne : chacune est nommée avec son propre état", () => {
    const r = resume([
      etat("unreachable", "a", "Alpha", { detail: "x" }),
      etat("unauthorized", "b", "Bravo"),
      ok("c", "Charlie"),
    ]);
    expect(r.phrase).toBe("Une app est à jour. Alpha ne répond plus et Bravo refuse l’accès du hub.");
    expect(r.ton).toBe("danger");
  });

  it("données en retard : à surveiller, ton warn", () => {
    const r = resume([ok("a", "Alpha", { status: "degraded" }), ok("b", "Bravo")]);
    expect(r.phrase).toBe("Une app est à jour. Alpha a du retard.");
    expect(r.ton).toBe("warn");
  });

  it("deux apps à surveiller : « A a du retard et B a du retard »", () => {
    const r = resume([ok("a", "Alpha", { status: "degraded" }), ok("b", "Bravo", { status: "degraded" })]);
    expect(r.phrase).toBe("Alpha a du retard et Bravo a du retard.");
  });

  it("la panne passe avant l'avertissement", () => {
    const r = resume([ok("a", "Alpha", { status: "degraded" }), etat("invalid", "b", "Bravo", { detail: "x" })]);
    expect(r.phrase).toBe("Bravo a une réponse invalide et Alpha a du retard.");
    expect(r.ton).toBe("danger");
  });

  it("en construction ou non branchée : jamais présentée comme « à jour » à elle seule", () => {
    const r = resume([ok("a", "Alpha"), ok("b", "Bravo", { status: "building" }), etat("unconfigured", "c", "Charlie", { manque: [] })]);
    expect(r.phrase).toBe("Tout ce qui est branché est à jour (1 sur 3).");
    expect(r.ton).toBe("ok");
  });

  it("aucune app à jour (toutes en construction ou non branchées) : pas de « tout va bien »", () => {
    const r = resume([ok("a", "Alpha", { status: "building" }), etat("unconfigured", "c", "Charlie", { manque: [] })]);
    expect(r.phrase).toBe("Aucune app ne publie encore de données.");
    expect(r.ton).toBe("neutre");
  });

  it("aucune app déclarée : on le dit", () => {
    expect(resume([]).phrase).toBe("Aucune app n’est déclarée dans le hub.");
  });

  it("une réponse servie depuis le cache n'est jamais « à jour »", () => {
    const enCache = { ...ok("a", "Alpha"), stale: true, cachedAgeMs: 600_000 } as SummaryResult;
    expect(resume([enCache]).phrase).toBe("Alpha n’a pas répondu à temps.");
  });
});

describe("phrase d'état : l'état d'ensemble, puis ce qui compte (maquette validée)", () => {
  it("la phrase de la maquette : « Deux apps sont à jour. JobAI a du retard et DriveAI ne répond plus. »", () => {
    const r = resume([
      ok("a", "FinanceAI"),
      ok("b", "BatchChef"),
      ok("c", "JobAI", { status: "degraded" }),
      etat("unreachable", "d", "DriveAI", { detail: "délai" }),
    ]);
    // Les pannes d'abord : l'ordre vient de la gravité, pas de l'ordre des apps.
    expect(r.phrase).toBe("Deux apps sont à jour. DriveAI ne répond plus et JobAI a du retard.");
    expect(r.ton).toBe("danger");
  });

  it("trois problèmes : une liste « A, B et C »", () => {
    const r = resume([
      ok("a", "Alpha", { status: "degraded" }),
      ok("b", "Bravo", { status: "error" }),
      etat("unauthorized", "c", "Charlie"),
    ]);
    expect(r.phrase).toBe("Bravo est en erreur, Charlie refuse l’accès du hub et Alpha a du retard.");
  });

  it("plus de trois problèmes : un compte, pas une liste", () => {
    const r = resume([
      ok("a", "Alpha", { status: "degraded" }),
      ok("b", "Bravo", { status: "degraded" }),
      ok("c", "Charlie", { status: "degraded" }),
      ok("d", "Delta", { status: "degraded" }),
      ok("e", "Écho"),
    ]);
    expect(r.phrase).toBe("Une app est à jour. 4 apps à régler ou à surveiller.");
    expect(r.ton).toBe("warn");
  });

  it("une app à jour qui affiche une alerte grave n'est pas comptée « à jour »", () => {
    const r = resume([ok("a", "Alpha"), ok("b", "Bravo", { alerts: [{ severity: "warn", label: "x" }] })]);
    expect(r.phrase).toBe("Une app est à jour. Bravo a 1 point à regarder.");
  });

  it("une app en panne ET avec des alertes n'est dite qu'une fois", () => {
    const r = resume([etat("unreachable", "a", "Alpha", { detail: "délai" })]);
    expect(r.phrase).toBe("Alpha ne répond plus.");
  });

  it("aucune app à jour : la phrase ne commence pas par « Aucune app est à jour »", () => {
    const r = resume([etat("unreachable", "a", "Alpha", { detail: "x" }), etat("unreachable", "b", "Bravo", { detail: "x" })]);
    expect(r.phrase).toBe("Alpha ne répond plus et Bravo ne répond plus.");
    expect(r.phrase).not.toMatch(/aucune app/i);
  });

  it("toutes les formes de phrase restent calculées : un nombre d'apps à jour au-delà de dix est écrit en chiffres", () => {
    const apps = Array.from({ length: 12 }, (_, i) => ok(`a${i}`, `App${i}`));
    const r = resume([...apps, etat("unreachable", "z", "Zèbre", { detail: "x" })]);
    expect(r.phrase).toBe("12 apps sont à jour. Zèbre ne répond plus.");
  });
});

describe("phrase d'état avec des alertes publiées par des apps « ok »", () => {
  it("une alerte grave sur une app à jour : jamais « tout est à jour », l'app est nommée, ton rouge", () => {
    const r = resume([ok("a", "Alpha"), ok("b", "Bravo", { alerts: [{ severity: "alert", label: "Dépassement projeté" }] })]);
    expect(r.phrase).toBe("Une app est à jour. Bravo a 1 point à regarder.");
    expect(r.phrase).not.toMatch(/tout est à jour/i);
    expect(r.ton).toBe("danger");
  });

  it("un avertissement seul : ton warn, compte au pluriel", () => {
    const r = resume([
      ok("a", "Alpha", { alerts: [{ severity: "warn", label: "un" }, { severity: "warn", label: "deux" }] }),
    ]);
    expect(r.phrase).toBe("Alpha a 2 points à regarder.");
    expect(r.ton).toBe("warn");
  });

  it("plusieurs apps concernées : chacune dit son compte de points", () => {
    const r = resume([
      ok("a", "Alpha", { alerts: [{ severity: "warn", label: "un" }] }),
      ok("b", "Bravo", { alerts: [{ severity: "alert", label: "deux" }] }),
    ]);
    // Le plus grave d'abord : l'alerte de Bravo avant l'avertissement d'Alpha.
    expect(r.phrase).toBe("Bravo a 1 point à regarder et Alpha a 1 point à regarder.");
    expect(r.ton).toBe("danger");
  });

  it("une app en construction qui publie une alerte n'est pas présentée comme « à jour »", () => {
    const r = resume([
      ok("a", "Alpha"),
      ok("b", "Bravo", { status: "building", alerts: [{ severity: "warn", label: "x" }] }),
    ]);
    expect(r.phrase).toBe("Une app est à jour. Bravo a 1 point à regarder.");
  });

  it("sans aucune alerte la phrase reste « Tout est à jour. »", () => {
    expect(resume([ok("a", "Alpha"), ok("b", "Bravo")]).phrase).toBe("Tout est à jour.");
  });
});

describe("points à regarder", () => {
  const alerte = (label: string) => ({ severity: "alert" as const, label });

  it("au plus MAX_POINTS affichés, le reste est compté", () => {
    const r = resume([
      ok("a", "Alpha", { alerts: [alerte("un"), alerte("deux"), alerte("trois"), alerte("quatre"), alerte("cinq")] }),
    ]);
    expect(r.points).toHaveLength(MAX_POINTS);
    expect(r.restants).toBe(2);
  });

  it("les infos n'entrent pas dans les points", () => {
    const r = resume([ok("a", "Alpha", { alerts: [{ severity: "info", label: "nouvelle" }] })]);
    expect(r.points).toEqual([]);
    expect(r.phrase).toBe("L’app est à jour.");
  });
});

describe("ResumeHub (rendu)", () => {
  const rendre = (resultats: SummaryResult[]) => {
    const liste: Attention[] = attentions(resultats, NOW);
    return renderToStaticMarkup(h(ResumeHub, { resume: resumeHub(resultats, liste), liste, maintenant: NOW }));
  };

  it("tout va bien : la phrase seule, pas de liste vide", () => {
    const html = rendre([ok("a", "Alpha")]);
    // La date (heure du Québec) précède la phrase : « mercredi 15 juillet · 8 h 00 ».
    expect(texte(html)).toBe("mercredi 15 juillet · 8 h 00 L’app est à jour.");
    expect(html).not.toContain("resume__points");
  });

  it("un point mène à la page de l'app, avec son nom et son libellé", () => {
    const html = rendre([etat("unreachable", "b", "Bravo", { detail: "délai" })]);
    expect(html).toContain('href="/app/b"');
    expect(texte(html)).toContain("Bravo Injoignable — délai");
    // Le bouton porte le nom de l'app pour les lecteurs d'écran.
    expect(texte(html)).toContain("Voir Bravo");
    expect(html).toContain("resume__voir");
    expect(html).toContain('data-ton="danger"');
  });

  it("au-delà de trois points, le bandeau mène à /attention", () => {
    const alertes = Array.from({ length: 5 }, (_, i) => ({ severity: "alert" as const, label: `p${i}` }));
    const html = rendre([ok("a", "Alpha", { alerts: alertes })]);
    expect(html).toContain('href="/attention"');
  });
});
