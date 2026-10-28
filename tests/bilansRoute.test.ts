// tests/bilansRoute.test.ts — GET /api/bilans et /api/bilans/<id> : propriétaire seul, et un échec est DIT
// (aucun bilan inventé). Session, jeton et Drive sont simulés.

import { beforeEach, describe, expect, it, vi } from "vitest";

const moq = vi.hoisted(() => ({ auth: vi.fn(), jetonDrive: vi.fn(), listerBilans: vi.fn(), lireBilan: vi.fn() }));

vi.mock("@/auth", () => ({ auth: moq.auth }));
vi.mock("@/lib/jetonDrive", () => ({ jetonDrive: moq.jetonDrive }));
vi.mock("@/lib/bilansDrive", () => ({ listerBilans: moq.listerBilans, lireBilan: moq.lireBilan }));

import { GET as LISTE } from "@/app/api/bilans/route";
import { GET as UN } from "@/app/api/bilans/[id]/route";
import { CSP_BILAN, DOSSIER_BILANS } from "@/lib/bilans";

const PROPRIETAIRE = "proprio@example.test";
const ID = "fichierBilan1234567";
let ip = 0;
const requete = (chemin = "/api/bilans") => new Request(`https://hubperso.com${chemin}`, { headers: { "x-real-ip": `10.4.0.${++ip}` } });
const contexte = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  for (const m of Object.values(moq)) m.mockReset();
  vi.stubEnv("AUTHORIZED_EMAIL", PROPRIETAIRE);
  vi.stubEnv("BILANS_DRIVE_FOLDER_ID", "dossierBilans123456");
  moq.auth.mockResolvedValue({ user: { email: PROPRIETAIRE } });
  moq.jetonDrive.mockResolvedValue({ jeton: "jeton-de-test" });
});

describe("garde commune", () => {
  it("sans session : 401, et ni jeton ni Drive n'est touché", async () => {
    moq.auth.mockResolvedValue(null);
    for (const r of [await LISTE(requete()), await UN(requete(`/api/bilans/${ID}`), contexte())]) {
      expect(r.status).toBe(401);
      expect(r.headers.get("cache-control")).toMatch(/no-store/);
    }
    expect(moq.jetonDrive).not.toHaveBeenCalled();
    expect(moq.listerBilans).not.toHaveBeenCalled();
  });

  it("un invité du hub : 404, pas 403, et Drive n'est pas lu", async () => {
    moq.auth.mockResolvedValue({ user: { email: "invite@example.test" } });
    expect((await LISTE(requete())).status).toBe(404);
    expect((await UN(requete(`/api/bilans/${ID}`), contexte())).status).toBe(404);
    expect(moq.jetonDrive).not.toHaveBeenCalled();
  });

  it("variable absente : le dossier par défaut sert, jamais un dossier vide", async () => {
    vi.stubEnv("BILANS_DRIVE_FOLDER_ID", "");
    moq.listerBilans.mockResolvedValue({ ok: true, valeur: [] });
    expect((await LISTE(requete())).status).toBe(200);
    expect(moq.listerBilans).toHaveBeenCalledWith("jeton-de-test", DOSSIER_BILANS);
  });

  it("droit Drive absent : 409 qui dit de se reconnecter ; Google en panne : 502", async () => {
    moq.jetonDrive.mockResolvedValueOnce({ raison: "droit-absent" });
    const r = await LISTE(requete());
    expect(r.status).toBe(409);
    expect((await r.json()).message).toMatch(/reconnecte/i);
    moq.jetonDrive.mockResolvedValueOnce({ raison: "injoignable" });
    expect((await LISTE(requete())).status).toBe(502);
    moq.jetonDrive.mockResolvedValueOnce({ raison: "session" });
    expect((await LISTE(requete())).status).toBe(401);
  });
});

describe("GET /api/bilans", () => {
  it("rend la liste, sans cache", async () => {
    const bilans = [{ id: ID, genre: "jour", date: "2026-10-28", nom: "bilan-jour-2026-10-28.html" }];
    moq.listerBilans.mockResolvedValue({ ok: true, valeur: bilans });
    const r = await LISTE(requete());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ bilans });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(moq.listerBilans).toHaveBeenCalledWith("jeton-de-test", "dossierBilans123456");
  });

  it("aucun bilan : 200 et liste vide (jamais une erreur déguisée)", async () => {
    moq.listerBilans.mockResolvedValue({ ok: true, valeur: [] });
    expect(await (await LISTE(requete())).json()).toEqual({ bilans: [] });
  });

  it.each([
    ["refuse", 409],
    ["introuvable", 503],
    ["hors-contrat", 502],
    ["injoignable", 502],
  ])("Drive dit %s : %i", async (raison, statut) => {
    moq.listerBilans.mockResolvedValue({ ok: false, raison });
    expect((await LISTE(requete())).status).toBe(statut);
  });
});

describe("GET /api/bilans/<id>", () => {
  it("rend le HTML sous la CSP en bac à sable", async () => {
    moq.lireBilan.mockResolvedValue({ ok: true, valeur: { html: "<p>fictif</p>", bilan: {} } });
    const r = await UN(requete(`/api/bilans/${ID}`), contexte());
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("<p>fictif</p>");
    expect(r.headers.get("content-security-policy")).toBe(CSP_BILAN);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
    expect(moq.lireBilan).toHaveBeenCalledWith("jeton-de-test", "dossierBilans123456", ID);
  });

  it("un identifiant qui n'en est pas un : 400 avant toute lecture", async () => {
    const r = await UN(requete("/api/bilans/x"), contexte("../../secret"));
    expect(r.status).toBe(400);
    expect(moq.lireBilan).not.toHaveBeenCalled();
    expect(moq.jetonDrive).not.toHaveBeenCalled();
  });

  it.each([
    ["introuvable", 404],
    ["refuse", 409],
    ["hors-contrat", 502],
    ["injoignable", 502],
  ])("Drive dit %s : %i", async (raison, statut) => {
    moq.lireBilan.mockResolvedValue({ ok: false, raison });
    expect((await UN(requete(`/api/bilans/${ID}`), contexte())).status).toBe(statut);
  });
});
