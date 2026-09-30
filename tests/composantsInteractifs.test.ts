// tests/composantsInteractifs.test.ts — composants client et serveur encore sans test.
//
// Même méthode que tests/detailApp.test.ts : HTML statique (`renderToStaticMarkup`), sans
// navigateur ni nouvelle dépendance. Ce qui en découle, honnêtement :
//   - on vérifie le PREMIER rendu (celui que le serveur envoie) et les contrats testables sans
//     DOM : garde de PaletteMontee, action de SignOutButton, champs du formulaire de
//     BoutonTrigger ;
//   - les interactions (Ctrl+K, flèches, clic, minuterie de rafraîchissement, enregistrement
//     du service worker, confirmation avant déclenchement) exigent un DOM : elles sont
//     testées dans tests/composantsDom.test.ts (jsdom).

import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HubAction } from "@mokarade/hub-contract";

const moq = vi.hoisted(() => ({
  auth: vi.fn(),
  signOut: vi.fn(async () => {}),
  aAcces: vi.fn(),
  actionDeclencher: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: moq.auth, signOut: moq.signOut }));
vi.mock("@/app/actions", () => ({ actionDeclencher: moq.actionDeclencher }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: moq.refresh, push: moq.push }),
}));
vi.mock("@/lib/personnes", () => ({ APP_HUB: "hubperso", aAcces: moq.aAcces }));

import { BoutonTrigger } from "@/components/BoutonTrigger";
import { ActionList } from "@/components/ActionList";
import { RefreshControls } from "@/components/RefreshControls";
import { PaletteCommandes } from "@/components/PaletteCommandes";
import { PaletteMontee } from "@/components/PaletteMontee";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SignOutButton } from "@/components/SignOutButton";
import { commandes } from "@/lib/palette";

/** Texte visible. Le `<script>` de rejeu de formulaire que React ajoute n'en fait pas partie. */
function texte(html: string): string {
  return html
    .replace(/<script>[\s\S]*?<\/script>/g, "")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

afterEach(() => {
  for (const f of Object.values(moq)) f.mockReset();
  vi.unstubAllEnvs();
});

const action = (over: Partial<HubAction> = {}): HubAction =>
  ({ label: "Ouvrir", href: "https://exemple.test/a", kind: "link", ...over }) as HubAction;

describe("BoutonTrigger", () => {
  it("premier rendu : bouton actif au libellé de l'action, app et lien en champs cachés, aucun retour", () => {
    const html = renderToStaticMarkup(
      h(BoutonTrigger, {
        action: action({ kind: "trigger", label: "Relancer", href: "https://exemple.test/relancer" }),
        appId: "batchchef",
      }),
    );
    expect(html).toContain('<input type="hidden" name="appId" value="batchchef"/>');
    expect(html).toContain('<input type="hidden" name="href" value="https://exemple.test/relancer"/>');
    expect(texte(html)).toBe("Relancer");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("action-trigger__retour");
    // Rien n'est déclenché au rendu : seul l'envoi du formulaire appelle l'action serveur.
    expect(moq.actionDeclencher).not.toHaveBeenCalled();
  });
});

describe("ActionList", () => {
  it("liste vide : ne rend rien", () => {
    expect(renderToStaticMarkup(h(ActionList, { actions: [], appId: "carai" }))).toBe("");
  });

  it("lien sûr → <a> externe ; lien refusé → libellé inerte ; trigger → formulaire", () => {
    const html = renderToStaticMarkup(
      h(ActionList, {
        appId: "carai",
        actions: [
          action({ label: "Voir" }),
          action({ label: "Piégé", href: "javascript:alert(1)" }),
          action({ label: "Relancer", kind: "trigger" }),
        ],
      }),
    );
    expect(html.match(/<a class="action"/g)).toHaveLength(1);
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Lien non conforme"');
    // Aucun lien `javascript:` publié par l'app. (Le formulaire porte l'action-garde de
    // React, `javascript:throw …`, qui empêche un envoi avant hydratation : ce n'est pas un
    // lien de l'app.)
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("alert(1)");
    expect(html).toContain('class="action-trigger"');
  });

  it("un trigger au lien refusé n'est JAMAIS un formulaire", () => {
    const html = renderToStaticMarkup(
      h(ActionList, { appId: "carai", actions: [action({ kind: "trigger", href: "ftp://x" })] }),
    );
    expect(html).not.toContain("<form");
    expect(html).toContain("action--disabled");
  });
});

describe("RefreshControls", () => {
  it("premier rendu : bouton « Rafraîchir » actif, sans rafraîchir au rendu", () => {
    const html = renderToStaticMarkup(h(RefreshControls));
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("disabled");
    expect(texte(html)).toBe("↻ Rafraîchir");
    // La minuterie (15 s) et l'écoute de visibilité vivent dans un effet : jamais au rendu
    // serveur. Leur comportement est testé dans tests/composantsDom.test.ts.
    expect(moq.refresh).not.toHaveBeenCalled();
  });
});

describe("PaletteCommandes", () => {
  it("fermée au premier rendu : n'envoie AUCUN HTML (elle ne s'ouvre qu'au Ctrl+K, côté client)", () => {
    const liste = commandes([{ id: "carai", nom: "CarAI", url: "https://carai.hubperso.com" }]);
    expect(liste.length).toBeGreaterThan(0);
    expect(renderToStaticMarkup(h(PaletteCommandes, { commandes: liste }))).toBe("");
    expect(moq.push).not.toHaveBeenCalled();
  });
});

describe("PaletteMontee (composant serveur)", () => {
  it("sans session : ne monte rien, et ne consulte pas les accès", async () => {
    moq.auth.mockResolvedValue(null);
    expect(await PaletteMontee()).toBeNull();
    expect(moq.aAcces).not.toHaveBeenCalled();
  });

  it("session sans accès au hub : ne monte rien (la palette listerait toutes les apps)", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@exemple.test" } });
    moq.aAcces.mockResolvedValue(false);
    expect(await PaletteMontee()).toBeNull();
    expect(moq.aAcces).toHaveBeenCalledWith("invite@exemple.test", "hubperso");
  });

  it("accès au hub : monte PaletteCommandes avec une commande par app déclarée", async () => {
    moq.auth.mockResolvedValue({ user: { email: "proprietaire@exemple.test" } });
    moq.aAcces.mockResolvedValue(true);
    const el = (await PaletteMontee()) as ReactElement<{ commandes: { id: string }[] }>;
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(PaletteCommandes);
    const ids = el.props.commandes.map((c) => c.id);
    expect(ids).toContain("page-accueil");
    for (const app of ["financeai", "driveai", "batchchef", "carai", "jobai", "memoryai"]) {
      expect(ids.some((id) => id.includes(app)), `aucune commande pour ${app}`).toBe(true);
    }
  });
});

describe("ServiceWorker", () => {
  it("ne rend rien, et n'enregistre rien au rendu serveur (l'enregistrement vit dans un effet)", () => {
    expect(renderToStaticMarkup(h(ServiceWorker))).toBe("");
  });
});

describe("SignOutButton", () => {
  it("un formulaire avec un bouton « Se déconnecter »", () => {
    const html = renderToStaticMarkup(h(SignOutButton));
    expect(html).toContain("<form");
    expect(html).toContain('<button type="submit" class="signout">Se déconnecter</button>');
  });

  it("son action déconnecte et renvoie vers /login", async () => {
    const el = SignOutButton() as ReactElement<{ action: () => Promise<void> }>;
    await el.props.action();
    expect(moq.signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
