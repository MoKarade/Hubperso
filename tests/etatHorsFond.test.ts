// tests/etatHorsFond.test.ts — l'état partagé de LIA ne se relit pas dans un onglet caché (coût Vercel, 26/10/2026).

import { describe, expect, it, vi } from "vitest";
import type { EtatHote } from "@mokarade/lia-ui";
import { etatSansLectureCachee } from "../lib/etatHorsFond";

function monter(lectures: unknown[], ecriture: unknown = null) {
  const lire = vi.fn(async () => lectures.shift());
  const ecrire = vi.fn(async () => ecriture);
  const base: EtatHote = { lire, ecrire };
  let cache = false;
  return {
    etat: etatSansLectureCachee(base, () => cache),
    lire,
    ecrire,
    cacher: (v: boolean) => {
      cache = v;
    },
  };
}

describe("etatSansLectureCachee", () => {
  it("onglet visible : chaque lecture va au réseau", async () => {
    const { etat, lire } = monter([{ v: 1 }, { v: 2 }]);
    expect(await etat.lire()).toEqual({ v: 1 });
    expect(await etat.lire()).toEqual({ v: 2 });
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it("onglet caché : rend la dernière lecture, sans réseau", async () => {
    const { etat, lire, cacher } = monter([{ v: 1 }, { v: 2 }]);
    await etat.lire();
    cacher(true);
    expect(await etat.lire()).toEqual({ v: 1 });
    expect(await etat.lire()).toEqual({ v: 1 });
    expect(lire).toHaveBeenCalledTimes(1);
    cacher(false); // retour sur l'onglet : on relit pour de vrai
    expect(await etat.lire()).toEqual({ v: 2 });
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it("onglet ouvert caché sans lecture gardée : lit une fois pour de vrai, jamais d'état inventé", async () => {
    const { etat, lire, cacher } = monter([null, { v: 9 }]);
    cacher(true);
    expect(await etat.lire()).toBeNull(); // « aucun état » est une lecture comme une autre
    expect(await etat.lire()).toBeNull(); // gardée
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it("une lecture qui échoue n'est pas gardée et remonte à lia-ui (qui garde son état local)", async () => {
    const lire = vi.fn(async () => {
      throw new Error("réseau");
    });
    const etat = etatSansLectureCachee({ lire, ecrire: async () => null }, () => true);
    await expect(etat.lire()).rejects.toThrow("réseau");
    await expect(etat.lire()).rejects.toThrow("réseau"); // rien de gardé : on retente
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it("l'écriture passe toujours, et l'état plus récent gardé par le serveur devient la dernière lecture", async () => {
    const { etat, ecrire, cacher } = monter([{ v: 1 }], { v: 5 });
    await etat.lire();
    expect(await etat.ecrire({} as never)).toEqual({ v: 5 });
    expect(ecrire).toHaveBeenCalledTimes(1);
    cacher(true);
    expect(await etat.lire()).toEqual({ v: 5 });
  });

  it("une écriture sans état rendu ne touche pas la lecture gardée", async () => {
    const { etat, cacher } = monter([{ v: 1 }], null);
    await etat.lire();
    await etat.ecrire({} as never);
    cacher(true);
    expect(await etat.lire()).toEqual({ v: 1 });
  });
});
