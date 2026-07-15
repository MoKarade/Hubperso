import { describe, it, expect } from "vitest";
import { statusBadge, severityTone } from "../lib/status";
import type { SummaryResult } from "../lib/fetchSummary";
import type { HubSource } from "../lib/sources";
import { validSummary } from "./helpers";

const source: HubSource = {
  id: "financeai",
  name: "FinanceAI",
  summaryUrl: "https://x/hub/summary",
  token: "t",
};

describe("statusBadge", () => {
  it("mappe les états de fetch en échec", () => {
    expect(statusBadge({ state: "unconfigured", source }).tone).toBe("neutral");
    expect(statusBadge({ state: "unauthorized", source }).tone).toBe("danger");
    expect(statusBadge({ state: "unreachable", source, detail: "x" }).tone).toBe("danger");
    expect(statusBadge({ state: "invalid", source, detail: "x" }).tone).toBe("danger");
  });

  it("mappe le status du contrat quand le summary est valide", () => {
    const cases: Array<[SummaryResult, string]> = [
      [{ state: "ok", source, summary: validSummary({ status: "ok" }) }, "ok"],
      [{ state: "ok", source, summary: validSummary({ status: "degraded" }) }, "warn"],
      [{ state: "ok", source, summary: validSummary({ status: "error" }) }, "danger"],
      [{ state: "ok", source, summary: validSummary({ status: "building" }) }, "info"],
    ];
    for (const [result, tone] of cases) {
      expect(statusBadge(result).tone).toBe(tone);
    }
  });
});

describe("severityTone", () => {
  it("traduit chaque sévérité", () => {
    expect(severityTone("ok")).toBe("ok");
    expect(severityTone("warn")).toBe("warn");
    expect(severityTone("alert")).toBe("danger");
    expect(severityTone("info")).toBe("info");
  });
});
