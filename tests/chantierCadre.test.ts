// tests/chantierCadre.test.ts — la page Chantier dans son cadre isolé : l'isolement, ce que le hub répond
// au cadre, et — surtout, ce dépôt étant PUBLIC — que le document servi ne porte AUCUNE donnée.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CSP_CADRE,
  MESSAGE_PRET,
  SANDBOX_CADRE,
  URL_CADRE,
  URL_RELEVE,
  consigneDeReponse,
  estGzip,
  estMessagePret,
} from "@/lib/chantierCadre";

const DOCUMENT = readFileSync(resolve(process.cwd(), "chantier", "cadre.html"), "utf8");

describe("l'isolement du cadre", () => {
  const directives = new Map(
    CSP_CADRE.split("; ").map((d) => [d.split(" ")[0]!, d.slice(d.indexOf(" ") + 1)] as const),
  );

  it("origine opaque : `sandbox` sans allow-same-origin ni navigation du hub, sur l'attribut ET dans la CSP", () => {
    for (const valeur of [SANDBOX_CADRE, directives.get("sandbox")!]) {
      expect(valeur).toContain("allow-scripts");
      expect(valeur).not.toContain("allow-same-origin");
      expect(valeur).not.toContain("allow-top-navigation");
      expect(valeur).not.toContain("allow-forms");
    }
  });

  it("aucun réseau, aucune ressource externe, et seul le hub peut la mettre en cadre", () => {
    expect(directives.get("default-src")).toBe("'none'");
    expect(directives.get("connect-src")).toBe("'none'");
    expect(directives.get("form-action")).toBe("'none'");
    expect(directives.get("frame-ancestors")).toBe("'self'");
    // `script-src` n'admet que le script du document lui-même : aucun hôte, aucun 'self'.
    expect(directives.get("script-src")).toBe("'unsafe-inline'");
    expect(CSP_CADRE).not.toMatch(/https?:/);
  });

  it("les deux adresses sont celles des routes du hub", () => {
    expect(URL_CADRE).toBe("/api/chantier/cadre");
    expect(URL_RELEVE).toBe("/api/chantier/releve");
  });
});

describe("consigneDeReponse", () => {
  it("200 : un relevé à poster ; 304 : rien à faire", () => {
    expect(consigneDeReponse(200)).toEqual({ type: "poster" });
    expect(consigneDeReponse(304)).toEqual({ type: "inchange" });
  });

  it("une absence n'est pas une panne, et une panne n'est pas une absence", () => {
    const aucun = consigneDeReponse(404);
    const panne = consigneDeReponse(500);
    expect(aucun).toMatchObject({ type: "etat", message: "Aucun relevé reçu pour l'instant." });
    expect(panne).toMatchObject({ type: "etat" });
    expect((panne as { message: string }).message).toContain("indisponible");
    expect((panne as { message: string }).message).not.toContain("Aucun relevé");
  });

  it.each([401, 429, 503, 500, 502])("%i : un message en clair pour le cadre", (status) => {
    const c = consigneDeReponse(status);
    expect(c.type).toBe("etat");
    expect((c as { message: string }).message.length).toBeGreaterThan(10);
  });
});

describe("estGzip", () => {
  it("reconnaît l'en-tête gzip (1f 8b) et rien d'autre", () => {
    const octets = (...o: number[]) => new Uint8Array(o).buffer;
    expect(estGzip(octets(0x1f, 0x8b, 8))).toBe(true);
    expect(estGzip(octets(0x7b, 0x22))).toBe(false); // « {" » : du JSON
    expect(estGzip(octets(0x1f))).toBe(false);
    expect(estGzip(octets())).toBe(false);
  });
});

describe("estMessagePret", () => {
  it("ne reconnaît que le message du cadre", () => {
    expect(estMessagePret({ type: MESSAGE_PRET })).toBe(true);
    for (const autre of [null, undefined, "chantier-pret", 3, {}, { type: "autre" }]) {
      expect(estMessagePret(autre), String(autre)).toBe(false);
    }
  });
});

// ── LE DOCUMENT SERVI : UN DÉPÔT PUBLIC NE PORTE AUCUNE DONNÉE ──────────────────────────
//
// `chantier/cadre.html` est la page de suivi telle qu'elle est publiée sur claude.ai, SANS ses données :
// le relevé arrive par le hub, et le registre des dépenses (reçus, prélèvements, montants personnels)
// par le relevé (`couts_manuels`, produit sur le PC). Ces tests échouent si l'un d'eux y revient.
describe("chantier/cadre.html", () => {
  it("n'embarque aucun relevé : il n'attend que celui du hub", () => {
    expect(DOCUMENT).toContain("const EMBED = null;");
    expect(DOCUMENT).toContain("function start(d){ if (started || !d) return;");
  });

  it("le registre des dépenses est vide dans le code (il vient du relevé)", () => {
    for (const [nom, vide] of [
      ["VERCEL_RECUS", "[]"],
      ["VERCEL_COURANT", "null"],
      ["CLIGNES", "[]"],
      ["CAVENIR", "[]"],
      ["CNOTES", "{}"],
    ] as const) {
      expect(DOCUMENT, nom).toContain(`let ${nom} = ${vide};`);
    }
    expect(DOCUMENT).toContain("couts_manuels");
  });

  it("aucun montant en dollars ni boîte de courriel dans le texte du document", () => {
    // Un montant à décimales (« 151,28 $ ») ou « Gmail » dit un reçu réel : ils n'ont rien à faire ici.
    // Les `$` des gabarits JS (`${…}`) et les repères entiers (« 20 $ par mois ») ne sont pas visés.
    expect(DOCUMENT).not.toMatch(/\d{2,}[,.]\d{2} ?\$/);
    expect(DOCUMENT).not.toMatch(/gmail/i);
    expect(DOCUMENT).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });

  it("n'a aucun accès réseau ni ressource externe (le cadre n'en aurait de toute façon pas)", () => {
    expect(DOCUMENT).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|importScripts|new Worker/);
    expect(DOCUMENT).not.toMatch(/<script[^>]+\ssrc=|<link[^>]+href=|@import|url\(["']?https?:/);
    const adresses = [...DOCUMENT.matchAll(/https?:\/\/[^\s"'<>)`]+/g)].map((m) => m[0]);
    for (const a of adresses) {
      expect(a.startsWith("https://github.com/MoKarade/") || a === "http://www.w3.org/2000/svg", a).toBe(true);
    }
  });

  it("tout lien s'ouvre dans une autre fenêtre : jamais dans le cadre, qui reçoit le relevé", () => {
    const liens = [...DOCUMENT.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    expect(liens.length).toBeGreaterThan(5);
    for (const l of liens) {
      expect(l, l).toContain('target="_blank"');
      expect(l, l).toContain("noopener");
    }
  });

  it("parle au hub par postMessage : annonce qu'il est prêt, ne répond qu'à la fenêtre parente", () => {
    expect(DOCUMENT).toContain(`'${MESSAGE_PRET}'`);
    expect(DOCUMENT).toContain("ev.source !== window.parent");
    expect(DOCUMENT).toContain("'chantier-ping'"); // il redit « prêt » à chaque sonde du hub (voir ChantierCadre)
  });
});
