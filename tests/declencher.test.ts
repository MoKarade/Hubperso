// tests/declencher.test.ts — les verrous du déclenchement, éprouvés un par un.
//
// `verifierAction` est PURE : elle se teste sans réseau, sans base, sans horloge. C'est
// voulu — c'est la fonction qui porte la sécurité, et une fonction de sécurité qu'on ne
// peut pas exercer sans monter une infrastructure finit par n'être exercée nulle part.
//
// Chaque cas de refus nomme le SCÉNARIO D'ATTAQUE qu'il ferme, pas seulement le symptôme :
// un test qui dit « retourne origine-etrangere » se supprime sans remords le jour où il
// gêne ; un test qui dit « le hub deviendrait un relais SSRF vers le service de métadonnées »
// se relit deux fois.

import { describe, it, expect } from "vitest";
import { HUB_TOKEN_HEADER, type HubAction } from "@mokarade/hub-contract";
import { verifierAction, posterAction } from "../lib/declencher";
import { hubSource, validSummary } from "./helpers";

const ORIGINE = "https://finance.hubperso.com";
const SUMMARY_URL = `${ORIGINE}/hub/summary`;
const HREF_LEGITIME = `${ORIGINE}/api/relancer`;

function trigger(over: Partial<HubAction> = {}): HubAction {
  return { label: "Relancer", kind: "trigger", href: HREF_LEGITIME, ...over };
}

function resumeAvec(actions: HubAction[]) {
  return validSummary({ actions });
}

function source(over = {}) {
  return hubSource({ summaryUrl: SUMMARY_URL, ...over });
}

describe("verifierAction — verrou 1 : le protocole", () => {
  it("refuse un href javascript: même s'il est publié tel quel par l'app", () => {
    // Le contrat valide `z.string().url()`, qui accepte javascript:. Sans ce verrou, un
    // href piégé traverserait jusqu'au fetch.
    const action = trigger({ href: "javascript:alert(1)" });
    const verdict = verifierAction({
      summary: resumeAvec([action]),
      hrefDemande: "javascript:alert(1)",
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "href-invalide" });
  });

  it("refuse un href vide", () => {
    const verdict = verifierAction({
      summary: resumeAvec([trigger()]),
      hrefDemande: "",
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "href-invalide" });
  });
});

describe("verifierAction — verrou 2 : l'app l'a bien publiée", () => {
  it("accepte l'action publiée telle quelle", () => {
    const verdict = verifierAction({
      summary: resumeAvec([trigger()]),
      hrefDemande: HREF_LEGITIME,
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toEqual({ ok: true, href: HREF_LEGITIME });
  });

  it("refuse un href FABRIQUÉ côté client, même sur la bonne origine", () => {
    // Le scénario : les champs cachés du formulaire sont réécrits dans le navigateur pour
    // pointer vers un autre endpoint de l'app (`/api/supprimer-tout`). L'origine est la
    // bonne, le jeton est le bon — seul ce verrou l'arrête.
    const verdict = verifierAction({
      summary: resumeAvec([trigger()]),
      hrefDemande: `${ORIGINE}/api/supprimer-tout`,
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "action-inconnue" });
  });

  it("refuse une action `link` : elle n'est pas faite pour être POSTée", () => {
    const verdict = verifierAction({
      summary: resumeAvec([{ label: "Ouvrir", kind: "link", href: HREF_LEGITIME }]),
      hrefDemande: HREF_LEGITIME,
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "action-inconnue" });
  });

  it("refuse quand l'app ne publie plus AUCUNE action", () => {
    // C'est le cas qui justifie le refetch live plutôt que le cache de résilience : une
    // action retirée doit cesser d'être déclenchable immédiatement, pas 30 min plus tard.
    const verdict = verifierAction({
      summary: resumeAvec([]),
      hrefDemande: HREF_LEGITIME,
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "action-inconnue" });
  });
});

describe("verifierAction — verrou 3 : l'origine de l'app", () => {
  it("refuse le service de métadonnées du nuage, même publié par l'app", () => {
    // LE scénario SSRF. L'app (compromise, ou simplement boguée) publie une action qui
    // pointe vers 169.254.169.254 : une adresse que l'app ne peut pas atteindre elle-même,
    // mais que le hub atteint depuis son réseau — avec un jeton en main.
    const href = "http://169.254.169.254/latest/meta-data/iam/security-credentials/";
    const verdict = verifierAction({
      summary: resumeAvec([trigger({ href })]),
      hrefDemande: href,
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "origine-etrangere" });
  });

  it("refuse un hôte tiers : le jeton de l'app ne sort pas de chez elle", () => {
    const href = "https://exfiltration.example/collecte";
    const verdict = verifierAction({
      summary: resumeAvec([trigger({ href })]),
      hrefDemande: href,
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "origine-etrangere" });
  });

  it("refuse un autre PORT du même hôte — `URL.origin` inclut le port, et c'est voulu", () => {
    const href = `https://finance.hubperso.com:8080/api/relancer`;
    const verdict = verifierAction({
      summary: resumeAvec([trigger({ href })]),
      hrefDemande: href,
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "origine-etrangere" });
  });

  it("refuse un sous-domaine voisin : « chez hubperso » n'est pas « chez cette app »", () => {
    const href = "https://drive.hubperso.com/api/relancer";
    const verdict = verifierAction({
      summary: resumeAvec([trigger({ href })]),
      hrefDemande: href,
      summaryUrl: SUMMARY_URL,
    });
    expect(verdict).toMatchObject({ ok: false, refus: "origine-etrangere" });
  });
});

describe("posterAction", () => {
  it("n'émet AUCUNE requête quand l'action est refusée", async () => {
    // Le refus doit précéder le réseau. Si le fetch partait puis qu'on jugeait après, le
    // POST aurait déjà eu lieu — c'est-à-dire que le verrou n'existerait pas.
    let appele = false;
    const espion = (async () => {
      appele = true;
      return new Response("{}");
    }) as unknown as typeof fetch;

    const resultat = await posterAction({
      source: source(),
      summary: resumeAvec([]),
      hrefDemande: HREF_LEGITIME,
      fetchImpl: espion,
    });

    expect(resultat).toMatchObject({ etat: "refuse", refus: "action-inconnue" });
    expect(appele).toBe(false);
  });

  it("n'émet aucune requête sans jeton configuré", async () => {
    let appele = false;
    const espion = (async () => {
      appele = true;
      return new Response("{}");
    }) as unknown as typeof fetch;

    const resultat = await posterAction({
      source: source({ token: null }),
      summary: resumeAvec([trigger()]),
      hrefDemande: HREF_LEGITIME,
      fetchImpl: espion,
    });

    expect(resultat).toEqual({ etat: "non-configuree" });
    expect(appele).toBe(false);
  });

  it("POSTe avec le jeton, sans suivre les redirections", async () => {
    let url: string | undefined;
    let init: RequestInit | undefined;
    const espion = (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const resultat = await posterAction({
      source: source(),
      summary: resumeAvec([trigger()]),
      hrefDemande: HREF_LEGITIME,
      fetchImpl: espion,
    });

    expect(resultat).toEqual({ etat: "ok", statut: 200 });
    expect(url).toBe(HREF_LEGITIME);
    expect(init?.method).toBe("POST");
    // `manual` est un VERROU, pas une préférence : sans lui, un 302 publié par l'app
    // emmène le POST — et le jeton — hors de l'origine qu'on vient de vérifier.
    expect(init?.redirect).toBe("manual");
    expect((init?.headers as Record<string, string>)[HUB_TOKEN_HEADER]).toBe("jeton-de-test");
  });

  it("refuse une redirection au lieu de la suivre", async () => {
    const redirige = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      })) as unknown as typeof fetch;

    const resultat = await posterAction({
      source: source(),
      summary: resumeAvec([trigger()]),
      hrefDemande: HREF_LEGITIME,
      fetchImpl: redirige,
    });

    expect(resultat).toMatchObject({ etat: "refuse", refus: "origine-etrangere" });
  });

  it("rend un échec HONNÊTE sur erreur de l'app (pas un succès silencieux)", async () => {
    const casse = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;

    const resultat = await posterAction({
      source: source(),
      summary: resumeAvec([trigger()]),
      hrefDemande: HREF_LEGITIME,
      fetchImpl: casse,
    });

    expect(resultat).toEqual({ etat: "echec", detail: "HTTP 500" });
  });

  it("nomme le délai dépassé plutôt que de le confondre avec un refus", async () => {
    const lent = (async () => {
      throw new DOMException("aborted", "TimeoutError");
    }) as unknown as typeof fetch;

    const resultat = await posterAction({
      source: source(),
      summary: resumeAvec([trigger()]),
      hrefDemande: HREF_LEGITIME,
      fetchImpl: lent,
    });

    expect(resultat).toMatchObject({ etat: "echec" });
    expect((resultat as { detail: string }).detail).toContain("délai dépassé");
  });
});
