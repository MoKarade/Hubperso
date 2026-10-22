// tests/gantt.test.ts — le corps que le PC envoie au hub (lib/gantt.ts) : valide, ou refusé avec
// une raison. Un envoi à moitié n'existe pas : il remplacerait le dernier relevé entier.

import { describe, expect, it } from "vitest";
import { estPerime, PEREMPTION_MS, validerEnvoi, VERSION_ENVOI } from "../lib/gantt";

const valide = () => ({
  v: VERSION_ENVOI,
  envoye: "2026-10-22T20:50:00Z",
  donnees_gz_b64: "H4sIAAAAAAAAA6tWKkktLlGyUlAqS8wpTVWqBQAbuQNdFgAAAA==",
  etat: { ecrit: true },
  fiabilite: { score: 0.98 },
  prochaines: { financeai: [] },
  quota: { restant: 12 },
});

describe("validerEnvoi", () => {
  it("accepte un envoi complet et le rend tel quel (le gzip n'est jamais décodé ici)", () => {
    const r = validerEnvoi(valide());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.envoi.donnees_gz_b64).toBe(valide().donnees_gz_b64);
      expect(r.envoi.etat).toEqual({ ecrit: true });
    }
  });

  it("refuse une autre version : un corps qu'on ne connaît pas n'est pas deviné", () => {
    const r = validerEnvoi({ ...valide(), v: 2 });
    expect(r.ok).toBe(false);
  });

  it.each(["etat", "fiabilite", "prochaines", "quota", "envoye", "donnees_gz_b64"])(
    "refuse un envoi sans %s, en le nommant",
    (champ) => {
      const corps: Record<string, unknown> = valide();
      delete corps[champ];
      const r = validerEnvoi(corps);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.raison).toContain(champ);
    },
  );

  it("refuse un gzip qui n'en est pas un, et du base64 qui n'en est pas", () => {
    expect(validerEnvoi({ ...valide(), donnees_gz_b64: "bonjour" }).ok).toBe(false);
    expect(validerEnvoi({ ...valide(), donnees_gz_b64: "H4sI<script>" }).ok).toBe(false);
  });

  it("refuse une date d'envoi illisible, et ce qui n'est pas un objet", () => {
    expect(validerEnvoi({ ...valide(), envoye: "hier" }).ok).toBe(false);
    expect(validerEnvoi({ ...valide(), etat: [] }).ok).toBe(false);
    expect(validerEnvoi(null).ok).toBe(false);
    expect(validerEnvoi("texte").ok).toBe(false);
  });
});

describe("estPerime", () => {
  const maintenant = Date.parse("2026-10-22T21:00:00Z");

  it("jusqu'à 30 minutes la donnée est présentée comme à jour, au-delà elle est dite périmée", () => {
    expect(estPerime(maintenant - PEREMPTION_MS, maintenant)).toBe(false);
    expect(estPerime(maintenant - PEREMPTION_MS - 1, maintenant)).toBe(true);
  });
});
