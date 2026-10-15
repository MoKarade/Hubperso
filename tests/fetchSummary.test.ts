import { describe, it, expect, beforeEach } from "vitest";
import { HUB_TOKEN_HEADER } from "@mokarade/hub-contract";
import {
  fetchSummary,
  fetchAllSummaries,
  __resetSummaryCache,
} from "../lib/fetchSummary";
import type { HubSource } from "../lib/sources";
import { validSummary, jsonFetch } from "./helpers";

function source(over: Partial<HubSource> = {}): HubSource {
  return {
    id: "financeai",
    name: "FinanceAI",
    summaryUrl: "https://x.test/hub/summary",
    accueilUrl: "https://x.test",
    token: "jeton",
    hero: false,
    ...over,
  };
}

// Le cache de résilience est un état de module : on l'isole entre chaque cas.
beforeEach(() => __resetSummaryCache());

const okFetch = () => jsonFetch(200, validSummary());
const timeoutFetch = (async () => {
  throw new DOMException("aborted", "TimeoutError");
}) as unknown as typeof fetch;

/** Un fetch qui NOTE qu'on l'a appelé — « aucune requête émise » ne se prouve pas autrement. */
function fetchEspion(): { fetch: typeof fetch; appele: () => boolean } {
  let appele = false;
  const impl = (async () => {
    appele = true;
    return new Response("{}");
  }) as unknown as typeof fetch;
  return { fetch: impl, appele: () => appele };
}

describe("fetchSummary", () => {
  it("unconfigured si aucun jeton (aucune requête émise)", async () => {
    const espion = fetchEspion();
    const res = await fetchSummary(source({ token: null }), espion.fetch);
    expect(res.state).toBe("unconfigured");
    if (res.state === "unconfigured") expect(res.manque).toEqual(["jeton"]);
    expect(espion.appele()).toBe(false);
  });

  // ── Une source SANS URL n'est pas interrogée, et le dit ─────────────────────────────
  //
  // POURQUOI (21/09/2026) : FinanceAI n'a plus d'URL de résumé par défaut — son résumé vient
  // d'un serveur auto-hébergé, pas de son site. Tant que `FINANCEAI_SUMMARY_URL` n'est pas
  // posée, `summaryUrl` vaut `null` : le hub ne doit alors NI partir sur le réseau, NI
  // afficher « aucun jeton configuré », qui enverrait poser la mauvaise variable.
  it("unconfigured si aucune URL (aucune requête émise), et la CAUSE est nommée", async () => {
    const espion = fetchEspion();
    const res = await fetchSummary(source({ summaryUrl: null }), espion.fetch);
    expect(res.state).toBe("unconfigured");
    // ⚠️ L'assertion qui compte est CELLE-CI : sans elle, une cause fusionnée avec
    // « jeton » passerait, et c'est exactement le défaut qu'on corrige.
    if (res.state === "unconfigured") expect(res.manque).toEqual(["url"]);
    expect(espion.appele()).toBe(false);
  });

  it("dit les DEUX manques d'un coup plutôt qu'en cascade", async () => {
    // Sinon la seconde cause n'apparaît qu'une fois la première réparée : on corrige le
    // jeton, on relance, et on découvre l'URL (leçon n° 8 du CLAUDE.md).
    const res = await fetchSummary(
      source({ summaryUrl: null, token: null }),
      okFetch(),
    );
    expect(res.state).toBe("unconfigured");
    if (res.state === "unconfigured")
      expect(res.manque).toEqual(["url", "jeton"]);
  });

  it("CONTRÔLE NÉGATIF : avec URL et jeton, la requête PART", async () => {
    // Sans ce cas, « aucune requête émise » serait aussi vrai d'un fetch débranché.
    let urlVue: string | undefined;
    const spy = (async (url: string) => {
      urlVue = url;
      return new Response(JSON.stringify(validSummary()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const res = await fetchSummary(source(), spy);
    expect(res.state).toBe("ok");
    expect(urlVue).toBe("https://x.test/hub/summary");
  });

  it("ok + envoie x-hub-token et cache no-store", async () => {
    let init: RequestInit | undefined;
    const spy = (async (_url: string, opts: RequestInit) => {
      init = opts;
      return new Response(JSON.stringify(validSummary()), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await fetchSummary(source({ token: "secret" }), spy);
    expect(res.state).toBe("ok");
    const headers = init?.headers as Record<string, string>;
    expect(headers[HUB_TOKEN_HEADER]).toBe("secret");
    expect(init?.cache).toBe("no-store");
  });

  it("unauthorized sur 401", async () => {
    const res = await fetchSummary(source(), jsonFetch(401, { error: "nope" }));
    expect(res.state).toBe("unauthorized");
  });

  it("unreachable sur 5xx", async () => {
    const res = await fetchSummary(source(), jsonFetch(500, { error: "boom" }));
    expect(res).toMatchObject({
      state: "unreachable",
      detail: "l’app a répondu avec une erreur",
    });
  });

  it("unreachable si le fetch jette (réseau coupé)", async () => {
    const spy = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = await fetchSummary(source(), spy);
    expect(res).toMatchObject({ state: "unreachable" });
    if (res.state === "unreachable")
      expect(res.detail).toBe("l’app ne répond pas");
  });

  it("unreachable avec détail « délai dépassé » sur TimeoutError", async () => {
    const spy = (async () => {
      throw new DOMException("aborted", "TimeoutError");
    }) as unknown as typeof fetch;
    const res = await fetchSummary(source(), spy);
    expect(res.state).toBe("unreachable");
    if (res.state === "unreachable")
      expect(res.detail).toContain("délai dépassé");
  });

  it("invalid si le JSON ne respecte pas le contrat", async () => {
    // ⚠️ L'échantillon était `{ contractVersion: 99 }`, qui depuis le 2026-08-20 est
    // diagnostiqué « contrat trop récent » — un état DIFFÉRENT, et voulu. Il faut donc un
    // payload structurellement faux, pas seulement mal versionné : c'est ce cas-ci qui doit
    // rester `invalid`.
    const res = await fetchSummary(
      source(),
      jsonFetch(200, { contractVersion: 1, app: { id: "MAJUSCULES" } }),
    );
    expect(res.state).toBe("invalid");
  });

  it("invalid si la réponse n'est pas du JSON", async () => {
    const spy = (async () =>
      new Response("<html>pas du json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const res = await fetchSummary(source(), spy);
    expect(res).toMatchObject({
      state: "invalid",
      detail: "l’app a renvoyé une réponse illisible",
    });
  });

  it("préserve la source dans le résultat", async () => {
    const s = source({ id: "driveai", name: "DriveAI" });
    const res = await fetchSummary(s, jsonFetch(401, {}));
    expect(res.source.id).toBe("driveai");
  });
});

describe("fetchSummary — résilience (dernier bon résumé)", () => {
  it("accroc réseau APRÈS un succès récent → sert le cache marqué stale (jamais « injoignable »)", async () => {
    let t = 1_000_000;
    const now = () => t;
    const s = source({ id: "driveai" });

    const ok = await fetchSummary(s, okFetch(), now); // peuple le cache à t
    expect(ok.state).toBe("ok");

    t += 5 * 60_000; // 5 min plus tard, l'app dépasse le budget
    const res = await fetchSummary(s, timeoutFetch, now);
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.stale).toBe(true);
      expect(res.cachedAgeMs).toBe(5 * 60_000);
    }
  });

  it("accroc réseau SANS succès préalable → « injoignable » honnête (rien à resservir)", async () => {
    const res = await fetchSummary(source({ id: "driveai" }), timeoutFetch);
    expect(res.state).toBe("unreachable");
  });

  it("cache TROP vieux (> 30 min) → « injoignable » honnête plutôt qu'une donnée périmée masquée", async () => {
    let t = 1_000_000;
    const now = () => t;
    const s = source({ id: "driveai" });
    await fetchSummary(s, okFetch(), now);

    t += 31 * 60_000;
    const res = await fetchSummary(s, timeoutFetch, now);
    expect(res.state).toBe("unreachable");
  });

  it("401 n'est JAMAIS masqué par le cache (vrai problème d'auth à corriger)", async () => {
    let t = 1_000_000;
    const now = () => t;
    const s = source({ id: "driveai" });
    await fetchSummary(s, okFetch(), now); // cache chaud

    t += 60_000;
    const res = await fetchSummary(s, jsonFetch(401, {}), now);
    expect(res.state).toBe("unauthorized");
  });

  it("un nouveau succès rafraîchit le cache (l'âge repart de zéro)", async () => {
    let t = 1_000_000;
    const now = () => t;
    const s = source({ id: "driveai" });
    await fetchSummary(s, okFetch(), now);

    t += 10 * 60_000;
    await fetchSummary(s, okFetch(), now); // re-succès → cache réécrit à t

    t += 2 * 60_000;
    const res = await fetchSummary(s, timeoutFetch, now);
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.cachedAgeMs).toBe(2 * 60_000);
  });
});

describe("fetchAllSummaries", () => {
  it("interroge toutes les sources et conserve l'ordre", async () => {
    const sources = [
      source({ id: "financeai" }),
      source({ id: "driveai", token: null }),
    ];
    const results = await fetchAllSummaries(
      sources,
      jsonFetch(200, validSummary()),
    );
    expect(results).toHaveLength(2);
    expect(results[0]?.state).toBe("ok");
    expect(results[1]?.state).toBe("unconfigured"); // driveai sans jeton
  });
});

describe("contrat trop récent — le seul échec qui n'est pas la faute de l'app", () => {
  it("un summary d'une version future donne `contract-too-new`, PAS `invalid`", async () => {
    // Confondus jusqu'au 2026-08-20 : le hub affichait « réponse invalide », ce qui accuse
    // l'app alors que c'est le hub qui est en retard d'un re-pin. Le diagnostic envoyait
    // corriger le mauvais dépôt.
    const futur = { ...validSummary(), contractVersion: 2 };
    const res = await fetchSummary(source(), jsonFetch(200, futur));
    expect(res.state).toBe("contract-too-new");
    if (res.state === "contract-too-new") {
      expect(res.published).toBe(2);
      expect(res.supported).toBe(1);
    }
  });

  it("un vrai payload hors contrat reste `invalid`", async () => {
    const casse = {
      ...validSummary(),
      app: { ...validSummary().app, color: "rouge" },
    };
    const res = await fetchSummary(source(), jsonFetch(200, casse));
    expect(res.state).toBe("invalid");
  });

  it("n'est JAMAIS masqué par le cache de résilience", async () => {
    // Le cache existe pour absorber un accroc TRANSITOIRE. Un contrat trop récent est une
    // configuration à corriger : le masquer 30 min cacherait exactement ce qu'on vient de
    // rendre visible, et le re-pin attendrait de ne plus être caché.
    const s = source();
    expect((await fetchSummary(s, okFetch())).state).toBe("ok"); // remplit le cache

    const futur = { ...validSummary(), contractVersion: 2 };
    const res = await fetchSummary(s, jsonFetch(200, futur));
    expect(res.state).toBe("contract-too-new");
  });

  it("à l'inverse, un `invalid` transitoire EST couvert par le cache", async () => {
    // Contrôle négatif : sans lui, le test ci-dessus passerait même si le cache était cassé.
    const s = source();
    expect((await fetchSummary(s, okFetch())).state).toBe("ok");

    const res = await fetchSummary(s, jsonFetch(200, { pas: "un summary" }));
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.stale).toBe(true);
  });
});
