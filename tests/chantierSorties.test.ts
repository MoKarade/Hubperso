// tests/chantierSorties.test.ts — l'état du chantier mis en sorties pour MemoryAI (Hubperso#651).
// Ce qu'on éprouve : le décodage du relevé, les événements (bornes de la porte de MemoryAI, rien d'inventé, états lus dans les
// étiquettes), l'identité par empreinte, un renvoi identique (même empreinte), l'envoi (jeton en Bearer, jamais d'`app` dans le corps)
// et ses échecs, qui ne lèvent jamais.

import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  corpsSorties,
  decoderReleve,
  EVENEMENTS_MAX,
  evenementsChantier,
  NIVEAU,
  RESUME_MAX,
  sortieDepuisWebhook,
  TITRE_MAX,
  TYPE_APP,
  TYPE_EVENEMENT,
  TYPE_MISSION,
} from "@/lib/chantierSorties";
import { lireEvenement } from "@/lib/chantierEvenements";
import { DELAI_ENVOI_MS, pousserSortieWebhook, pousserSortiesChantier } from "@/lib/chantierSortiesEnvoi";

const MAINTENANT = new Date("2026-10-28T18:05:00Z");

const releve = () => ({
  repos: [
    {
      repo: "Hubperso",
      name: "Hubperso",
      nodes: [
        { n: 575, t: "Mission trop longue ".repeat(20), l: "mission", st: "open", k: [644, "hubperso#651", 700, 9999] },
        { n: 644, t: "Faits du Gantt", l: "tâche", st: "open", lb: ["en-cours"] },
        { n: 651, t: "Le hub pousse <b>le chantier</b>", l: "tâche", st: "open", lb: ["qui:marc"] },
        { n: 700, t: "Fini", l: "tâche", st: "closed", lb: [] },
        { n: 5, t: "Mission fermée", l: "mission", st: "closed", k: [] },
      ],
    },
    { repo: "batchchef-", name: "BatchChef", nodes: [{ n: 1, t: "Une tâche", l: "tâche", st: "open", lb: [] }] },
  ],
});
const gz = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o), "utf8")).toString("base64");

afterEach(() => vi.restoreAllMocks());

describe("decoderReleve", () => {
  it("rend le JSON d'un gzip en base64, null pour tout le reste", () => {
    expect(decoderReleve(gz(releve()))).toEqual(releve());
    expect(decoderReleve("pas un gzip")).toBeNull();
    expect(decoderReleve(Buffer.from("x".repeat(40)).toString("base64"))).toBeNull();
    expect(decoderReleve(gzipSync(Buffer.from("pas du json")).toString("base64"))).toBeNull();
  });
});

describe("evenementsChantier", () => {
  const ev = evenementsChantier(releve(), MAINTENANT);

  it("une ligne par app et une par mission ouverte, au niveau 1, datées de maintenant", () => {
    expect(ev.filter((e) => e.type === TYPE_APP).map((e) => e.titre)).toEqual(["Hubperso : état du chantier", "BatchChef : état du chantier"]);
    const missions = ev.filter((e) => e.type === TYPE_MISSION);
    expect(missions).toHaveLength(1); // la mission fermée ne part pas
    expect(ev.every((e) => e.niveau === NIVEAU && e.date === "2026-10-28T18:05:00.000Z")).toBe(true);
  });

  it("les états sont lus dans les étiquettes, les comptes viennent du relevé", () => {
    const app = ev.find((e) => e.titre.startsWith("Hubperso"))!;
    expect(app.resume).toContain("1 mission ouverte");
    expect(app.resume).toContain("3 tâches : 1 terminée, 1 en cours, 1 attend Marc");
    const m = ev.find((e) => e.type === TYPE_MISSION)!;
    expect(m.resume).toContain("3 tâches : 1 terminée, 1 en cours, 1 attend Marc"); // 9999 est inconnu du relevé : jamais compté ; 651 est lu par « repo#n »
    expect(m.resume).toContain("« Faits du Gantt » en cours");
    expect(m.resume).not.toContain("Fini"); // une tâche terminée n'est plus « à suivre »
  });

  it("les bornes de la porte de MemoryAI tiennent (titre 120, résumé 600), sans balise ni caractère de contrôle", () => {
    ev.forEach((e) => {
      expect(e.titre.length).toBeLessThanOrEqual(TITRE_MAX);
      expect(e.resume.length).toBeLessThanOrEqual(RESUME_MAX);
      expect(e.type).toMatch(/^[a-z0-9_]{1,40}$/);
      expect(e.ref).toMatch(/^[\x21-\x7e]{1,80}$/);
    });
    expect(JSON.stringify(ev)).not.toContain("<b>");
    expect(JSON.stringify(ev)).not.toContain("\n");
  });

  it("la ref porte l'empreinte de l'état : même état, même ref ; état changé, ref neuve", () => {
    const r = releve();
    const encore = evenementsChantier(r, new Date("2026-10-28T19:05:00Z"));
    expect(encore.map((e) => e.ref)).toEqual(ev.map((e) => e.ref));
    r.repos[0]!.nodes[1]!.lb = ["preuve-attendue"];
    const change = evenementsChantier(r, MAINTENANT);
    expect(change.find((e) => e.type === TYPE_MISSION)!.ref).not.toBe(ev.find((e) => e.type === TYPE_MISSION)!.ref);
  });

  it("au plus 50 événements, les missions les plus chargées d'abord ; un relevé illisible donne une liste vide", () => {
    const nodes: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= 80; i++) {
      nodes.push({ n: 1000 + i, t: `Mission ${i}`, l: "mission", st: "open", k: Array.from({ length: i }, (_, j) => 5000 + i * 100 + j) });
      for (let j = 0; j < i; j++) nodes.push({ n: 5000 + i * 100 + j, t: "t", l: "tâche", st: "open", lb: [] });
    }
    const gros = evenementsChantier({ repos: [{ repo: "X", name: "X", nodes }] }, MAINTENANT);
    expect(gros).toHaveLength(EVENEMENTS_MAX);
    expect(gros[1]!.titre).toContain("Mission 80"); // après la ligne de l'app
    for (const faux of [null, 3, "x", {}, { repos: "non" }, { repos: [null, 4, { repo: 5 }] }]) expect(evenementsChantier(faux, MAINTENANT)).toEqual([]);
  });

  it("le corps n'a ni `app` ni autre clé que source et evenements", () => {
    expect(Object.keys(corpsSorties(ev)).sort()).toEqual(["evenements", "source"]);
    expect(corpsSorties(ev).source).toBe("sorties");
  });
});

describe("pousserSortiesChantier", () => {
  const entree = (o: Partial<Parameters<typeof pousserSortiesChantier>[0]> = {}) => ({ donneesGzB64: gz(releve()), maintenant: MAINTENANT, jeton: "jeton-de-test-0123456789", ...o });
  const reponse = (status: number) => new Response("{}", { status });

  it("poste à /api/sorties de MemoryAI avec le jeton en Bearer et le corps des événements", async () => {
    const appeler = vi.fn(async () => reponse(200));
    expect(await pousserSortiesChantier(entree({ appeler: appeler as unknown as typeof fetch }))).toBe("envoye");
    const [url, init] = appeler.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://memoryai.hubperso.com/api/sorties");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer jeton-de-test-0123456789");
    const corps = JSON.parse(String(init.body));
    expect(corps.source).toBe("sorties");
    expect(corps.evenements.length).toBeGreaterThan(0);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(DELAI_ENVOI_MS).toBeLessThanOrEqual(10_000);
  });

  it("rien n'est envoyé sans jeton, ou si le relevé est illisible ou vide", async () => {
    const appeler = vi.fn(async () => reponse(200));
    const f = appeler as unknown as typeof fetch;
    expect(await pousserSortiesChantier(entree({ appeler: f, jeton: undefined }))).toBe("non-configure");
    expect(await pousserSortiesChantier(entree({ appeler: f, jeton: "  " }))).toBe("non-configure");
    expect(await pousserSortiesChantier(entree({ appeler: f, donneesGzB64: "H4sIpasdugzip" }))).toBe("releve-illisible");
    expect(await pousserSortiesChantier(entree({ appeler: f, donneesGzB64: gz({ repos: [] }) }))).toBe("rien-a-envoyer");
    expect(appeler).not.toHaveBeenCalled();
  });

  it("un refus ou une panne se disent au journal (code seulement) et ne lèvent jamais", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await pousserSortiesChantier(entree({ appeler: (async () => reponse(401)) as unknown as typeof fetch }))).toBe("refuse");
    expect(await pousserSortiesChantier(entree({ appeler: (async () => { throw new TypeError("réseau"); }) as unknown as typeof fetch }))).toBe("injoignable");
    const journal = JSON.stringify(erreur.mock.calls);
    expect(journal).toContain("401");
    expect(journal).not.toContain("jeton-de-test");
  });
});

describe("sortieDepuisWebhook (Hubperso#651 : le webhook lui-même, à l'instant où il arrive)", () => {
  const LIVRAISON = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
  const lire = (type: string, corps: unknown) => {
    const l = lireEvenement(type, LIVRAISON, corps, MAINTENANT);
    if (!l.ok) throw new Error(l.raison);
    return l.evenement;
  };
  const depot = { name: "Hubperso" };
  const pr = (titre: string) =>
    lire("pull_request", {
      action: "closed",
      repository: depot,
      pull_request: { number: 7, title: titre, merged: true, merged_at: "2026-10-28T20:00:00Z", updated_at: "2026-10-28T20:00:00Z", html_url: "https://github.com/MoKarade/Hubperso/pull/7" },
    });

  it("une PR fusionnée : titre et résumé lisibles, datés de l'événement, niveau 1, ni lien ni corps", () => {
    const s = sortieDepuisWebhook(pr("Le hub pousse"));
    expect(s).toMatchObject({ type: TYPE_EVENEMENT, date: "2026-10-28T20:00:00.000Z", niveau: NIVEAU, ref: `ev:${LIVRAISON}` });
    expect(s.titre).toBe("hub · hub#7 : pull_request closed");
    expect(s.resume).toBe("« Le hub pousse » · état fusionnee");
    expect(JSON.stringify(s)).not.toContain("https://");
  });

  it("la ref est l'identifiant de livraison : un rejeu a la même ref (MemoryAI ne le double pas), une autre livraison une ref neuve", () => {
    const a = sortieDepuisWebhook(pr("T"));
    expect(sortieDepuisWebhook(pr("T")).ref).toBe(a.ref);
    const autre = lireEvenement("pull_request", "ffffffff-0000-1111-2222-333333333333", { action: "closed", repository: depot, pull_request: { number: 7, title: "T", merged: true, merged_at: "2026-10-28T20:00:00Z", updated_at: "2026-10-28T20:00:00Z" } }, MAINTENANT);
    expect(autre.ok && sortieDepuisWebhook(autre.evenement).ref).not.toBe(a.ref);
  });

  it("les bornes de la porte de MemoryAI tiennent, sans balise ni retour à la ligne, même pour un titre hostile ou démesuré", () => {
    const s = sortieDepuisWebhook(pr(`<script>alert(1)</script>\n${"x".repeat(500)}`));
    expect(s.titre.length).toBeLessThanOrEqual(TITRE_MAX);
    expect(s.resume.length).toBeLessThanOrEqual(RESUME_MAX);
    expect(s.type).toMatch(/^[a-z0-9_]{1,40}$/);
    expect(s.ref).toMatch(/^[\x21-\x7e]{1,80}$/);
    expect(JSON.stringify(s)).not.toMatch(/<|\\n/);
  });

  it("un déploiement : environnement, état et commit court (le lien n'est pas gardé)", () => {
    const s = sortieDepuisWebhook(
      lire("deployment_status", { action: "created", repository: depot, deployment: { sha: "86ee546aaaaaaaa", environment: "Production" }, deployment_status: { state: "success", created_at: "2026-10-28T20:05:00Z", environment: "Production", target_url: "https://hubperso.com" } }),
    );
    expect(s.resume).toBe("état success · environnement Production · commit 86ee546");
  });

  it("un commentaire « Acceptée » : seul le titre de l'issue part, jamais le texte du commentaire", () => {
    const s = sortieDepuisWebhook(
      lire("issue_comment", { action: "created", repository: depot, issue: { number: 651, title: "Le hub pousse" }, comment: { body: "**Acceptée** — preuve secrète 12345", created_at: "2026-10-28T20:10:00Z" } }),
    );
    expect(JSON.stringify(s)).not.toContain("secrète");
    expect(s.resume).toBe("« Le hub pousse » · état acceptee");
  });
});

describe("pousserSortieWebhook", () => {
  const evenement = () => {
    const l = lireEvenement("pull_request", "0a1b2c3d-4e5f-6789", { action: "opened", repository: { name: "Hubperso" }, pull_request: { number: 7, title: "T", updated_at: "2026-10-28T20:00:00Z" } }, MAINTENANT);
    if (!l.ok) throw new Error(l.raison);
    return l.evenement;
  };
  const reponse = (status: number) => new Response("{}", { status });

  it("poste UN événement à /api/sorties avec le jeton en Bearer, sans `app` dans le corps", async () => {
    const appeler = vi.fn(async () => reponse(200));
    expect(await pousserSortieWebhook({ evenement: evenement(), jeton: "jeton-de-test-0123456789", appeler: appeler as unknown as typeof fetch })).toBe("envoye");
    const [url, init] = appeler.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://memoryai.hubperso.com/api/sorties");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer jeton-de-test-0123456789");
    const corps = JSON.parse(String(init.body));
    expect(Object.keys(corps).sort()).toEqual(["evenements", "source"]);
    expect(corps.evenements).toHaveLength(1);
    expect(corps.evenements[0].type).toBe(TYPE_EVENEMENT);
  });

  it("sans jeton rien ne part ; un refus ou une panne se disent au journal (code seulement) et ne lèvent jamais", async () => {
    const appeler = vi.fn(async () => reponse(200));
    expect(await pousserSortieWebhook({ evenement: evenement(), jeton: undefined, appeler: appeler as unknown as typeof fetch })).toBe("non-configure");
    expect(await pousserSortieWebhook({ evenement: evenement(), jeton: " ", appeler: appeler as unknown as typeof fetch })).toBe("non-configure");
    expect(appeler).not.toHaveBeenCalled();
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await pousserSortieWebhook({ evenement: evenement(), jeton: "jeton-de-test-0123456789", appeler: (async () => reponse(401)) as unknown as typeof fetch })).toBe("refuse");
    expect(await pousserSortieWebhook({ evenement: evenement(), jeton: "jeton-de-test-0123456789", appeler: (async () => { throw new TypeError("réseau"); }) as unknown as typeof fetch })).toBe("injoignable");
    const journal = JSON.stringify(erreur.mock.calls);
    expect(journal).toContain("401");
    expect(journal).not.toContain("jeton-de-test");
  });
});
