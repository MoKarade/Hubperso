// tests/liaHubMouvement.test.ts — LIA est UNE seule, identique dans toutes les apps (Marc, 23/10/2026) :
// le mouvement et la pastille d'humeur viennent de lia-ui, le hub n'en règle aucun.
// Verrou de source : ces options ne sont lues qu'au montage par lia-ui, un test de rendu ne les verrait pas.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "..", "components", "LiaBoot.tsx"), "utf8");
const paquet = readFileSync(join(__dirname, "..", "package.json"), "utf8");

describe("LiaBoot : réglages communs", () => {
  it("ne règle ni le mouvement réduit ni la pastille d'humeur (défauts du paquet)", () => {
    expect(source).not.toContain("quandMouvementReduit");
    expect(source).not.toContain("humeurVisible");
  });

  it("monte LIA au chargement du module par demarrerLia, jamais dans un effet ni par <Lia />", () => {
    // Marc, 23/10/2026 : « présente tout le temps, même si quelque chose charge, même si une page bug ».
    expect(source).toContain('from "@mokarade/lia-ui/boot"');
    expect(source).toMatch(/^const demarrage = demarrerLia\(/m);
    expect(source).not.toContain("@mokarade/lia-ui/react");
    expect(source).not.toMatch(/<Lia[\s/>]/);
    const effets = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[/g)].map((m) => m[1] ?? "");
    for (const corps of effets) expect(corps).not.toContain("demarrerLia");
  });

  it("partage son état avec MemoryAI par la route du hub (une seule LIA), jamais par un jeton côté client", () => {
    // Marc, 23/10/2026 : « une seule LIA, un seul état, hébergé dans MemoryAI » (Hubperso#433).
    expect(source).toContain('etatHttp("/api/lia/etat")');
    expect(source).not.toMatch(/HUB_TOKEN|x-hub-token/i);
  });

  it("le layout racine charge ce module, donc LIA existe aussi sur loading, error et not-found", () => {
    const layout = readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8");
    expect(layout).toContain('import { LiaBoot } from "@/components/LiaBoot"');
    // Aucune de ces pages ne la remonte ni ne la retire : elle vit dans le body, hors de React.
    for (const f of ["app/error.tsx", "app/not-found.tsx", "app/attention/loading.tsx"]) {
      const src = readFileSync(join(__dirname, "..", f), "utf8");
      expect(src).not.toMatch(/lia-ui|LiaBoot|<Lia[\s/>]/);
    }
  });

  it("utilise lia-ui v0.16.0 ou plus récent (demarrerLia, présence tout le temps)", () => {
    const m = /"@mokarade\/lia-ui": "github:MoKarade\/lia-ui#v(\d+)\.(\d+)\.(\d+)"/.exec(paquet);
    expect(m).not.toBeNull();
    const [major = 0, minor = 0] = (m ?? []).slice(1).map(Number);
    expect(major > 0 || minor >= 16).toBe(true);
  });

  it("utilise lia-ui v0.11.1 ou plus récent (mouvement complet par défaut, pastille d'humeur)", () => {
    const m = /"@mokarade\/lia-ui": "github:MoKarade\/lia-ui#v(\d+)\.(\d+)\.(\d+)"/.exec(paquet);
    expect(m).not.toBeNull();
    const [major = 0, minor = 0, patch = 0] = (m ?? []).slice(1).map(Number);
    expect(major > 0 || minor > 11 || (minor === 11 && patch >= 1)).toBe(true);
  });
});
