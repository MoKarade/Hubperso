// tests/pwaLiens.test.ts — ouvrir une app depuis le hub doit pouvoir atteindre l'app INSTALLÉE.
//
// ══ POURQUOI CE TEST EXISTE ══════════════════════════════════════════════════════════
//
// Marc, 18/09 : « je veux que toutes les applications soient installables sur le téléphone
// et que lorsque j'ouvre depuis le hub ça ouvre l'application installée ». Android.
//
// Une PWA installée sur Android s'enregistre comme gestionnaire des URL de son `scope`
// (WebAPK) : Chrome peut alors passer la main à l'app au lieu d'ouvrir un onglet. Mais
// seulement sur une navigation de PREMIER NIVEAU — `target="_blank"` crée un onglet de
// navigateur et court-circuite la bascule.
//
// ⚠️ C'est exactement le genre de réglage qui se re-perd : `target="_blank"` est le réflexe
// de tout le monde pour un lien sortant, il s'ajoute sans y penser au prochain lot qui touche
// la carte, et la bascule s'éteint SANS QUE RIEN NE CHANGE À L'ÉCRAN. Sur PC le lien marche
// toujours, sur téléphone il ouvre Chrome au lieu de l'app — et personne ne fait le lien avec
// un attribut ajouté trois semaines plus tôt.
//
// ⚠️ CE QUE CE TEST NE PROUVE PAS. Il ne prouve pas que Chrome BASCULE : ça dépend de la
// version de Chrome, de l'installation réelle et du réglage « ouvrir les liens dans l'app ».
// Aucune infrastructure ici ne peut l'observer — c'est le téléphone de Marc qui tranche, et
// c'est dit plutôt que suggéré. Ce test garde la condition NÉCESSAIRE, celle qui est de notre
// côté : la navigation reste de premier niveau.
//
// ⚠️ PORTÉE DÉLIBÉRÉE — les deux liens gardés ici sont ceux qui ouvrent l'APP elle-même, et
// eux seuls. Les `href` venus du CONTRAT (alertes, actions, recommandations) gardent leur
// `target="_blank"` : ils peuvent pointer n'importe où (le contrat ne les contraint pas à
// l'origine de l'app), et les ouvrir en place ferait quitter le hub à chaque clic sur une
// alerte. Si Marc veut la même bascule pour les liens profonds, c'est un lot à part.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifeste from "../app/manifest";

const RACINE = join(__dirname, "..");
const lire = (...p: string[]) => readFileSync(join(RACINE, ...p), "utf8");

/** Les deux seuls liens du hub qui ouvrent l'APP, avec la variable qui porte leur URL. */
const LIENS_VERS_L_APP = [
  { fichier: ["components", "AppWidget.tsx"], url: "appUrl", quoi: "le titre de la carte" },
  { fichier: ["app", "app", "[id]", "page.tsx"], url: "lienApp", quoi: "le bouton « Ouvrir l’app »" },
] as const;

/** La balise `<a …>` qui utilise cette variable comme `href`, attributs compris. */
function baliseDuLien(source: string, variable: string): string | null {
  const i = source.indexOf(`href={${variable}}`);
  if (i < 0) return null;
  const debut = source.lastIndexOf("<a", i);
  const fin = source.indexOf(">", i);
  return debut < 0 || fin < 0 ? null : source.slice(debut, fin + 1);
}

describe("[PWA-ANDROID] les liens qui ouvrent une app restent des navigations de premier niveau", () => {
  for (const { fichier, url, quoi } of LIENS_VERS_L_APP) {
    it(`${quoi} (${fichier.join("/")}) n'ouvre pas un onglet`, () => {
      const balise = baliseDuLien(lire(...fichier), url);
      // ANTI-VACUITÉ : sans cette assertion, « aucun target=_blank » serait vrai d'un lien
      // RENOMMÉ ou SUPPRIMÉ, donc d'un test qui ne regarde plus rien.
      expect(balise, `aucun <a href={${url}}> trouvé — le lien a changé de forme, pas le besoin`).not.toBeNull();
      expect(balise).not.toContain("_blank");
    });
  }
});

// ── Le manifeste ─────────────────────────────────────────────────────────────────────
// Même garde que chez les six autres apps du parc, adaptée au manifeste de Next.

const m = manifeste();
const icones = m.icons ?? [];
const aPourRole = (i: { purpose?: string }, role: string) => (i.purpose ?? "any").split(/\s+/).includes(role);

/** Dimensions RÉELLES d'un PNG, lues dans son IHDR : `sizes` est une déclaration, pas une mesure. */
function dimensionsPng(chemin: string): { largeur: number; hauteur: number } {
  const buf = readFileSync(chemin);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(signature)) throw new Error(`${chemin} n'est pas un PNG`);
  return { largeur: buf.readUInt32BE(16), hauteur: buf.readUInt32BE(20) };
}

describe("[PWA-ANDROID] le manifeste du hub", () => {
  it("fixe son `id` — sinon un changement de `start_url` installe une SECONDE app", () => {
    expect(m.id).toBeTruthy();
  });

  it("demande `navigate-existing` — un lien réutilise la fenêtre ouverte", () => {
    expect(m.launch_handler?.client_mode).toBe("navigate-existing");
  });

  it("déclare une icône raster ≥ 192 px, et une maskable ≥ 512 DISTINCTE, MESURÉES dans les fichiers", () => {
    const chemin = (src: string) => join(RACINE, "public", src.replace(/^\//, ""));
    const any = icones.filter((i) => aPourRole(i, "any") && dimensionsPng(chemin(i.src)).largeur >= 192);
    expect(any.length, "aucune icône « any » de 192 px ou plus : Chrome refuse le WebAPK").toBeGreaterThan(0);

    const maskable = icones.find((i) => aPourRole(i, "maskable") && dimensionsPng(chemin(i.src)).largeur >= 512);
    expect(maskable, "aucune maskable de 512 px ou plus").toBeDefined();
    // Une icône non conçue pour le masque, réutilisée comme maskable, se fait rogner les bords
    // par l'icône adaptative d'Android : elle s'affiche, simplement coupée.
    expect(any.map((i) => i.src)).not.toContain(maskable!.src);
  });

  it("annonce des tailles que les fichiers ont VRAIMENT — Chrome croit le fichier, pas le champ", () => {
    expect(icones.length).toBeGreaterThan(0);
    for (const i of icones) {
      if (i.type !== "image/png") continue;
      const attendu = Number((i.sizes ?? "").split("x")[0]);
      const { largeur, hauteur } = dimensionsPng(join(RACINE, "public", i.src.replace(/^\//, "")));
      expect(largeur, `${i.src} : le manifeste annonce ${i.sizes}, le fichier fait ${largeur}x${hauteur}`).toBe(attendu);
      expect(hauteur).toBe(attendu);
    }
  });
});
