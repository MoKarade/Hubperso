// tests/grapheVue3d.test.ts — la page 3D et ses fichiers statiques.
//
// La vue 3D tourne dans l'origine du hub sur des données d'un dépôt (non fiables, mais inertes :
// du JSON, des chaînes). Ce fichier verrouille ce qui la rend sûre : la bibliothèque a l'empreinte
// annoncée, et le code du visualiseur n'a ni réseau hors du hub, ni stockage, ni écriture de HTML.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BASCULE_2D, LIB3D, LIB3D_SRI, VISUALISEUR3D, avecBascule3d, vueDemandee } from "../lib/grapheVue3d";

const lire = (chemin: string) => readFileSync(resolve(process.cwd(), "public", chemin.replace(/^\//, "")));

describe("la copie locale de 3d-force-graph", () => {
  it("existe et a l'empreinte du paquet npm 3d-force-graph@1.80.1 (sha384)", () => {
    // C'est CE test qui garantit le script servi : la page n'a pas d'attribut integrity.
    const sri = "sha384-" + createHash("sha384").update(lire(LIB3D)).digest("base64");
    expect(sri).toBe(LIB3D_SRI);
  });
});

describe("vueDemandee", () => {
  it("donnees seulement sur demande ; tout le reste donne la page 2D", () => {
    expect(vueDemandee("donnees")).toBe("donnees");
    expect(vueDemandee("2d")).toBe("2d");
    expect(vueDemandee(null)).toBe("2d");
    expect(vueDemandee("3d")).toBe("2d");
    expect(vueDemandee("<x>")).toBe("2d");
  });
});

describe("avecBascule3d", () => {
  it("pose le bouton avant </body>, avec le dépôt, et échappe la cause", () => {
    const r = avecBascule3d("<html><body>x</body></html>", "hubperso", 'a "b" <i>');
    expect(r).toBe(
      `<html><body>x<script src="${BASCULE_2D}" data-depot="hubperso" data-cause="a &#34;b&#34; &#60;i&#62;"></script></body></html>`,
    );
  });

  it("sans </body>, l'ajoute à la fin ; sans cause, pas d'attribut data-cause", () => {
    expect(avecBascule3d("<p>x</p>", "carai")).toBe(`<p>x</p><script src="${BASCULE_2D}" data-depot="carai"></script>`);
  });

  it("ne mange pas un motif $& du HTML d'origine", () => {
    expect(avecBascule3d("<body>$&</body>", "x")).toContain("$&<script");
  });
});

describe("les scripts du hub (public/graphes)", () => {
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
    ["navigation du hub (location.href / open)", /location\.(href|assign|replace)\s*=|window\.open/],
    ["import dynamique", /\bimport\s*\(/],
  ];

  for (const f of FICHIERS) {
    for (const [nom, motif] of INTERDIT) {
      // Le visualiseur lit les données du hub : son unique fetch est vérifié plus bas.
      if (f === VISUALISEUR3D && nom === "réseau (fetch)") continue;
      it(`${f} : aucun ${nom}`, () => {
        const source = lire(f).toString("utf8");
        expect(source).not.toMatch(motif);
      });
    }
  }
});

describe("le visualiseur (public/graphes/vue3d.js)", () => {
  const source = lire(VISUALISEUR3D).toString("utf8");

  it("ne lit que les données du hub : un seul fetch, vers /api/graphes/…?vue=donnees, sans ressource externe", () => {
    expect(source.match(/fetch\(/g)).toHaveLength(1);
    expect(source).toContain('"/api/graphes/" + encodeURIComponent(id) + "?vue=donnees"');
  });

  it("pose le texte du dépôt par textContent : pas de createElement('script'), pas d'attribut on…", () => {
    expect(source).not.toMatch(/createElement\(\s*["']script["']/);
    expect(source).not.toMatch(/setAttribute\(\s*["']on/);
    expect(source).toContain(".textContent");
  });

  it("les identifiants d'URL de la carte sont filtrés avant d'entrer dans un sélecteur", () => {
    expect(source).toContain('replace(/[^a-z0-9-]/g, "")');
  });
});
