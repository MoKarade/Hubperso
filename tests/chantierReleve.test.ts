// tests/chantierReleve.test.ts — l'ETag du relevé du Gantt et le contrôle du gzip (lib/chantierReleve.ts).

import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { etagCorrespond, etagDuReleve, octetsGzip } from "@/lib/chantierReleve";

const RECU = new Date("2026-10-26T21:00:03.123Z");

describe("etagDuReleve", () => {
  it("est l'instant de réception, entre guillemets", () => {
    expect(etagDuReleve(RECU)).toBe(`"${RECU.getTime()}"`);
  });
  it("change quand un nouveau relevé est reçu", () => {
    expect(etagDuReleve(new Date(RECU.getTime() + 1))).not.toBe(etagDuReleve(RECU));
  });
});

describe("etagCorrespond", () => {
  const etag = etagDuReleve(RECU);
  it("reconnaît le même ETag", () => expect(etagCorrespond(etag, etag)).toBe(true));
  it("accepte le préfixe faible, une liste et *", () => {
    expect(etagCorrespond(`W/${etag}`, etag)).toBe(true);
    expect(etagCorrespond(`"1", ${etag}`, etag)).toBe(true);
    expect(etagCorrespond("*", etag)).toBe(true);
  });
  it("refuse un autre ETag, une valeur vide ou absente", () => {
    expect(etagCorrespond(`"${RECU.getTime() - 1}"`, etag)).toBe(false);
    expect(etagCorrespond("", etag)).toBe(false);
    expect(etagCorrespond(null, etag)).toBe(false);
  });
});

describe("octetsGzip", () => {
  it("rend les octets d'un vrai gzip, qui se relit", () => {
    const b64 = gzipSync(Buffer.from(JSON.stringify({ asof: "2026-10-26T21:00:00Z" }))).toString("base64");
    expect(octetsGzip(b64)?.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
  });
  it("refuse ce qui n'est pas un gzip, jamais un contenu deviné", () => {
    expect(octetsGzip(Buffer.from("pas du gzip du tout, pas du tout").toString("base64"))).toBeNull();
    expect(octetsGzip("")).toBeNull();
    expect(octetsGzip("H4sI")).toBeNull();
  });
});
