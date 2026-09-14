// tests/cronAuth.test.ts — qui a le droit de déclencher l'horloge. PUR, sans node:crypto.

import { describe, expect, it, vi } from "vitest";
import { decideCron } from "@/lib/cronAuth";

/** Comparaison de référence pour les cas où le verdict ne dépend pas d'elle. */
const egal = (a: string, b: string) => a === b;

describe("decideCron — les trois verdicts", () => {
  it("accepte un Bearer qui correspond", () => {
    expect(decideCron("Bearer s3cr3t", "s3cr3t", egal)).toEqual({ type: "ok" });
  });

  it("refuse un Bearer qui ne correspond pas", () => {
    expect(decideCron("Bearer faux", "s3cr3t", egal)).toEqual({ type: "refuse" });
  });

  it("répond « non configuré » quand le serveur n'a PAS de secret, jamais « refusé »", () => {
    // La distinction est tout le diagnostic. 401 dit « ton secret est faux » et envoie
    // vérifier le dépôt GitHub ; « non configuré » (503) dit « je n'ai pas de secret » et
    // envoie sur Vercel. Les confondre fait chercher au mauvais endroit — et surtout, une
    // variable oubliée passerait pour un secret erroné, donc pour un problème d'appelant.
    for (const absent of [undefined, "", "   "]) {
      expect(decideCron("Bearer s3cr3t", absent, egal)).toEqual({ type: "non-configure" });
    }
  });

  it("« non configuré » PRIME, même quand la requête n'apporte aucun secret", () => {
    // Discriminant : si l'ordre des contrôles était inversé, une horloge sans secret côté
    // serveur et sans secret côté appelant répondrait 401 — c'est-à-dire accuserait
    // l'appelant d'une faute qui est une configuration manquante.
    expect(decideCron(null, undefined, egal)).toEqual({ type: "non-configure" });
  });
});

describe("decideCron — l'en-tête Authorization", () => {
  it("refuse un en-tête absent, vide ou sans schéma", () => {
    for (const entete of [null, undefined, "", "   ", "s3cr3t"]) {
      expect(decideCron(entete, "s3cr3t", egal)).toEqual({ type: "refuse" });
    }
  });

  it("refuse un autre schéma que Bearer", () => {
    expect(decideCron("Basic s3cr3t", "s3cr3t", egal)).toEqual({ type: "refuse" });
    expect(decideCron("Token s3cr3t", "s3cr3t", egal)).toEqual({ type: "refuse" });
  });

  it("refuse un Bearer sans valeur", () => {
    expect(decideCron("Bearer", "s3cr3t", egal)).toEqual({ type: "refuse" });
    expect(decideCron("Bearer    ", "s3cr3t", egal)).toEqual({ type: "refuse" });
  });

  it("accepte le schéma dans n'importe quelle casse — la RFC 7235 le veut ainsi", () => {
    // Un client qui écrit `bearer` n'est pas un intrus, et le refuser produirait un 401
    // parfaitement opaque à déboguer.
    for (const schema of ["Bearer", "bearer", "BEARER", "BeArEr"]) {
      expect(decideCron(`${schema} s3cr3t`, "s3cr3t", egal)).toEqual({ type: "ok" });
    }
  });

  it("tolère les espaces autour de l'en-tête et du secret attendu", () => {
    expect(decideCron("  Bearer s3cr3t  ", " s3cr3t ", egal)).toEqual({ type: "ok" });
  });
});

describe("decideCron — la comparaison est DÉLÉGUÉE, et vraiment appelée", () => {
  it("passe le secret fourni et le secret attendu à la fonction injectée", () => {
    // Ce qui compte en production : que ce soit `memeJeton` (temps constant) qui tranche,
    // et non un `===` réintroduit ici. Le test vérifie l'appel, faute de pouvoir observer
    // le temps d'exécution.
    const comparer = vi.fn(() => true);
    decideCron("Bearer envoye", "attendu", comparer);
    expect(comparer).toHaveBeenCalledWith("envoye", "attendu");
  });

  it("ne consulte PAS la comparaison quand il n'y a rien à comparer", () => {
    // Appeler une comparaison à temps constant avec une valeur absente n'apporte rien et
    // brouillerait le verdict : les deux refus précoces doivent court-circuiter.
    const comparer = vi.fn(() => true);
    decideCron(null, "attendu", comparer);
    decideCron("Bearer x", undefined, comparer);
    expect(comparer).not.toHaveBeenCalled();
  });
});
