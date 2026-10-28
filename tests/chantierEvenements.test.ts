// tests/chantierEvenements.test.ts — lecture des webhooks GitHub et route POST /api/chantier/evenement.
//
// Ce qu'on éprouve : la signature (valide, fausse, mal formée) se juge sur le texte brut ; CHANTIER_WEBHOOK_SECRET absent
// → 503 (jamais 401) ; chaque type retenu rend la clé et l'heure convenues ; un type ou une action non retenus sont
// IGNORÉS à voix haute ; un événement retenu mais illisible ou d'un dépôt inconnu est REFUSÉ ; un renvoi ne range rien
// deux fois ; base en panne → 500 ; rien du corps d'un commentaire n'est gardé.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { formeSignature, lireEvenement, signer } from "@/lib/chantierEvenements";

const SECRET = "secret-de-test-webhook-0123456789";
const MAINTENANT = new Date("2026-10-28T21:00:00.000Z");
const ID = "72d3162e-cc78-11e3-81ab-4c9367dc0958";
const depot = (name = "DriveAI") => ({ name });

describe("signature", () => {
  it("signe en sha256=<64 hex> ; refuse les formes illisibles", () => {
    const bonne = signer('{"a":1}', SECRET);
    expect(formeSignature(bonne)).toBe(true);
    expect(signer('{"a":1}', SECRET)).toBe(bonne);
    expect(signer('{"a":2}', SECRET)).not.toBe(bonne);
    expect(signer('{"a":1}', "autre")).not.toBe(bonne);
    expect(formeSignature(bonne.replace("sha256=", "sha1="))).toBe(false);
    expect(formeSignature(null)).toBe(false);
    expect(formeSignature("sha256=zz")).toBe(false);
  });
});

describe("lireEvenement", () => {
  const ok = (type: string, corps: unknown) => {
    const l = lireEvenement(type, ID, corps, MAINTENANT);
    if (!l.ok) throw new Error(`refusé : ${l.raison}`);
    return l.evenement;
  };

  it("pull_request : clé repo#n, état brouillon puis fusionnée, titre et lien gardés", () => {
    const base = { number: 700, title: "Une PR", html_url: "https://github.com/MoKarade/Hubperso/pull/700", updated_at: "2026-10-28T20:00:00Z" };
    const draft = ok("pull_request", { action: "converted_to_draft", repository: depot("Hubperso"), pull_request: { ...base, draft: true } });
    expect(draft).toMatchObject({ v: 1, id: ID, repo: "hub", n: 700, cle: "hub#700", etat: "brouillon", at: "2026-10-28T20:00:00.000Z", plus: { t: "Une PR" } });
    const pret = ok("pull_request", { action: "ready_for_review", repository: depot("Hubperso"), pull_request: { ...base, draft: false } });
    expect(pret.etat).toBe("ouverte");
    const fusion = ok("pull_request", { action: "closed", repository: depot("Hubperso"), pull_request: { ...base, merged: true, merged_at: "2026-10-28T20:42:52Z", closed_at: "2026-10-28T20:42:53Z" } });
    expect(fusion).toMatchObject({ etat: "fusionnee", at: "2026-10-28T20:42:52.000Z" });
    const fermee = ok("pull_request", { action: "closed", repository: depot("Hubperso"), pull_request: { ...base, merged: false, closed_at: "2026-10-28T20:50:00Z" } });
    expect(fermee).toMatchObject({ etat: "fermee", at: "2026-10-28T20:50:00.000Z" });
  });

  it("issues : étiquette gardée, état fermée à la clôture", () => {
    const e = ok("issues", { action: "labeled", repository: depot("batchchef-"), label: { name: "boucle:erreur" }, issue: { number: 12, title: "T", state: "open", updated_at: "2026-10-28T20:00:00Z" } });
    expect(e).toMatchObject({ repo: "batch", cle: "batch#12", etat: "ouverte", plus: { lb: "boucle:erreur" } });
    expect(ok("issues", { action: "closed", repository: depot(".github"), issue: { number: 3, state: "closed", updated_at: "2026-10-28T20:00:00Z" } }).etat).toBe("fermee");
  });

  it("workflow_run : clé repo:nom, conclusion, numéro de PR quand il y en a un", () => {
    const e = ok("workflow_run", { action: "completed", repository: depot(), workflow_run: { name: "CI", conclusion: "failure", head_sha: "abcdef1234567", head_branch: "main", updated_at: "2026-10-28T20:00:00Z", pull_requests: [{ number: 9 }] } });
    expect(e).toMatchObject({ repo: "drive", cle: "drive:CI", n: 9, sha: "abcdef1234567", etat: "failure", plus: { b: "main" } });
  });

  it("check_suite et deployment_status : clé repo@sha court", () => {
    expect(ok("check_suite", { action: "completed", repository: depot("CarAI"), check_suite: { head_sha: "1234567890abc", conclusion: "success", updated_at: "2026-10-28T20:00:00Z", pull_requests: [] } })).toMatchObject({ cle: "car@1234567", etat: "success", n: null });
    expect(ok("deployment_status", { action: "created", repository: depot("Hubperso"), deployment: { sha: "161af7cd4edb", environment: "Production" }, deployment_status: { state: "error", created_at: "2026-10-28T20:00:00Z", environment: "Production" } })).toMatchObject({ cle: "hub@161af7c", etat: "error", plus: { env: "Production" } });
  });

  it("issue_comment : seul « Acceptée » est retenu, et le corps du commentaire n'est pas gardé", () => {
    const base = { action: "created", repository: depot("MemoryAI"), issue: { number: 5, title: "T" } };
    const e = ok("issue_comment", { ...base, comment: { body: "Acceptée — preuve : 200 en production, mot de passe: hunter2", created_at: "2026-10-28T20:00:00Z", html_url: "https://github.com/x" } });
    expect(e).toMatchObject({ cle: "mem#5", etat: "acceptee" });
    expect(JSON.stringify(e)).not.toContain("hunter2");
    expect(lireEvenement("issue_comment", ID, { ...base, comment: { body: "merci", created_at: "2026-10-28T20:00:00Z" } }, MAINTENANT)).toMatchObject({ ok: false, ignore: true });
  });

  it("merge_group, dependabot_alert et repository_dispatch", () => {
    expect(ok("merge_group", { action: "checks_requested", repository: depot("Hubperso"), merge_group: { head_sha: "9999999aaaaa", head_commit: { timestamp: "2026-10-28T20:00:00Z" } } })).toMatchObject({ cle: "hub@9999999", etat: "en_file" });
    expect(ok("dependabot_alert", { action: "created", repository: depot("JobAI"), alert: { number: 4, state: "open", updated_at: "2026-10-28T20:00:00Z", security_advisory: { severity: "high", summary: "S" } } })).toMatchObject({ cle: "job:alerte-4", etat: "open", plus: { sev: "high" } });
    expect(ok("repository_dispatch", { action: "fin-de-cron", repository: depot("CarAI"), client_payload: { etat: "ok" } })).toMatchObject({ cle: "car:fin-de-cron", etat: "ok", at: MAINTENANT.toISOString() });
  });

  it("ignore à voix haute : ping, type non retenu, action non retenue", () => {
    expect(lireEvenement("ping", ID, {}, MAINTENANT)).toMatchObject({ ok: false, ignore: true });
    expect(lireEvenement("push", ID, {}, MAINTENANT)).toMatchObject({ ok: false, ignore: true });
    expect(lireEvenement("pull_request", ID, { action: "synchronize", repository: depot(), pull_request: { number: 1 } }, MAINTENANT)).toMatchObject({ ok: false, ignore: true });
  });

  it("refuse, sans ranger à moitié : dépôt inconnu, numéro absent, heure illisible, livraison illisible", () => {
    const refus = (type: string, corps: unknown, livraison = ID) => lireEvenement(type, livraison, corps, MAINTENANT);
    expect(refus("issues", { action: "opened", repository: depot("autre"), issue: { number: 1, updated_at: "2026-10-28T20:00:00Z" } })).toMatchObject({ ok: false, ignore: false });
    expect(refus("issues", { action: "opened", repository: depot(), issue: { updated_at: "2026-10-28T20:00:00Z" } })).toMatchObject({ ok: false, ignore: false });
    expect(refus("issues", { action: "opened", repository: depot(), issue: { number: 1, updated_at: "hier" } })).toMatchObject({ ok: false, ignore: false });
    expect(refus("issues", { action: "opened", repository: depot(), issue: { number: 1, updated_at: "2026-10-28T20:00:00Z" } }, "")).toMatchObject({ ok: false, ignore: false });
    expect(refus("issues", [])).toMatchObject({ ok: false, ignore: false });
  });
});

const moq = vi.hoisted(() => ({
  baseConfiguree: vi.fn(() => true),
  assurerMigrations: vi.fn(async () => {}),
  ranger: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ baseConfiguree: moq.baseConfiguree }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: moq.assurerMigrations }));
vi.mock("@/lib/chantierEvenementsDb", () => ({ ranger: moq.ranger }));

import { POST } from "@/app/api/chantier/evenement/route";

const PR = JSON.stringify({ action: "ready_for_review", repository: depot("Hubperso"), pull_request: { number: 7, title: "T", draft: false, updated_at: "2026-10-28T20:00:00Z" } });
let ip = 0;
function requete(corps: string, entetes: Record<string, string> = {}, signature: string | null = signer(corps, SECRET)) {
  const headers = new Headers({ "x-real-ip": `10.7.0.${++ip}`, "x-github-event": "pull_request", "x-github-delivery": ID, ...entetes });
  if (signature) headers.set("x-hub-signature-256", signature);
  return new Request("https://hubperso.com/api/chantier/evenement", { method: "POST", headers, body: corps });
}

beforeEach(() => {
  moq.baseConfiguree.mockReset().mockReturnValue(true);
  moq.assurerMigrations.mockReset().mockResolvedValue(undefined);
  moq.ranger.mockReset().mockResolvedValue({ nouveau: true });
  vi.stubEnv("CHANTIER_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/chantier/evenement", () => {
  it("secret absent côté hub : 503, jamais 401, rien n'est rangé", async () => {
    vi.stubEnv("CHANTIER_WEBHOOK_SECRET", "");
    expect((await POST(requete(PR))).status).toBe(503);
    expect(moq.ranger).not.toHaveBeenCalled();
  });

  it("signature absente, fausse ou d'un autre corps : 401 et rien n'est rangé", async () => {
    expect((await POST(requete(PR, {}, null))).status).toBe(401);
    expect((await POST(requete(PR, {}, signer(PR, "autre")))).status).toBe(401);
    expect((await POST(requete(PR, {}, signer(PR + " ", SECRET)))).status).toBe(401);
    expect(moq.ranger).not.toHaveBeenCalled();
  });

  it("événement signé : rangé, 200 nouveau:true ; un renvoi : 200 nouveau:false", async () => {
    const r = await POST(requete(PR));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, nouveau: true });
    expect(moq.ranger).toHaveBeenCalledWith(expect.objectContaining({ id: ID, cle: "hub#7", etat: "ouverte" }));
    moq.ranger.mockResolvedValue({ nouveau: false });
    expect(await (await POST(requete(PR))).json()).toEqual({ ok: true, nouveau: false });
  });

  it("ping ou type non retenu : 200 ignore, rien n'est rangé ; retenu mais illisible : 422", async () => {
    const ping = await POST(requete("{}", { "x-github-event": "ping" }));
    expect(await ping.json()).toMatchObject({ ok: true, ignore: true });
    expect(moq.ranger).not.toHaveBeenCalled();
    const mauvais = JSON.stringify({ action: "opened", repository: depot("Hubperso"), issue: { updated_at: "2026-10-28T20:00:00Z" } });
    expect((await POST(requete(mauvais, { "x-github-event": "issues" }))).status).toBe(422);
  });

  it("corps trop gros 413 ; JSON illisible 400 (signé quand même)", async () => {
    expect((await POST(requete(PR, { "content-length": "3000000" }))).status).toBe(413);
    expect((await POST(requete("pas du json"))).status).toBe(400);
  });

  it("sans base : 503 ; base en panne : 500, jamais un 200 qui la cache", async () => {
    moq.baseConfiguree.mockReturnValue(false);
    expect((await POST(requete(PR))).status).toBe(503);
    moq.baseConfiguree.mockReturnValue(true);
    moq.ranger.mockRejectedValue(new Error("neon indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await POST(requete(PR));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("neon indisponible");
  });
});
