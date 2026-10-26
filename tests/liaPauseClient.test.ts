// tests/liaPauseClient.test.ts — ce que la page sait de la pause de LIA : échec fermé, jamais « pas en pause » par défaut.
//
// Le vrai contrôle est côté serveur (`tests/liaPause.test.ts`, `tests/liaAsk.test.ts`). Ici : le suivi qui nourrit l'option
// `pause` de lia-ui (synchrone, relue à chaque pas), et le câblage dans `components/LiaBoot.tsx`.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  creerSuiviPause,
  ecrirePauseServeur,
  INTERVALLE_PAUSE_MS,
  lirePauseServeur,
  lireReponsePause,
  PLAFOND_SPONTANEES_PAR_JOUR,
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

describe("basculer (le geste de Marc, lia-ui v0.32.0)", () => {
  function monter(ecriture: (voulue: boolean) => Promise<boolean | null>, lectures: Array<boolean | null> = []) {
    const t = 1_000_000;
    const file = [...lectures];
    const suivi = creerSuiviPause(async () => file.shift() ?? null, () => t, ecriture);
    return suivi;
  }

  it("un PUT confirmé se résout, et enPause rend alors la valeur voulue (dans les deux sens)", async () => {
    const suivi = monter(async (v) => v, [false]);
    await suivi.rafraichir();
    expect(suivi.enPause()).toBe(false);
    await suivi.basculer(true);
    expect(suivi.enPause()).toBe(true);
    await suivi.basculer(false);
    expect(suivi.enPause()).toBe(false);
  });

  it("peut ramener LIA même avant toute lecture (la confirmation du serveur suffit)", async () => {
    const suivi = monter(async (v) => v);
    expect(suivi.enPause()).toBe(true);
    await suivi.basculer(false);
    expect(suivi.enPause()).toBe(false);
  });

  it("un refus ou une réponse illisible REJETTE et laisse l'état : jamais « en pause levée » sur un échec", async () => {
    const suivi = monter(async () => null, [true]);
    await suivi.rafraichir();
    await expect(suivi.basculer(false)).rejects.toThrow();
    expect(suivi.enPause()).toBe(true);
  });

  it("un réseau qui lève REJETTE aussi, sans changer l'état", async () => {
    const suivi = monter(async () => {
      throw new Error("réseau");
    }, [false]);
    await suivi.rafraichir();
    await expect(suivi.basculer(true)).rejects.toThrow("réseau");
    expect(suivi.enPause()).toBe(false);
  });

  it("une valeur confirmée différente de la demande REJETTE et ne change rien", async () => {
    const suivi = monter(async (v) => !v, [true]);
    await suivi.rafraichir();
    await expect(suivi.basculer(false)).rejects.toThrow();
    expect(suivi.enPause()).toBe(true);
  });

  it("une relecture lancée avant le geste n'écrase pas la pause confirmée en rentrant après lui", async () => {
    let rendre: (v: boolean | null) => void = () => {};
    const lecture = new Promise<boolean | null>((ok) => (rendre = ok));
    const suivi = creerSuiviPause(() => lecture, () => 1_000_000, async (v) => v);
    const enVol = suivi.rafraichir(); // part avec l'ancien état du serveur…
    await suivi.basculer(true); // …Marc met LIA en pause entre-temps…
    rendre(false); // …et la vieille lecture rentre « pas en pause ».
    await enVol;
    expect(suivi.enPause()).toBe(true);
  });
});

describe("ecrirePauseServeur", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envoie PUT /api/lia/pause avec { pause } et le cookie de session, et rend la pause confirmée", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ pause: true, modifieLe: "2026-10-24T04:30:00.000Z" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await ecrirePauseServeur(true)).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/lia/pause", {
      method: "PUT",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: '{"pause":true}',
    });
  });

  it("401, 403, 503, 413 et un corps hors contrat valent « refusée » (null)", async () => {
    for (const status of [401, 403, 503, 413]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status })));
      expect(await ecrirePauseServeur(false), String(status)).toBeNull();
    }
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ pause: "oui" }), { status: 200 })));
    expect(await ecrirePauseServeur(false)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("pas du json", { status: 200 })));
    expect(await ecrirePauseServeur(false)).toBeNull();
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

describe("plafond de paroles spontanées", () => {
  it("vaut 120 par jour (proposition du fil Assistant, 24/10/2026) : un garde-fou, pas un rythme", () => {
    expect(PLAFOND_SPONTANEES_PAR_JOUR).toBe(120);
  });
});

describe("coût Vercel (26/10/2026)", () => {
  it("la pause se relit toutes les 60 s ; la validité reste trois relectures (échec fermé inchangé)", () => {
    expect(INTERVALLE_PAUSE_MS).toBe(60_000);
    expect(VALIDITE_PAUSE_MS).toBe(3 * INTERVALLE_PAUSE_MS);
  });
});

describe("câblage dans LiaBoot", () => {
  const src = readFileSync(resolve(process.cwd(), "components/LiaBoot.tsx"), "utf8");

  it("passe l'option pause de lia-ui au suivi, et le relit dans le navigateur seulement", () => {
        expect(src).toMatch(/pause: \(\) => suiviPause\.enPause\(\)/);
    // v0.32.0 : le geste du menu passe par le serveur, jamais par un état local de la page.
    expect(src).toMatch(/creerSuiviPause\(lirePauseServeur, Date\.now, ecrirePauseServeur\)/);
    expect(src).toMatch(/basculerPause: \(enPause: boolean\) => suiviPause\.basculer\(enPause\)/);
    expect(src).toMatch(/plafondSpontaneesParJour: PLAFOND_SPONTANEES_PAR_JOUR/);
    // Les minuteurs ne partent que dans le navigateur : le module est aussi évalué au rendu serveur.
    const bloc = src.slice(src.indexOf('if (typeof window !== "undefined")'));
    expect(bloc).toMatch(/suiviPause\.rafraichir\(\)/);
    expect(bloc).toMatch(/setInterval/);
    expect(src.slice(0, src.indexOf('if (typeof window !== "undefined")'))).not.toMatch(/setInterval/);
  });

  it("onglet caché : ni relecture de la pause ni relecture de l'état partagé (coût Vercel)", () => {
    // Le minuteur de la pause ne relit que si l'onglet est visible.
    expect(src).toMatch(/setInterval\(\(\) => \{\s*if \(document\.visibilityState === "visible"\) void suiviPause\.rafraichir\(\);\s*\}, INTERVALLE_PAUSE_MS\)/);
    // L'état partagé passe par l'adaptateur, jamais par `etatHttp` nu.
    expect(src).toMatch(/etatSansLectureCachee\(etatHttp\("\/api\/lia\/etat"\)/);
  });
});
