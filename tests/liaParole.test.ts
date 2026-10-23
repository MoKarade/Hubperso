// tests/liaParole.test.ts — ce que LIA dit des cartes et ce qu'elle raconte seule : l'état réel,
// jamais une phrase d'avance, jamais un chiffre, et le silence quand il n'y a rien de vrai à dire.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HubSummary } from "@mokarade/hub-contract";
import { AppWidget } from "@/components/AppWidget";
import { ResumeHub } from "@/components/ResumeHub";
import type { SummaryResult } from "@/lib/fetchSummary";
import { attentions } from "@/lib/attention";
import {
  ditCarte,
  ditCouts,
  entreesMonde,
  instantDernierAppel,
  parleMonde,
  faitDepuisDataset,
  graviteLia,
  parleSeule,
  type FaitLia,
} from "@/lib/liaParole";
import { resumeHub } from "@/lib/resume";
import { hubSource, validSummary } from "./helpers";

vi.mock("@/app/actions", () => ({ actionDeclencher: vi.fn() }));

const NOW = Date.parse("2026-10-23T14:00:00.000Z");
const source = hubSource({ id: "driveai", name: "DriveAI" });
const ok = (over: Partial<HubSummary> = {}, stale = false): SummaryResult => ({
  state: "ok",
  source,
  summary: validSummary({ app: { id: "driveai", name: "DriveAI", url: "https://d.invalid", color: "#336699" }, ...over }),
  ...(stale ? { stale: true } : null),
});

describe("ditCarte : la phrase d'une carte vient de son état", () => {
  it("à jour sans alerte : rien à signaler", () => {
    expect(ditCarte(ok())).toBe("DriveAI est à jour, rien à signaler.");
  });

  it("à jour avec une info : dite, ponctuée une seule fois", () => {
    const q = ok({ alerts: [{ label: "Tout va bien ?", severity: "info" }] });
    expect(ditCarte(q)).toBe("DriveAI est à jour. Tout va bien ?");
  });

  it("à jour avec un avertissement ou une alerte : jamais dite sous « à jour »", () => {
    const w = ok({ alerts: [{ label: "Deux offres expirent bientôt", severity: "warn" }] });
    expect(ditCarte(w)).toBe("DriveAI a un point à regarder. Deux offres expirent bientôt.");
    const a = ok({
      alerts: [
        { label: "Une info", severity: "info" },
        { label: "Dépassement de km projeté", severity: "alert" },
      ],
    });
    expect(ditCarte(a)).toBe("DriveAI a un point à regarder. Dépassement de km projeté.");
    expect(ditCarte(a)).not.toContain("à jour");
  });

  it("injoignable, invalide, refusée, non branchée : dites telles quelles, sans détail technique", () => {
    expect(ditCarte({ state: "unreachable", source, detail: "délai dépassé secret-interne" })).toBe(
      "DriveAI est injoignable : je ne peux rien lire de plus pour l’instant.",
    );
    expect(ditCarte({ state: "invalid", source, detail: "x" })).toContain("n’est pas valide");
    expect(ditCarte({ state: "unauthorized", source })).toContain("refuse l’accès");
    expect(ditCarte({ state: "unconfigured", source, manque: ["jeton"] })).toContain("n’est pas branchée");
    expect(ditCarte({ state: "contract-too-new", source, published: 3, supported: 1 })).toContain(
      "c’est le hub qui est en retard",
    );
  });

  it("en construction : aucune mesure à analyser, jamais « à jour »", () => {
    const phrase = ditCarte(ok({ status: "building" }));
    expect(phrase).toBe("DriveAI est en construction : aucune mesure à analyser.");
    expect(phrase).not.toContain("à jour");
  });

  it("résumé en cache : jamais présenté comme vivant", () => {
    expect(ditCarte(ok({}, true))).toContain("dernier résumé connu");
  });

  it("retard et erreur", () => {
    expect(ditCarte(ok({ status: "degraded" }))).toContain("données en retard");
    expect(ditCarte(ok({ status: "error" }))).toContain("signale une erreur");
  });

  it("un libellé d'alerte démesuré est borné, jamais repris en entier", () => {
    const long = "x".repeat(500);
    const phrase = ditCarte(ok({ alerts: [{ label: long, severity: "alert" }] }));
    expect(phrase.length).toBeLessThan(200);
    expect(phrase).toContain("…");
  });

  it("aucun chiffre de mesure dans la phrase", () => {
    expect(ditCarte(ok())).not.toMatch(/123|456/);
  });
});

describe("ditCouts", () => {
  it("dit seulement ce que la carte affiche", () => {
    expect(ditCouts(0, 0)).toBe("Aucun quota n’est publié pour l’instant.");
    expect(ditCouts(0, 3)).toBe("Aucun quota à surveiller.");
    expect(ditCouts(1, 3)).toBe("1 quota à surveiller.");
    expect(ditCouts(2, 3)).toBe("2 quotas à surveiller.");
  });
});

const fait = (appId: string, gravite: FaitLia["gravite"], dit = `${appId} : ${gravite}.`): FaitLia => ({
  appId,
  appNom: appId,
  gravite,
  dit,
});

describe("parleSeule : elle ne dit que le vrai, sinon elle se tait", () => {
  it("page pas encore chargée (aucune carte) : silence, quel que soit le motif", () => {
    for (const m of ["salut", "rien", "relance"] as const) expect(parleSeule(m, [], 10)).toBeNull();
  });

  it("tout à jour : salut oui (« Tout est à jour »), remarque et relance non", () => {
    const faits = [fait("a", "ok"), fait("b", "ok")];
    expect(parleSeule("salut", faits, 9)).toBe("Bonjour Marc. Tout est à jour.");
    expect(parleSeule("rien", faits, 9)).toBeNull();
    expect(parleSeule("relance", faits, 9)).toBeNull();
  });

  it("une app en construction ou non branchée : pas de « tout est à jour »", () => {
    expect(parleSeule("salut", [fait("a", "ok"), fait("b", "info")], 9)).toBe("Bonjour Marc.");
  });

  it("une panne : le plus grave d'abord, à gravité égale l'ordre des cartes", () => {
    const faits = [fait("a", "warn", "A en retard."), fait("b", "alert", "B injoignable."), fait("c", "alert", "C refusée.")];
    expect(parleSeule("rien", faits, 9)).toBe("B injoignable.");
    expect(parleSeule("relance", faits, 9)).toBe("B injoignable.");
    expect(parleSeule("salut", faits, 9)).toBe("Bonjour Marc. B injoignable.");
  });

  it("bonsoir le soir et la nuit, bonjour le jour (heure locale de Marc)", () => {
    const faits = [fait("a", "ok")];
    expect(parleSeule("salut", faits, 4)).toContain("Bonsoir");
    expect(parleSeule("salut", faits, 5)).toContain("Bonjour");
    expect(parleSeule("salut", faits, 17)).toContain("Bonjour");
    expect(parleSeule("salut", faits, 18)).toContain("Bonsoir");
  });
});

describe("faitDepuisDataset : une carte mal formée ne fait rien dire", () => {
  const bon = { liaApp: "a", liaNom: "A", liaGravite: "warn", liaDit: "A est en retard." };
  it("lit une carte complète", () => {
    expect(faitDepuisDataset(bon)).toEqual({ appId: "a", appNom: "A", gravite: "warn", dit: "A est en retard." });
  });
  it("refuse un attribut manquant ou une gravité inconnue", () => {
    expect(faitDepuisDataset({ ...bon, liaDit: "" })).toBeNull();
    expect(faitDepuisDataset({ ...bon, liaApp: undefined })).toBeNull();
    expect(faitDepuisDataset({ ...bon, liaGravite: "critique" })).toBeNull();
  });
});

describe("graviteLia suit le ton du badge", () => {
  it("danger → alert, warn → warn, ok → ok, info et neutre → info", () => {
    expect([graviteLia("danger"), graviteLia("warn"), graviteLia("ok"), graviteLia("info"), graviteLia("neutral")]).toEqual([
      "alert",
      "warn",
      "ok",
      "info",
      "info",
    ]);
  });
});

describe("la page porte ce que LIA lit", () => {
  it("la carte est une cible de LIA avec sa phrase et sa gravité", () => {
    const html = renderToStaticMarkup(h(AppWidget, { result: ok({ status: "degraded" }), maintenantMs: NOW }));
    expect(html).toContain("data-lia-cible");
    expect(html).toContain('data-lia-app="driveai"');
    expect(html).toContain('data-lia-gravite="warn"');
    expect(html).toContain('data-lia-dit="DriveAI a des données en retard."');
  });

  it("le résumé est une cible et ses points ont « Analyser » ET « Voir »", () => {
    const resultats = [ok({ alerts: [{ label: "Deux offres expirent", severity: "warn" }] })];
    const html = renderToStaticMarkup(
      h(ResumeHub, { resume: resumeHub(resultats, attentions(resultats, NOW)), liste: attentions(resultats, NOW), maintenant: NOW }),
    );
    expect(html).toContain("data-lia-cible");
    expect(html).toContain("Analyser");
    expect(html).toContain("Voir");
  });

  it("LiaHub passe onSpontane et écoute « Analyser » ; il ne fait défiler que sur geste explicite", () => {
    const src = readFileSync(join(__dirname, "..", "components", "LiaHub.tsx"), "utf8");
    expect(src).toContain("onSpontane={onSpontane}");
    expect(src).toContain("EVENEMENT_LIA_VOIR");
    // Une seule occurrence de défilement, dans le gestionnaire du bouton.
    expect(src.match(/scrollIntoView/g)).toHaveLength(1);
  });
});

describe("entreesMonde : le monde de LIA vient des cartes affichées", () => {
  const f = (gravite: FaitLia["gravite"], appId = "a"): FaitLia => ({ appId, appNom: appId, gravite, dit: "x" });

  it("aucune carte : aucune entrée, un monde calme", () => {
    expect(entreesMonde([])).toEqual({});
  });

  it("tout est à jour : toutVert, rien d'inquiétant", () => {
    expect(entreesMonde([f("ok"), f("ok", "b")])).toEqual({ alerte: 0, nbAlertes: 0, toutVert: 1 });
  });

  it("une alerte grave : alerte à 1, la part des cartes en cause, plus de toutVert", () => {
    expect(entreesMonde([f("alert"), f("ok", "b"), f("ok", "c"), f("warn", "d")])).toEqual({
      alerte: 1,
      nbAlertes: 0.5,
      toutVert: 0,
    });
  });

  it("un simple avertissement pèse moins qu'une alerte ; une info n'est pas un problème", () => {
    expect(entreesMonde([f("warn"), f("info", "b")])).toEqual({ alerte: 0.6, nbAlertes: 0.5, toutVert: 0 });
    expect(entreesMonde([f("info")]).alerte).toBe(0);
  });
});

describe("parleMonde : ce que LIA dit du monde vient des cartes", () => {
  const f = (gravite: FaitLia["gravite"], appId = "a", dit = `${appId} dit`): FaitLia => ({
    appId,
    appNom: appId,
    gravite,
    dit,
  });
  const T = 10_000_000;

  it("appeler : le problème le plus grave, jamais une panne inventée", () => {
    const faits = [f("warn", "b", "B a un point à regarder."), f("alert", "c", "C signale une erreur."), f("ok", "d")];
    expect(parleMonde("appeler", faits, null, null, T)).toEqual({ text: "C signale une erreur.", appId: "c" });
    expect(parleMonde("appeler", [f("ok"), f("info", "b")], null, null, T)).toBeNull();
    expect(parleMonde("appeler", [], null, null, T)).toBeNull();
  });

  it("appeler : pas deux fois dans les 30 minutes, puis de nouveau", () => {
    const faits = [f("alert")];
    expect(parleMonde("appeler", faits, null, T - 29 * 60_000, T)).toBeNull();
    expect(parleMonde("appeler", faits, null, T - 31 * 60_000, T)).toEqual({ text: "a dit", appId: "a" });
  });

  it("appeler : à la borne exacte des 30 minutes, elle peut de nouveau appeler", () => {
    expect(parleMonde("appeler", [f("alert")], null, T - 30 * 60_000, T)).toEqual({ text: "a dit", appId: "a" });
  });

  it("le dernier appel du journal : le plus récent, quel que soit l'ordre, les autres comportements ignorés", () => {
    expect(instantDernierAppel([])).toBeNull();
    expect(instantDernierAppel([{ t: 5, quoi: "jouer" }])).toBeNull();
    expect(
      instantDernierAppel([
        { t: 7, quoi: "appeler" },
        { t: 9, quoi: "jouer" },
        { t: 3, quoi: "appeler" },
      ]),
    ).toBe(7);
  });

  it("accompagner : le constat de la carte que Marc fixe, rien sans carte", () => {
    expect(parleMonde("accompagner", [], f("ok", "x", "X est à jour, rien à signaler."), null, T)).toEqual({
      text: "X est à jour, rien à signaler.",
      appId: "x",
    });
    expect(parleMonde("accompagner", [f("alert")], null, null, T)).toBeNull();
  });

  it("résumer, féliciter, rappeler, souvenir : rien de vrai à dire, donc rien", () => {
    for (const motif of ["resumer", "feliciter", "rappeler", "souvenir"]) {
      expect(parleMonde(motif, [f("alert")], f("alert"), null, T)).toBeNull();
    }
  });
});
