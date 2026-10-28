// tests/liaGraphes.test.ts — ce que LIA reçoit d'une carte de /graphes (Hubperso#730). NO FAKE DATA : chaque phrase
// vient de l'état réel du dépôt, et le dessin 3D (illisible depuis la page) est dit illisible, jamais décrit.

import { describe, expect, it } from "vitest";
import { faitsCarteGraphe } from "@/lib/liaGraphes";
import type { EtatGraphe } from "@/lib/graphes";

const MAINTENANT = Date.UTC(2026, 9, 28, 20, 0);
const il_y_a_3_h = new Date(MAINTENANT - 3 * 3_600_000).toISOString();
const dessin = "ses nœuds et ses liens ne sont ni lus ni devinés";

describe("faitsCarteGraphe", () => {
  it("graphe prêt : dépôt, commit court et âge, plus l'aveu que le dessin n'est pas lisible", () => {
    const etat: EtatGraphe = { etat: "ok", artefactId: 9, sha: "0123456789abcdef", creeLe: il_y_a_3_h, octets: 4096 };
    const f = faitsCarteGraphe("MoKarade/MemoryAI", etat, MAINTENANT);
    expect(f).toContain("dépôt MoKarade/MemoryAI");
    expect(f).toContain("prêt, commit 0123456");
    expect(f).not.toContain("0123456789");
    expect(f).toContain("publié il y a 3 h");
    expect(f).toContain(dessin);
  });

  it("jamais de compte de nœuds ou de liens inventé", () => {
    const etat: EtatGraphe = { etat: "ok", artefactId: 9, sha: "abcdef0123", creeLe: il_y_a_3_h, octets: 1 };
    expect(faitsCarteGraphe("MoKarade/CarAI", etat, MAINTENANT)).not.toMatch(/\d+ (nœuds|liens|arêtes)/);
  });

  it("aucun graphe, expiré, non branché : la raison honnête, sans sha ni âge présumé", () => {
    const aucun = faitsCarteGraphe("MoKarade/JobAI", { etat: "aucun" }, MAINTENANT);
    expect(aucun).toContain("pas encore de graphe publié");
    expect(aucun).not.toContain("commit");

    const expire = faitsCarteGraphe("MoKarade/JobAI", { etat: "expire", creeLe: il_y_a_3_h }, MAINTENANT);
    expect(expire).toContain("a expiré (publié il y a 3 h)");

    const non = faitsCarteGraphe("MoKarade/JobAI", { etat: "non-branche" }, MAINTENANT);
    expect(non).toContain("non branché");
    expect(non).not.toContain("commit");
  });

  it("erreur : le détail vient de GitHub, il est borné et reste une donnée", () => {
    const court = faitsCarteGraphe("MoKarade/DriveAI", { etat: "erreur", detail: "HTTP 403\nrate limit" }, MAINTENANT);
    expect(court).toContain("lecture impossible (HTTP 403 rate limit)");

    const long = faitsCarteGraphe("MoKarade/DriveAI", { etat: "erreur", detail: "x".repeat(2000) }, MAINTENANT);
    expect(long.length).toBeLessThan(600);
    expect(long).toContain("…");
  });

  it("chaque état tient sous la borne des faits d'un élément (1 200 caractères)", () => {
    const etats: EtatGraphe[] = [
      { etat: "non-branche" },
      { etat: "aucun" },
      { etat: "expire", creeLe: il_y_a_3_h },
      { etat: "erreur", detail: "y".repeat(5000) },
      { etat: "ok", artefactId: 1, sha: "f".repeat(40), creeLe: il_y_a_3_h, octets: 1 },
    ];
    for (const e of etats) expect(faitsCarteGraphe("MoKarade/FinanceAI", e, MAINTENANT).length, e.etat).toBeLessThan(1200);
  });
});
