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
    expect(r.phrase).toBe("Bravo : injoignable.");
    expect(r.ton).toBe("danger");
    expect(r.points.map((p) => p.appNom)).toEqual(["Bravo"]);
  });

  it("plusieurs apps en panne : un compte, pas une liste dans la phrase", () => {
    const r = resume([
      etat("unreachable", "a", "Alpha", { detail: "x" }),
      etat("unauthorized", "b", "Bravo"),
      ok("c", "Charlie"),
    ]);
    expect(r.phrase).toBe("2 apps à régler.");
    expect(r.ton).toBe("danger");
  });

  it("données en retard : à surveiller, ton warn", () => {
    const r = resume([ok("a", "Alpha", { status: "degraded" }), ok("b", "Bravo")]);
    expect(r.phrase).toBe("Alpha : données en retard.");
    expect(r.ton).toBe("warn");
  });

  it("deux apps à surveiller : un compte", () => {
    const r = resume([ok("a", "Alpha", { status: "degraded" }), ok("b", "Bravo", { status: "degraded" })]);
    expect(r.phrase).toBe("2 apps à surveiller.");
  });

  it("la panne passe avant l'avertissement", () => {
    const r = resume([ok("a", "Alpha", { status: "degraded" }), etat("invalid", "b", "Bravo", { detail: "x" })]);
    expect(r.phrase).toBe("Bravo : réponse invalide.");
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
    expect(resume([enCache]).phrase).toBe("Alpha : en cache.");
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
