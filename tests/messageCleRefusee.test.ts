// tests/messageCleRefusee.test.ts — carte 4 : la carte d'une app dont la clé est refusée
// parle en mots simples, sans code HTTP ni nom d'en-tête.

import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppWidget } from "@/components/AppWidget";
import { hubSource } from "./helpers";

vi.mock("@/app/actions", () => ({ actionDeclencher: vi.fn() }));

function texte(html: string): string {
  return html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("carte d'une app dont la clé est refusée", () => {
  const html = renderToStaticMarkup(
    h(AppWidget, { result: { state: "unauthorized", source: hubSource() } }),
  );

  it("dit que le hub n'a pas la bonne clé", () => {
    expect(texte(html)).toContain("Le hub n’a pas la bonne clé pour lire cette app");
  });

  it("n'affiche ni le code 401 ni le nom de l'en-tête", () => {
    expect(texte(html)).not.toContain("401");
    expect(texte(html)).not.toContain("x-hub-token");
    expect(texte(html)).not.toContain("Jeton");
  });
});
