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

describe("fetchSummary", () => {
  it("unconfigured si aucun jeton (aucune requête émise)", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const res = await fetchSummary(source({ token: null }), spy);
    expect(res.state).toBe("unconfigured");
    expect(called).toBe(false);
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
    expect(res).toMatchObject({ state: "unreachable", detail: "HTTP 500" });
  });

  it("unreachable si le fetch jette (réseau coupé)", async () => {
    const spy = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = await fetchSummary(source(), spy);
    expect(res).toMatchObject({ state: "unreachable" });
    if (res.state === "unreachable") expect(res.detail).toContain("ECONNREFUSED");
  });

  it("unreachable avec détail « délai dépassé » sur TimeoutError", async () => {
    const spy = (async () => {
      throw new DOMException("aborted", "TimeoutError");
    }) as unknown as typeof fetch;
    const res = await fetchSummary(source(), spy);
    expect(res.state).toBe("unreachable");
    if (res.state === "unreachable") expect(res.detail).toContain("délai dépassé");
  });

  it("invalid si le JSON ne respecte pas le contrat", async () => {
    const res = await fetchSummary(source(), jsonFetch(200, { contractVersion: 99 }));
    expect(res.state).toBe("invalid");
  });

  it("invalid si la réponse n'est pas du JSON", async () => {
    const spy = (async () =>
      new Response("<html>pas du json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const res = await fetchSummary(source(), spy);
    expect(res).toMatchObject({ state: "invalid" });
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
    const sources = [source({ id: "financeai" }), source({ id: "driveai", token: null })];
    const results = await fetchAllSummaries(sources, jsonFetch(200, validSummary()));
    expect(results).toHaveLength(2);
    expect(results[0]?.state).toBe("ok");
    expect(results[1]?.state).toBe("unconfigured"); // driveai sans jeton
  });
});
