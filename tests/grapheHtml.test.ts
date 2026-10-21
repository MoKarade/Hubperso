// tests/grapheHtml.test.ts — préparer le graph.html d'un dépôt avant de le servir.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VIS_LOCAL, VIS_SRI, VIS_VERSION, preparerHtml } from "../lib/grapheHtml";

const unpkg = (v: string) =>
  `<script src="https://unpkg.com/vis-network@${v}/standalone/umd/vis-network.min.js" integrity="${VIS_SRI}" crossorigin="anonymous"></script>`;
const page = (v: string) => `<!doctype html><html><body>${unpkg(v)}<script>var x=1;</script></body></html>`;

describe("la copie locale de vis-network", () => {
  it("existe et a l'empreinte que la balise d'origine déclare (SRI sha384)", () => {
    // C'est CE test qui garantit le script servi : la balise réécrite n'a pas d'integrity.
    const fichier = readFileSync(resolve(process.cwd(), "public", VIS_LOCAL.slice(1)));
    const sri = "sha384-" + createHash("sha384").update(fichier).digest("base64");
    expect(sri).toBe(VIS_SRI);
  });
});

describe("preparerHtml", () => {
  it("remplace le script unpkg par la copie locale, et rien d'autre", () => {
    const r = preparerHtml(page(VIS_VERSION));
    expect(r).toEqual({
      ok: true,
      html: `<!doctype html><html><body><script src="${VIS_LOCAL}"></script><script>var x=1;</script></body></html>`,
    });
  });

  it("REFUSE une autre version de vis-network (non relue)", () => {
    const r = preparerHtml(page("9.2.0"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/version inattendue.*9\.2\.0/);
  });

  it("refuse un fichier qui ne charge pas vis-network comme attendu", () => {
    const r = preparerHtml("<html><script>1</script></html>");
    expect(r.ok).toBe(false);
  });

  it("refuse une page qui référence encore une ressource externe", () => {
    const r = preparerHtml(
      page(VIS_VERSION).replace("<body>", '<body><img src="https://evil.example/p.png">'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/ressource externe/);
  });
});
