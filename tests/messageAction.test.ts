import { describe, expect, it } from "vitest";
import { messageResultat, messageSansConfirmation } from "@/lib/messageAction";

describe("messages après un bouton d'action", () => {
  it("succès : sans code HTTP", () => {
    const m = messageResultat("FinanceAI", {
      etat: "ok",
      statut: 200,
    });
    expect(m).toEqual({
      statut: "succes",
      message: "FinanceAI a bien reçu la demande.",
    });
    expect(m.message).not.toMatch(/HTTP|\d{3}/);
  });
  it("échec : sans détail technique", () => {
    const m = messageResultat("FinanceAI", {
      etat: "echec",
      detail: "HTTP 500",
    });
    expect(m.message).toBe("FinanceAI ne répond pas, rien n'a été lancé.");
  });
  it("résumé non confirmé : sans état anglais", () => {
    expect(messageSansConfirmation("FinanceAI")).not.toMatch(
      /unreachable|invalid/,
    );
  });
});
