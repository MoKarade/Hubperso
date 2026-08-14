// tests/apiAcces.test.ts — la porte que les autres apps interrogent.
//
// La vraie route est appelée avec de vraies `Request`. Rien n'est simulé : le refus vient
// du code qui refusera en production, pas d'un double.
//
// Aucune base ici, et c'est VOULU : sans `DATABASE_URL`, seul le propriétaire entre. Les
// deux réponses possibles (`true` pour lui, `false` pour tout le monde) s'observent donc
// telles quelles, et le chemin de repli — celui qui empêche d'être enfermé dehors — est
// exercé pour de bon. Le schéma, lui, est éprouvé dans `tests/personnes.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/acces/route";

const JETON_JOBAI = "jeton-de-test-jobai-0000000000";
const PROPRIO = "marc.richard4@gmail.com";
const INVITEE = "quelquun@exemple.com";

function requete(corps: unknown, jeton?: string): Request {
  return new Request("https://hubperso.com/api/acces", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(jeton ? { "x-hub-token": jeton } : {}),
    },
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
  });
}

beforeEach(() => {
  vi.stubEnv("HUB_TOKEN_JOBAI", JETON_JOBAI);
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIO);
  vi.stubEnv("DATABASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/acces", () => {
  it("répond 401 sans jeton", async () => {
    const res = await POST(requete({ email: PROPRIO }));
    expect(res.status).toBe(401);
    // Même le propriétaire ne passe pas sans jeton : c'est l'APP qui s'authentifie ici,
    // pas la personne.
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("répond 401 avec un jeton inconnu", async () => {
    const res = await POST(requete({ email: PROPRIO }, "jeton-inventé"));
    expect(res.status).toBe(401);
  });

  it("répond 400 sur un corps qui n'est pas du JSON", async () => {
    const res = await POST(requete("ceci n'est pas du json", JETON_JOBAI));
    expect(res.status).toBe(400);
  });

  it("répond 400 quand l'email manque ou n'est pas une chaîne", async () => {
    expect((await POST(requete({}, JETON_JOBAI))).status).toBe(400);
    expect((await POST(requete({ email: "" }, JETON_JOBAI))).status).toBe(400);
    expect((await POST(requete({ email: 42 }, JETON_JOBAI))).status).toBe(400);
    // Le piège classique : `{"email": null}` passerait un `in corps` naïf.
    expect((await POST(requete({ email: null }, JETON_JOBAI))).status).toBe(400);
  });

  it("dit oui au propriétaire, pour l'app qui présente le jeton", async () => {
    const res = await POST(requete({ email: PROPRIO }, JETON_JOBAI));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ appId: "jobai", acces: true });
  });

  it("ignore un `appId` déclaré dans le corps — seul le jeton fait foi", async () => {
    // Le jour où quelqu'un « simplifiera » en lisant l'app depuis le corps, ce test tombe.
    // Une app pourrait alors demander — et obtenir — les accès d'une autre.
    const res = await POST(
      requete({ email: PROPRIO, appId: "batchchef" }, JETON_JOBAI),
    );
    expect(await res.json()).toMatchObject({ appId: "jobai" });
  });

  it("dit non à quelqu'un d'autre quand la base est absente", async () => {
    // ÉCHEC FERMÉ : pas de base ⇒ aucune porte ne s'ouvre, sauf celle du propriétaire.
    const res = await POST(requete({ email: INVITEE }, JETON_JOBAI));
    expect(await res.json()).toEqual({ appId: "jobai", acces: false });
  });

  it("interdit la mise en cache de la réponse", async () => {
    // Une révocation qui dormirait dans un cache intermédiaire serait une révocation qui
    // ne révoque rien. L'appelant, lui, cache une minute — c'est un choix, pas un hasard.
    const res = await POST(requete({ email: PROPRIO }, JETON_JOBAI));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
