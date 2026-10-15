// tests/messageHubAMettreAJour.test.ts — carte 5 : « Re-pinner le hub » (jargon) devient
// une phrase que Marc comprend, sur la carte et dans le détail.

import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppWidget } from "@/components/AppWidget";
import { hubSource } from "./helpers";

vi.mock("@/app/actions", () => ({ actionDeclencher: vi.fn() }));

describe("carte d'une app dont le contrat est plus récent que le hub", () => {
  const html = renderToStaticMarkup(
    h(AppWidget, {
      result: { state: "contract-too-new", source: hubSource(), published: 2, supported: 1 },
    }),
  ).replace(/<!-- -->/g, "");

  it("dit que le hub doit être mis à jour", () => {
    expect(html).toContain("Le hub doit être mis à jour pour lire cette app.");
  });

  it("n'emploie plus le mot « pinner »", () => {
    expect(html.toLowerCase()).not.toContain("pinner");
  });
});
