// tests/zip.test.ts — le lecteur d'archive des artefacts GitHub.
// L'archive vient d'un dépôt : on prouve qu'elle se lit, et qu'une archive piégée est REFUSÉE.

import { describe, expect, it } from "vitest";
import { lireZip } from "../lib/zip";
import { fabriquerZip } from "./zipFabrique";

describe("lireZip", () => {
  it("lit des fichiers comprimés et stockés, et rend leur contenu exact", () => {
    const zip = fabriquerZip([
      { nom: "meta.json", contenu: '{"a":1}' },
      { nom: "graph.html", contenu: "<html>é</html>".repeat(50) },
      { nom: "brut.txt", contenu: "tel quel", methode: 0 },
    ]);
    const f = lireZip(zip);
    expect([...f.keys()]).toEqual(["meta.json", "graph.html", "brut.txt"]);
    expect(f.get("meta.json")!.toString()).toBe('{"a":1}');
    expect(f.get("graph.html")!.toString()).toBe("<html>é</html>".repeat(50));
    expect(f.get("brut.txt")!.toString()).toBe("tel quel");
  });

  it("refuse ce qui n'est pas une archive", () => {
    expect(() => lireZip(Buffer.from("pas un zip du tout, mais assez long pour être lu"))).toThrow(
      /invalide/,
    );
    expect(() => lireZip(Buffer.alloc(0))).toThrow(/invalide/);
  });

  it("refuse une archive tronquée plutôt que d'en lire la moitié", () => {
    const zip = fabriquerZip([{ nom: "a.txt", contenu: "x".repeat(500), methode: 0 }]);
    // On coupe les données mais on garde la fin du répertoire central.
    const fin = zip.subarray(zip.length - 22 - 46 - 5);
    expect(() => lireZip(Buffer.concat([zip.subarray(0, 40), fin]))).toThrow();
  });

  it("refuse une bombe : trop d'octets décompressés au total", () => {
    const zip = fabriquerZip([{ nom: "g.html", contenu: "a".repeat(100_000) }]);
    expect(zip.length).toBeLessThan(1_000); // 100 Ko tiennent dans moins de 1 Ko comprimés
    expect(() => lireZip(zip, 50_000)).toThrow(/plus de 50000 octets/);
    expect(lireZip(zip, 200_000).get("g.html")!.length).toBe(100_000);
  });

  it("refuse une archive qui annonce une taille plus petite que la réalité", () => {
    const zip = fabriquerZip([{ nom: "g.html", contenu: "b".repeat(5_000) }]);
    // Le répertoire central ment : 10 octets annoncés. inflate dépasserait ce plafond → refus.
    const centre = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(10, centre + 24);
    expect(() => lireZip(zip)).toThrow();
  });

  it("refuse plus de 20 fichiers", () => {
    const zip = fabriquerZip(
      Array.from({ length: 21 }, (_, i) => ({ nom: `f${i}.txt`, contenu: "x" })),
    );
    expect(() => lireZip(zip)).toThrow(/21 fichiers/);
  });

  it("refuse une méthode de compression qu'il ne gère pas", () => {
    const zip = fabriquerZip([{ nom: "a.txt", contenu: "x", methode: 0 }]);
    const centre = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt16LE(12, centre + 10); // bzip2
    expect(() => lireZip(zip)).toThrow(/méthode de compression 12/);
  });
});
