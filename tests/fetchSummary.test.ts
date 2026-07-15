import { describe, it, expect } from "vitest";
import { HUB_TOKEN_HEADER } from "@mokarade/hub-contract";
import { fetchSummary, fetchAllSummaries } from "../lib/fetchSummary";
import type { HubSource } from "../lib/sources";
import { validSummary, jsonFetch } from "./helpers";

function source(over: Partial<HubSource> = {}): HubSource {
  return {
    id: "financeai",
    name: "FinanceAI",
    summaryUrl: "https://x.test/hub/summary",
    token: "jeton",
    ...over,
  };
}

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

describe("fetchAllSummaries", () => {
  it("interroge toutes les sources et conserve l'ordre", async () => {
    const sources = [source({ id: "financeai" }), source({ id: "driveai", token: null })];
    const results = await fetchAllSummaries(sources, jsonFetch(200, validSummary()));
    expect(results).toHaveLength(2);
    expect(results[0]?.state).toBe("ok");
    expect(results[1]?.state).toBe("unconfigured"); // driveai sans jeton
  });
});
