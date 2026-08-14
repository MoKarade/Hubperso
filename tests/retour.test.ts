// La liste blanche des destinations de retour après connexion.
//
// Chaque cas de refus ici correspond à une technique réelle de redirection ouverte. Les
// quatre premiers passeraient tous un `startsWith("https://hubperso.com")` ou un
// `includes("hubperso.com")` — c'est pour ça qu'on analyse l'URL au lieu du texte.

import { describe, expect, it } from "vitest";
import { destinationApresConnexion, estDestinationDuHub } from "../lib/retour";

const ORIGINE = "https://hubperso.com";

describe("estDestinationDuHub — ce qui est accepté", () => {
  it("accepte un chemin relatif", () => {
    expect(estDestinationDuHub("/couts", ORIGINE)).toBe(true);
    expect(estDestinationDuHub("/app/carai", ORIGINE)).toBe(true);
  });

  it("accepte le domaine du hub et ses sous-domaines, en https", () => {
    for (const url of [
      "https://hubperso.com/",
      "https://www.hubperso.com/",
      "https://emploi.hubperso.com/offres",
      "https://carai.hubperso.com/trajets",
      "https://batchchef.hubperso.com/",
      "https://drive.hubperso.com/",
      "https://finance.hubperso.com/",
    ]) {
      expect(estDestinationDuHub(url, ORIGINE), url).toBe(true);
    }
  });
});

describe("estDestinationDuHub — les pièges de redirection ouverte", () => {
  it("refuse un userinfo qui imite le domaine", () => {
    // `new URL()` lit ici hostname = evil.com : tout ce qui précède le @ est un userinfo.
    // Un startsWith("https://hubperso.com") accepterait cette URL.
    expect(estDestinationDuHub("https://hubperso.com@evil.com/", ORIGINE)).toBe(false);
    expect(estDestinationDuHub("https://hubperso.com:x@evil.com/", ORIGINE)).toBe(false);
  });

  it("refuse un domaine qui se termine par le nom sans être un sous-domaine", () => {
    expect(estDestinationDuHub("https://evil-hubperso.com/", ORIGINE)).toBe(false);
    expect(estDestinationDuHub("https://nothubperso.com/", ORIGINE)).toBe(false);
  });

  it("refuse un domaine qui CONTIENT le nom en préfixe", () => {
    expect(estDestinationDuHub("https://x.hubperso.com.evil.com/", ORIGINE)).toBe(false);
    expect(estDestinationDuHub("https://hubperso.com.evil.com/", ORIGINE)).toBe(false);
  });

  it("refuse le nom dans le chemin ou la requête", () => {
    expect(estDestinationDuHub("https://evil.com/hubperso.com", ORIGINE)).toBe(false);
    expect(estDestinationDuHub("https://evil.com/?x=hubperso.com", ORIGINE)).toBe(false);
  });

  it("refuse une URL protocol-relative déguisée en chemin", () => {
    // `//evil.com` ressemble à un chemin mais le navigateur y voit une autre origine.
    expect(estDestinationDuHub("//evil.com", ORIGINE)).toBe(false);
    expect(estDestinationDuHub("//evil.com/page", ORIGINE)).toBe(false);
  });

  it("refuse ce qui n'est pas chiffré", () => {
    expect(estDestinationDuHub("http://emploi.hubperso.com/", ORIGINE)).toBe(false);
  });

  it("refuse les protocoles exotiques", () => {
    expect(estDestinationDuHub("javascript:alert(1)", ORIGINE)).toBe(false);
    expect(estDestinationDuHub("data:text/html,<h1>x</h1>", ORIGINE)).toBe(false);
  });

  it("refuse le vide et l'illisible", () => {
    expect(estDestinationDuHub("", ORIGINE)).toBe(false);
    expect(estDestinationDuHub("   ", ORIGINE)).toBe(false);
    expect(estDestinationDuHub("https://", ORIGINE)).toBe(false);
  });

  it("ignore la casse du domaine", () => {
    // Un attaquant qui varie la casse ne doit ni contourner ni être refusé à tort.
    expect(estDestinationDuHub("https://EMPLOI.HubPerso.com/", ORIGINE)).toBe(true);
    expect(estDestinationDuHub("https://EVIL.com/", ORIGINE)).toBe(false);
  });
});

describe("destinationApresConnexion — échec fermé", () => {
  it("garde une destination légitime", () => {
    expect(destinationApresConnexion("https://emploi.hubperso.com/x", ORIGINE)).toBe(
      "https://emploi.hubperso.com/x",
    );
  });

  it("ramène au hub plutôt que d'échouer", () => {
    // Une redirection qu'on n'explique pas vaut mieux qu'une redirection qu'on n'a pas
    // voulue : on ne lève pas d'erreur, on ne suit pas la destination.
    expect(destinationApresConnexion("https://evil.com/", ORIGINE)).toBe(ORIGINE);
    expect(destinationApresConnexion(null, ORIGINE)).toBe(ORIGINE);
    expect(destinationApresConnexion(undefined, ORIGINE)).toBe(ORIGINE);
  });
});
