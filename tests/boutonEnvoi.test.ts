import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoutonEnvoi } from "@/components/BoutonEnvoi";
import { libelleEnvoi } from "@/lib/libelleEnvoi";

describe("bouton d'envoi d'Administration", () => {
  it("affiche « En cours… » pendant l'envoi, « Fait » ensuite, sinon son libellé", () => {
    expect(libelleEnvoi("Ajouter", "en-cours")).toBe("En cours…");
    expect(libelleEnvoi("Ajouter", "fait")).toBe("Fait");
    expect(libelleEnvoi("Ajouter", "repos")).toBe("Ajouter");
  });

  it("rend un bouton d'envoi actif avec son libellé au repos", () => {
    const html = renderToStaticMarkup(
      createElement(BoutonEnvoi, { libelle: "Désactiver", className: "btn" }),
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain("Désactiver");
    expect(html).not.toContain("disabled");
  });
});
