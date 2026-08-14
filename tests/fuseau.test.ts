// L'heure affichée par le hub est celle du Québec, pas celle du serveur.
//
// Ces tests tournent en UTC en CI comme sur Vercel : si `formatDateTime` oubliait
// `timeZone`, ils échoueraient — c'est précisément ce qu'on veut qu'ils attrapent.

import { describe, expect, it } from "vitest";
import { formatDateTime } from "../lib/format";
import { FUSEAU } from "../lib/fuseau";

/**
 * Extrait l'heure du libellé, normalisée en « HH:MM ».
 *
 * Le fr-CA écrit « 22 h 30 » et non « 22:30 » — on teste la CONVERSION, pas la
 * typographie, donc on accepte les deux séparateurs plutôt que de figer un format
 * qu'ICU peut légitimement faire évoluer.
 */
function heure(libelle: string): string {
  const m = libelle.match(/(\d{2})\s*[h:]\s*(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : libelle;
}

describe("formatDateTime — heure du Québec", () => {
  it("décale de 4 h en heure avancée (été)", () => {
    // 15:20 UTC en août = 11:20 à Québec (UTC−4).
    expect(heure(formatDateTime("2026-08-13T15:20:00Z"))).toBe("11:20");
  });

  it("décale de 5 h en heure normale (hiver)", () => {
    // 15:20 UTC en janvier = 10:20 à Québec (UTC−5). C'est CE test qui prouve qu'on
    // utilise une vraie zone IANA et non un décalage écrit en dur : un « −4 » figé
    // donnerait 11:20 ici, et serait faux la moitié de l'année.
    expect(heure(formatDateTime("2026-01-13T15:20:00Z"))).toBe("10:20");
  });

  it("change aussi le JOUR quand la conversion traverse minuit", () => {
    // 02:30 UTC le 14 août = 22:30 le 13 à Québec. Sans fuseau, le hub annoncerait
    // des données « du 14 » alors qu'elles datent de la veille au soir.
    const libelle = formatDateTime("2026-08-14T02:30:00Z");
    expect(heure(libelle)).toBe("22:30");
    expect(libelle).toContain("13");
  });

  it("rend l'entrée telle quelle si elle n'est pas une date", () => {
    expect(formatDateTime("pas une date")).toBe("pas une date");
  });

  it("utilise l'identifiant IANA canonique", () => {
    // `America/Montreal` est un alias déprécié ; `America/Toronto` est la zone
    // canonique de l'Est canadien, garantie présente dans toutes les ICU.
    expect(FUSEAU).toBe("America/Toronto");
  });
});
