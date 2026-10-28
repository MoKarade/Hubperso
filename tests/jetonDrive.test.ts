// tests/jetonDrive.test.ts — le jeton qui lit Drive vient du cookie de session de Marc, jamais d'ailleurs.
// On éprouve la décision (pure) puis la lecture réelle d'un cookie chiffré par Auth.js (aucun jeton réel).

import { encode } from "next-auth/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { choisirJeton, jetonDrive, nomCookieSession } from "@/lib/jetonDrive";
import { PORTEE_DRIVE_LECTURE, PORTEES_GOOGLE } from "@/lib/jetonsGoogle";

const MAINTENANT = 1_800_000_000_000;
const DANS_UNE_HEURE = MAINTENANT / 1000 + 3600;
const base = { accessToken: "acces", refreshToken: "refresh", expiresAt: DANS_UNE_HEURE, scope: PORTEES_GOOGLE };

describe("choisirJeton", () => {
  it("jeton d'accès encore valable : on s'en sert", () => {
    expect(choisirJeton(base, MAINTENANT)).toEqual({ type: "valide", jeton: "acces" });
  });

  it("expiré ou en erreur : on le renouvelle avec le refresh_token", () => {
    expect(choisirJeton({ ...base, expiresAt: MAINTENANT / 1000 - 10 }, MAINTENANT)).toEqual({ type: "renouveler", refreshToken: "refresh" });
    expect(choisirJeton({ ...base, error: "RefreshAccessTokenError" }, MAINTENANT)).toEqual({ type: "renouveler", refreshToken: "refresh" });
  });

  it("sans le droit Drive (connecté avant son ajout) : on le dit, on ne tente rien", () => {
    expect(choisirJeton({ ...base, scope: "openid email profile https://www.googleapis.com/auth/tasks" }, MAINTENANT)).toEqual({ type: "sans", raison: "droit-absent" });
    expect(choisirJeton({ ...base, scope: undefined }, MAINTENANT)).toEqual({ type: "sans", raison: "droit-absent" });
    // « drive.file » ou une sous-chaîne ne valent pas « drive.readonly ».
    expect(choisirJeton({ ...base, scope: "https://www.googleapis.com/auth/drive.file" }, MAINTENANT).type).toBe("sans");
  });

  it("ni jeton valable ni refresh_token : refusé, pas inventé ; pas de cookie : session", () => {
    expect(choisirJeton({ ...base, accessToken: undefined, refreshToken: undefined }, MAINTENANT)).toEqual({ type: "sans", raison: "jeton-refuse" });
    expect(choisirJeton(null, MAINTENANT)).toEqual({ type: "sans", raison: "session" });
  });
});

describe("jetonDrive (cookie chiffré réel)", () => {
  const SECRET = "secret-de-test-uniquement-aaaaaaaaaaaaaaaaaaaaaaaaaa";
  afterEach(() => vi.unstubAllEnvs());

  async function requeteAvec(token: Record<string, unknown>, url = "https://hubperso.com/api/bilans") {
    const nom = nomCookieSession(url.startsWith("https"));
    const valeur = await encode({ token, secret: SECRET, salt: nom, maxAge: 3600 });
    return new Request(url, { headers: { cookie: `${nom}=${valeur}` } });
  }

  it("lit le jeton d'accès dans le cookie de session du hub", async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    const requete = await requeteAvec({ ...base, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    expect(await jetonDrive(requete)).toEqual({ jeton: "acces" });
  });

  it("un cookie fabriqué avec un autre secret n'est pas lu", async () => {
    vi.stubEnv("AUTH_SECRET", "un-tout-autre-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const requete = await requeteAvec({ ...base, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    expect(await jetonDrive(requete)).toEqual({ raison: "session" });
  });

  it("sans cookie : session ; droit absent : on ne renouvelle pas", async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    expect(await jetonDrive(new Request("https://hubperso.com/api/bilans"))).toEqual({ raison: "session" });
    const fetchEspion = vi.spyOn(globalThis, "fetch");
    const requete = await requeteAvec({ ...base, scope: "openid email", expiresAt: 1 });
    expect(await jetonDrive(requete)).toEqual({ raison: "droit-absent" });
    expect(fetchEspion).not.toHaveBeenCalled();
    fetchEspion.mockRestore();
  });

  it("jeton expiré : Google renouvelle (échec = raison dite, jamais un jeton inventé)", async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    const requete = await requeteAvec({ ...base, expiresAt: 1 });
    const fetchEspion = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ access_token: "neuf" }));
    expect(await jetonDrive(requete)).toEqual({ jeton: "neuf" });
    fetchEspion.mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 }));
    expect(await jetonDrive(requete)).toEqual({ raison: "jeton-refuse" });
    fetchEspion.mockRejectedValueOnce(new Error("réseau"));
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await jetonDrive(requete)).toEqual({ raison: "injoignable" });
    expect(journal).toHaveBeenCalled();
    fetchEspion.mockRestore();
    journal.mockRestore();
  });

  it("la portée testée est bien celle de lib/jetonsGoogle.ts", () => {
    expect(PORTEES_GOOGLE).toContain(PORTEE_DRIVE_LECTURE);
  });
});
