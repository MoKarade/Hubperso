// tests/liaClient.test.ts — la question de LIA côté navigateur : une réponse conforme, ou une erreur.
// Jamais une réponse complétée ou inventée (LIA dit « indisponible » sur toute erreur).

import { describe, expect, it, vi } from "vitest";
import { poserQuestion, ROUTE_ASK } from "@/lib/liaClient";

const signal = new AbortController().signal;
const reponse = (corps: unknown, status = 200): Response =>
  new Response(typeof corps === "string" ? corps : JSON.stringify(corps), { status });

describe("poserQuestion", () => {
  it("poste la question et la page à la route du hub, et rend la réponse validée", async () => {
    const appeler = vi.fn().mockResolvedValue(reponse({ text: "Bonjour", mood: "joyeux", extra: "x" }));
    const r = await poserQuestion("Où en sont mes apps ?", signal, "/attention", appeler);
    expect(r).toEqual({ text: "Bonjour", mood: "joyeux" });
    const [url, init] = appeler.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ROUTE_ASK);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ question: "Où en sont mes apps ?", page: "/attention" });
    expect(init.signal).toBe(signal);
  });

  it("une page qui n'a pas la forme du contrat n'est pas envoyée", async () => {
    // Une réponse neuve à chaque appel : un corps ne se lit qu'une fois.
    const appeler = vi.fn().mockImplementation(async () => reponse({ text: "ok" }));
    await poserQuestion("q", signal, "attention", appeler);
    await poserQuestion("q", signal, `/${"a".repeat(200)}`, appeler);
    for (const [, init] of appeler.mock.calls as [string, RequestInit][]) {
      expect(JSON.parse(init.body as string)).toEqual({ question: "q" });
    }
  });

  it.each([401, 403, 413, 503])("le statut %i lève, sans réponse", async (status) => {
    const appeler = vi.fn().mockResolvedValue(reponse({ error: "x" }, status));
    await expect(poserQuestion("q", signal, undefined, appeler)).rejects.toThrow(`statut ${status}`);
  });

  it("une réponse hors contrat ou illisible lève", async () => {
    await expect(poserQuestion("q", signal, undefined, vi.fn().mockResolvedValue(reponse({ text: "" })))).rejects.toThrow(
      "hors contrat",
    );
    await expect(poserQuestion("q", signal, undefined, vi.fn().mockResolvedValue(reponse("pas du json")))).rejects.toThrow(
      "illisible",
    );
  });

  it("une panne réseau ou un abandon se propage (LIA dira « indisponible »)", async () => {
    const appeler = vi.fn().mockRejectedValue(new TypeError("réseau"));
    await expect(poserQuestion("q", signal, undefined, appeler)).rejects.toThrow("réseau");
  });

  it("la question n'apparaît jamais dans le message d'une erreur", async () => {
    const appeler = vi.fn().mockResolvedValue(reponse({}, 503));
    await expect(poserQuestion("secret-de-test-question", signal, undefined, appeler)).rejects.not.toThrow(
      "secret-de-test-question",
    );
  });
});
