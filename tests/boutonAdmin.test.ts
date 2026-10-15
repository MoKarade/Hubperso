import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoutonAdmin } from "@/components/BoutonAdmin";
import { confirmationRetrait } from "@/lib/messageAdmin";

describe("confirmation avant de retirer une personne", () => {
  it("nomme la personne et prévient que ses accès seront supprimés", () => {
    expect(confirmationRetrait("jean@exemple.com")).toBe(
      "Retirer jean@exemple.com ? Ses accès seront supprimés.",
    );
  });

  it("rend un vrai bouton d'envoi avec son libellé", () => {
    const html = renderToStaticMarkup(
      createElement(BoutonAdmin, { className: "btn", confirmation: "?" }, "Retirer"),
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain("Retirer");
  });
});
