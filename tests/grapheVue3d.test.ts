// tests/grapheVue3d.test.ts — la page 3D et ses fichiers statiques.
//
// La vue 3D tourne en bac à sable sur des données d'un dépôt (non fiables). Ce fichier verrouille
// ce qui la rend sûre : la bibliothèque a l'empreinte annoncée, la page ne charge que des scripts du
// hub, le JSON ne peut pas fermer son `<script>`, et le code du visualiseur n'a ni réseau, ni
// stockage, ni écriture de HTML.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASCULE_2D,
  LIB3D,
  LIB3D_SRI,
  VISUALISEUR3D,
  avecBascule3d,
  jsonPourScript,
  pageVue3d,
  vueDemandee,
} from "../lib/grapheVue3d";

const lire = (chemin: string) => readFileSync(resolve(process.cwd(), "public", chemin.replace(/^\//, "")));

describe("la copie locale de 3d-force-graph", () => {
  it("existe et a l'empreinte du paquet npm 3d-force-graph@1.80.1 (sha384)", () => {
    // C'est CE test qui garantit le script servi : la page n'a pas d'attribut integrity (bac à sable).
    const sri = "sha384-" + createHash("sha384").update(lire(LIB3D)).digest("base64");
    expect(sri).toBe(LIB3D_SRI);
  });
});

describe("pageVue3d", () => {
  const donnees = {
    noeuds: [
      { nom: "</script><script>alert(1)</script>", fichier: "lib/a.ts", dossier: "lib", type: "code" as const, degre: 1, taille: 14 },
      { nom: "b\u2028c", fichier: "", dossier: "(racine)", type: "autre" as const, degre: 1, taille: 10 },
    ],
    liens: [{ de: 0, vers: 1, relation: "calls", sur: true }],
    liensIgnores: 0,
  };
  const html = pageVue3d({ depot: "Hub<perso>", sha: "abcdef0123456789" }, donnees);

  it("ne charge que des scripts du hub, par chemin relatif", () => {
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
    expect(srcs).toEqual([LIB3D, VISUALISEUR3D]);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("n'a aucun script exécutable en ligne : seul le JSON inerte est en ligne", () => {
    const enLigne = [...html.matchAll(/<script\b(?![^>]*\bsrc=)([^>]*)>/g)].map((m) => m[1]!.trim());
    expect(enLigne).toEqual(['type="application/json" id="donnees"']);
  });

  it("le texte du dépôt ne peut pas fermer le <script> ni injecter de balise", () => {
    expect(html.match(/<\/script>/g)).toHaveLength(3); // exactement les trois balises de la page : JSON, bibliothèque, visualiseur
    expect(html).not.toContain("<script>alert");
    const json = /<script type="application\/json" id="donnees">([\s\S]*?)<\/script>/.exec(html)![1]!;
    const lu = JSON.parse(json);
    expect(lu.noeuds[0].nom).toBe("</script><script>alert(1)</script>");
    expect(lu.noeuds[1].nom).toBe("b\u2028c");
    expect(lu.sha).toBe("abcdef0");
    expect(json).not.toContain("\u2028");
  });

  it("échappe le nom du dépôt dans le titre", () => {
    expect(html).toContain("<title>Hub&#60;perso&#62; — graphe 3D</title>");
  });
});

describe("jsonPourScript", () => {
  it("ne laisse aucun < ni séparateur de ligne Unicode", () => {
    const s = jsonPourScript({ a: "<!-- </script> \u2028 \u2029" });
    expect(s).not.toMatch(/[<\u2028\u2029]/);
    expect(JSON.parse(s)).toEqual({ a: "<!-- </script> \u2028 \u2029" });
  });
});

describe("vueDemandee", () => {
  it("2d seulement sur demande ; tout le reste donne la 3D", () => {
    expect(vueDemandee("2d")).toBe("2d");
    expect(vueDemandee("3d")).toBe("3d");
    expect(vueDemandee(null)).toBe("3d");
    expect(vueDemandee("2D")).toBe("3d");
    expect(vueDemandee("<x>")).toBe("3d");
  });
});

describe("avecBascule3d", () => {
  it("pose le bouton avant </body>, et échappe la cause", () => {
    const r = avecBascule3d("<html><body>x</body></html>", 'a "b" <i>');
    expect(r).toBe(`<html><body>x<script src="${BASCULE_2D}" data-cause="a &#34;b&#34; &#60;i&#62;"></script></body></html>`);
  });

  it("sans </body>, l'ajoute à la fin ; sans cause, pas d'attribut", () => {
    expect(avecBascule3d("<p>x</p>")).toBe(`<p>x</p><script src="${BASCULE_2D}"></script>`);
  });

  it("ne mange pas un motif $& du HTML d'origine", () => {
    expect(avecBascule3d("<body>$&</body>")).toContain("$&<script");
  });
});

describe("les scripts du hub servis dans le bac à sable (public/graphes)", () => {
  const FICHIERS = [VISUALISEUR3D, BASCULE_2D];
  const INTERDIT: [string, RegExp][] = [
    ["réseau (fetch)", /\bfetch\s*\(/],
    ["réseau (XMLHttpRequest)", /XMLHttpRequest/],
    ["réseau (WebSocket)", /WebSocket/],
    ["réseau (sendBeacon)", /sendBeacon/],
    ["évaluation de code (eval)", /\beval\s*\(/],
    ["évaluation de code (Function)", /new\s+Function/],
    ["écriture de HTML (innerHTML)", /innerHTML|outerHTML|insertAdjacentHTML/],
    ["écriture de HTML (document.write)", /document\.write/],
    ["stockage", /localStorage|sessionStorage|indexedDB|document\.cookie/],
    ["adresse externe", /https?:\/\//],
    ["import dynamique", /\bimport\s*\(/],
  ];

  for (const f of FICHIERS) {
    for (const [nom, motif] of INTERDIT) {
      it(`${f} : aucun ${nom}`, () => {
        const source = lire(f).toString("utf8");
        expect(source).not.toMatch(motif);
      });
    }
  }
});
