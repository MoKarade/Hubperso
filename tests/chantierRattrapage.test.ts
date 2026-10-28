// tests/chantierRattrapage.test.ts — le rattrapage GitHub de la page Chantier (lib/chantierRattrapage.ts).
//
// On éprouve ce que les fonctions RENDENT : l'état courant d'une issue ou d'une PR sous forme d'événement `snapshot`, la preuve
// « Acceptée » retrouvée dans les commentaires (lien et heure, jamais le corps), et la lecture des dépôts : un dépôt illisible ou
// tronqué est DIT, les autres sont lus, aucune PR n'est confondue avec une issue.

import { describe, expect, it } from "vitest";
import { DEPOTS } from "@/lib/chantierEvenements";
import { lireAcceptee, rattraper, snapshotIssue, snapshotPr, type Api } from "@/lib/chantierRattrapage";

const issue = (n: number, plus: Record<string, unknown> = {}) => ({
  number: n,
  title: `tâche ${n}`,
  html_url: `https://github.com/MoKarade/Hubperso/issues/${n}`,
  state: "open",
  labels: [{ name: "niveau:tâche" }, "en-cours"],
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T21:00:00Z",
  closed_at: null,
  ...plus,
});

describe("lireAcceptee : la preuve « Acceptée »", () => {
  it("rend le lien et l'heure du dernier commentaire qui commence par « Acceptée », jamais son corps", () => {
    const r = lireAcceptee([
      { body: "Acceptée — preuve 1", html_url: "https://github.com/x/y/issues/1#issuecomment-1", created_at: "2026-10-28T18:00:00Z" },
      { body: "un commentaire", html_url: "https://github.com/x/y/issues/1#issuecomment-2", created_at: "2026-10-28T19:00:00Z" },
      { body: "**Acceptée** (relue)", html_url: "https://github.com/x/y/issues/1#issuecomment-3", created_at: "2026-10-28T20:00:00Z" },
    ]);
    expect(r).toEqual({ u: "https://github.com/x/y/issues/1#issuecomment-3", c: "2026-10-28T20:00:00.000Z" });
  });

  it("sans « Acceptée », ou sur une réponse illisible : null (aucune preuve inventée)", () => {
    expect(lireAcceptee([{ body: "pas encore acceptée", html_url: "https://g/1", created_at: "2026-10-28T18:00:00Z" }])).toBeNull();
    expect(lireAcceptee([{ body: "Acceptée", created_at: "2026-10-28T18:00:00Z" }])).toBeNull();
    expect(lireAcceptee("oups")).toBeNull();
    expect(lireAcceptee(null)).toBeNull();
  });
});

describe("snapshotIssue / snapshotPr", () => {
  it("une issue ouverte : titre, lien, étiquettes, création ; pas de fin ni de preuve", () => {
    const e = snapshotIssue("hub", issue(5), null)!;
    expect(e).toMatchObject({ v: 1, type: "issues", action: "snapshot", repo: "hub", n: 5, cle: "hub#5", at: "2026-10-28T21:00:00.000Z", etat: "ouverte", sha: null });
    // l'identifiant dit aussi le type : une issue et une PR de même numéro ne s'écrasent pas
    expect(e.id).toBe("snap:issues:hub#5:2026-10-28T21:00:00.000Z");
    expect(snapshotPr("hub", { number: 5, updated_at: "2026-10-28T21:00:00Z", state: "open" })!.id).toBe("snap:pr:hub#5:2026-10-28T21:00:00.000Z");
    expect(e.plus).toEqual({ t: "tâche 5", u: "https://github.com/MoKarade/Hubperso/issues/5", labs: JSON.stringify(["niveau:tâche", "en-cours"]), cr: "2026-10-28T10:00:00.000Z" });
  });

  it("une issue fermée : la fin est celle de GitHub, la preuve est jointe quand elle a été lue", () => {
    const acc = { u: "https://github.com/x/y/issues/5#issuecomment-9", c: "2026-10-28T20:30:00.000Z" };
    const e = snapshotIssue("hub", issue(5, { state: "closed", closed_at: "2026-10-28T20:31:00Z" }), acc)!;
    expect(e.etat).toBe("fermee");
    expect(e.plus).toMatchObject({ fin: "2026-10-28T20:31:00.000Z", acc: JSON.stringify(acc) });
  });

  it("une PR n'est jamais une issue ; une réponse sans numéro ou sans date ne donne rien", () => {
    expect(snapshotIssue("hub", issue(5, { pull_request: { url: "x" } }), null)).toBeNull();
    expect(snapshotIssue("hub", { title: "sans numéro", updated_at: "2026-10-28T21:00:00Z" }, null)).toBeNull();
    expect(snapshotIssue("hub", issue(5, { updated_at: "hier" }), null)).toBeNull();
    expect(snapshotIssue("hub", "oups", null)).toBeNull();
  });

  it("une PR : brouillon, ouverte, fusionnée (à l'heure de la fusion) ou fermée sans fusion", () => {
    const pr = (plus: Record<string, unknown>) => ({ number: 20, title: "feat", html_url: "https://github.com/x/y/pull/20", state: "open", draft: false, merged_at: null, closed_at: null, updated_at: "2026-10-28T21:00:00Z", ...plus });
    expect(snapshotPr("hub", pr({ draft: true }))!.etat).toBe("brouillon");
    expect(snapshotPr("hub", pr({}))!.etat).toBe("ouverte");
    const fus = snapshotPr("hub", pr({ state: "closed", merged_at: "2026-10-28T20:50:00Z", closed_at: "2026-10-28T20:50:00Z" }))!;
    expect(fus).toMatchObject({ type: "pull_request", action: "snapshot", etat: "fusionnee", at: "2026-10-28T20:50:00.000Z", n: 20 });
    const fer = snapshotPr("hub", pr({ state: "closed", closed_at: "2026-10-28T20:40:00Z" }))!;
    expect(fer).toMatchObject({ etat: "fermee", at: "2026-10-28T20:40:00.000Z" });
    expect(snapshotPr("hub", { title: "x" })).toBeNull();
  });
});

const MAINTENANT = new Date("2026-10-28T22:00:00Z");

/** Une fausse API GitHub : les chemins lus sont notés, chaque dépôt répond ce qu'on lui a donné. */
function fausseApi(parDepot: Record<string, { issues?: unknown[]; pulls?: unknown[]; comments?: Record<number, unknown[]>; panne?: string }>) {
  const lus: string[] = [];
  const api: Api = async (chemin) => {
    lus.push(chemin);
    const m = /^\/repos\/MoKarade\/([^/?]+)\/(issues|pulls)(?:\/(\d+)\/comments)?/.exec(chemin);
    if (!m) throw new Error("chemin inattendu " + chemin);
    // GitHub ne tient pas compte de la casse d'un nom de dépôt : les noms de DEPOTS sont en minuscules
    const d = Object.entries(parDepot).find(([nom]) => nom.toLowerCase() === decodeURIComponent(m[1]!).toLowerCase())?.[1] ?? {};
    if (d.panne) throw new Error(d.panne);
    if (m[3]) return d.comments?.[Number(m[3])] ?? [];
    const page = Number(/[?&]page=(\d+)/.exec(chemin)![1]);
    const toutes = (m[2] === "issues" ? d.issues : d.pulls) ?? [];
    return toutes.slice((page - 1) * 100, page * 100);
  };
  return { api, lus };
}

describe("rattraper", () => {
  it("lit les issues et les PR de chaque dépôt, retrouve la preuve d'une tâche fermée, trie par heure", async () => {
    const { api, lus } = fausseApi({
      Hubperso: {
        issues: [
          issue(5, { updated_at: "2026-10-28T21:30:00Z" }),
          issue(6, { state: "closed", closed_at: "2026-10-28T20:31:00Z", updated_at: "2026-10-28T20:32:00Z" }),
          issue(20, { pull_request: { url: "x" }, updated_at: "2026-10-28T21:45:00Z" }),
        ],
        pulls: [{ number: 20, title: "feat", html_url: "u", state: "open", draft: false, updated_at: "2026-10-28T21:45:00Z" }],
        comments: { 6: [{ body: "Acceptée", html_url: "https://github.com/MoKarade/Hubperso/issues/6#issuecomment-1", created_at: "2026-10-28T20:30:00Z" }] },
      },
    });
    const r = await rattraper({ api, depuis: new Date("2026-10-28T20:00:00Z"), maintenant: MAINTENANT });
    expect(r.erreurs).toEqual([]);
    expect(r.incomplets).toEqual([]);
    expect(r.evenements.map((e) => `${e.type}:${e.n}`)).toEqual(["issues:6", "issues:5", "pull_request:20"]);
    expect(r.evenements[0]!.plus!.acc).toContain("issuecomment-1");
    expect(r.evenements[1]!.plus!.acc).toBeUndefined();
    // les 11 dépôts du projet sont lus, une seule fois chacun pour les issues et pour les PR
    expect(lus.filter((c) => c.includes("/issues?"))).toHaveLength(Object.keys(DEPOTS).length);
    expect(lus.filter((c) => c.includes("/pulls?"))).toHaveLength(Object.keys(DEPOTS).length);
    expect(lus.find((c) => c.includes("/issues?"))).toContain("since=2026-10-28T20%3A00%3A00.000Z");
  });

  it("un dépôt illisible est nommé et n'arrête pas les autres ; rien n'est présenté comme complet", async () => {
    const { api } = fausseApi({ Hubperso: { issues: [issue(5)] }, JobAI: { panne: "HTTP 403" } });
    const r = await rattraper({ api, depuis: null, maintenant: MAINTENANT });
    expect(r.erreurs).toEqual(["job : HTTP 403"]);
    expect(r.evenements.map((e) => e.cle)).toEqual(["hub#5"]);
  });

  it("une liste qui atteint la limite de pages est dite incomplète", async () => {
    const beaucoup = Array.from({ length: 300 }, (_, i) => issue(i + 1, { updated_at: "2026-10-28T21:00:00Z" }));
    const { api } = fausseApi({ FinanceAI: { issues: beaucoup } });
    const r = await rattraper({ api, depuis: new Date("2026-10-28T20:00:00Z"), maintenant: MAINTENANT });
    expect(r.incomplets).toEqual(["fin"]);
    expect(r.evenements).toHaveLength(300);
  });

  it("sans `depuis` ou avec un `depuis` plus vieux que 14 jours : la fenêtre est de 14 jours au plus", async () => {
    const { api, lus } = fausseApi({});
    await rattraper({ api, depuis: new Date("2026-01-01T00:00:00Z"), maintenant: MAINTENANT });
    expect(lus.find((c) => c.includes("/issues?"))).toContain("since=2026-10-14T22%3A00%3A00.000Z");
  });

  it("une PR plus ancienne que `depuis` n'est pas rendue ; la lecture des PR s'arrête quand la dernière est déjà d'avant", async () => {
    const { api, lus } = fausseApi({
      Hubperso: {
        pulls: [
          { number: 21, title: "neuve", html_url: "u", state: "open", draft: false, updated_at: "2026-10-28T21:00:00Z" },
          { number: 19, title: "vieille", html_url: "u", state: "closed", merged_at: "2026-10-27T10:00:00Z", updated_at: "2026-10-27T10:00:00Z" },
        ],
      },
    });
    const r = await rattraper({ api, depuis: new Date("2026-10-28T20:00:00Z"), maintenant: MAINTENANT });
    expect(r.evenements.map((e) => e.n)).toEqual([21]);
    expect(lus.filter((c) => c.includes("/hubperso/pulls"))).toHaveLength(1);
  });
});
