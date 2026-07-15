import type { HubSummary } from "@mokarade/hub-contract";

/** Un summary valide de référence, modifiable par override dans chaque test. */
export function validSummary(over: Partial<HubSummary> = {}): HubSummary {
  return {
    contractVersion: 1,
    app: {
      id: "financeai",
      name: "FinanceAI",
      url: "https://finance.hubperso.com",
      color: "#0f766e",
    },
    generatedAt: "2026-07-15T12:00:00.000Z",
    status: "ok",
    metrics: [{ label: "Valeur nette", value: 123456, format: "currency" }],
    alerts: [],
    actions: [],
    ...over,
  };
}

/** fetch factice renvoyant une réponse JSON avec le statut donné. */
export function jsonFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}
