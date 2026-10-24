// tests/liaPauseClient.test.ts — ce que la page sait de la pause de LIA : échec fermé, jamais « pas en pause » par défaut.
//
// Le vrai contrôle est côté serveur (`tests/liaPause.test.ts`, `tests/liaAsk.test.ts`). Ici : le suivi qui nourrit l'option
// `pause` de lia-ui (synchrone, relue à chaque pas), et le câblage dans `components/LiaBoot.tsx`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  creerSuiviPause,
  INTERVALLE_PAUSE_MS,
  lirePauseServeur,
  lireReponsePause,
  VALIDITE_PAUSE_MS,
} from "../lib/liaPauseClient";

describe("lireReponsePause", () => {
  it("rend la pause lue sur un 200 conforme", () => {
    expect(lireReponsePause(200, { pause: true, modifieLe: "2026-10-24T03:00:00.000Z" })).toBe(true);
    expect(lireReponsePause(200, { pause: false, modifieLe: null })).toBe(false);
  });

  it("rend null (illisible) pour tout le reste, sans le réparer", () => {
    const illisibles: Array<[number, unknown]> = [
      [401, { error: "unauthorized" }],
      [403, { error: "forbidden" }],
      [503, { error: "unavailable" }],
      [429, null],
      [200, null],
      [200, []],
      [200, "pause"],
      [200, {}],
      [200, { pause: "false" }],
      [200, { pause: 0 }],
      [200, { pause: null }],
    ];
    for (const [statut, json] of illisibles) expect(lireReponsePause(statut, json), `${statut} ${JSON.stringify(json)}`).toBeNull();
  });
});

describe("creerSuiviPause", () => {
  function monter(lectures: Array<boolean | null | Error>) {
    let t = 1_000_000;
    const file = [...lectures];
    const suivi = creerSuiviPause(async () => {
      const v = file.shift();
      if (v instanceof Error) throw v;
      return v ?? null;
    }, () => t);
    return { suivi, avancer: (ms: number) => void (t += ms) };
  }

  it("avant toute lecture : en pause (on ne sait pas)", () => {
    expect(monter([]).suivi.enPause()).toBe(true);
  });

  it("une lecture « pas en pause » libère LIA ; une lecture « en pause » la retient", async () => {
    const { suivi } = monter([false, true]);
    await suivi.rafraichir();
    expect(suivi.enPause()).toBe(false);
    await suivi.rafraichir();
    expect(suivi.enPause()).toBe(true);
  });

  it("un raté passager garde la dernière lecture ; une panne qui dure fait taire LIA", async () => {
    const { suivi, avancer } = monter([false, null, new Error("réseau")]);
    await suivi.rafraichir();
    avancer(INTERVALLE_PAUSE_MS);
    await suivi.rafraichir(); // illisible : la lecture précédente reste crue
    expect(suivi.enPause()).toBe(false);
    avancer(INTERVALLE_PAUSE_MS);
    await suivi.rafraichir(); // lève : « illisible » aussi, jamais propagé
    expect(suivi.enPause()).toBe(false);
    avancer(VALIDITE_PAUSE_MS); // plus de lecture réussie depuis trop longtemps
    expect(suivi.enPause()).toBe(true);
  });

  it("une pause posée n'est jamais effacée par une lecture illisible", async () => {
    const { suivi } = monter([true, null]);
    await suivi.rafraichir();
    await suivi.rafraichir();
    expect(suivi.enPause()).toBe(true);
  });

  it("une nouvelle lecture réussie rend la main après une panne", async () => {
    const { suivi, avancer } = monter([false, true, false]);
    await suivi.rafraichir();
    avancer(VALIDITE_PAUSE_MS + 1);
    expect(suivi.enPause()).toBe(true);
    await suivi.rafraichir(); // en pause
    await suivi.rafraichir(); // levée
    expect(suivi.enPause()).toBe(false);
  });
});

describe("lirePauseServeur", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("appelle GET /api/lia/pause sans cache avec le cookie de session et rend la pause lue", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ pause: true, modifieLe: null }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await lirePauseServeur()).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/lia/pause", { cache: "no-store", credentials: "same-origin" });
  });

  it("une réponse refusée ou illisible vaut « illisible »", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("pas du json", { status: 200 })));
    expect(await lirePauseServeur()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })));
    expect(await lirePauseServeur()).toBeNull();
  });
});

describe("câblage dans LiaBoot", () => {
  const src = readFileSync(resolve(process.cwd(), "components/LiaBoot.tsx"), "utf8");

  it("passe l'option pause de lia-ui au suivi, et le relit dans le navigateur seulement", () => {
    expect(src).toMatch(/creerSuiviPause\(lirePauseServeur, Date\.now\)/);
    expect(src).toMatch(/pause: \(\) => suiviPause\.enPause\(\)/);
    // Les minuteurs ne partent que dans le navigateur : le module est aussi évalué au rendu serveur.
    const bloc = src.slice(src.indexOf('if (typeof window !== "undefined")'));
    expect(bloc).toMatch(/suiviPause\.rafraichir\(\)/);
    expect(bloc).toMatch(/setInterval/);
    expect(src.slice(0, src.indexOf('if (typeof window !== "undefined")'))).not.toMatch(/setInterval/);
  });
});
