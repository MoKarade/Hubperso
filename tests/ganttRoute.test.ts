// tests/ganttRoute.test.ts — POST /api/gantt, la réception du relevé envoyé par le PC.
//
// Même montage que tests/cronReleve.test.ts. Ce qu'on éprouve de bout en bout :
//   - GANTT_SECRET absent → 503 (jamais 401), secret absent ou faux → 401, rien n'est écrit ;
//   - comparaison par `memeJeton` (temps constant) ;
//   - corps trop gros → 413, illisible ou incomplet → 400 : la base n'est PAS touchée ;
//   - sans base → 503 ; écriture qui échoue → 500 (jamais un 200 qui cache la panne) ;
//   - limite de débit → 429.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAILLE_MAX_OCTETS } from "@/lib/gantt";

const SECRET = "secret-de-test-gantt-0123456789ab";

const moq = vi.hoisted(() => ({
  baseConfiguree: vi.fn(() => true),
  assurerMigrations: vi.fn(async () => {}),
  enregistrerGantt: vi.fn(),
  memeJeton: vi.fn(),
  pousser: vi.fn(async () => "envoye"),
  apres: [] as Array<() => Promise<void> | void>,
}));

vi.mock("@/lib/db", () => ({ baseConfiguree: moq.baseConfiguree }));
vi.mock("@/lib/migrations", () => ({ assurerMigrations: moq.assurerMigrations }));
vi.mock("@/lib/ganttDb", () => ({ enregistrerGantt: moq.enregistrerGantt }));
// `after` n'existe que dans une requête Next : on garde son callback pour le lancer à la main, comme après la réponse.
vi.mock("next/server", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("next/server")>();
  return { ...vrai, after: (f: () => Promise<void> | void) => void moq.apres.push(f) };
});
vi.mock("@/lib/chantierSortiesEnvoi", () => ({ pousserSortiesChantier: moq.pousser }));
vi.mock("@/lib/jetonApp", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/jetonApp")>();
  moq.memeJeton.mockImplementation(vrai.memeJeton);
  return { ...vrai, memeJeton: moq.memeJeton };
});

import { POST } from "@/app/api/gantt/route";

const envoi = () => ({
  v: 1,
  envoye: "2026-10-22T20:50:00Z",
  donnees_gz_b64: "H4sIAAAAAAAAA6tWKkktLlGyUlAqS8wpTVWqBQAbuQNdFgAAAA==",
  etat: { ecrit: true },
  fiabilite: { score: 0.98 },
  prochaines: { financeai: [] },
  quota: { restant: 12 },
});

let ip = 0;
/** Chaque requête vient d'un client distinct : la limite de débit ne se mélange pas aux cas. */
function requete(authorization?: string, corps: string = JSON.stringify(envoi()), client = `10.1.0.${++ip}`) {
  const headers = new Headers({ "x-real-ip": client });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://hubperso.com/api/gantt", { method: "POST", headers, body: corps });
}

beforeEach(() => {
  vi.stubEnv("GANTT_SECRET", SECRET);
  moq.enregistrerGantt.mockResolvedValue("2026-10-22T20:50:03.000Z");
  moq.apres.length = 0;
  moq.pousser.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  moq.baseConfiguree.mockReset().mockReturnValue(true);
  moq.assurerMigrations.mockReset();
  moq.enregistrerGantt.mockReset();
  moq.memeJeton.mockClear();
});

function rienEcrit() {
  expect(moq.assurerMigrations).not.toHaveBeenCalled();
  expect(moq.enregistrerGantt).not.toHaveBeenCalled();
}

describe("POST /api/gantt — authentification", () => {
  it("GANTT_SECRET absent côté serveur : 503, réception désactivée, rien écrit", async () => {
    vi.stubEnv("GANTT_SECRET", "");
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
    rienEcrit();
  });

  it("sans en-tête Authorization : 401, rien écrit", async () => {
    expect((await POST(requete())).status).toBe(401);
    rienEcrit();
  });

  it("secret faux : 401, et le corps ne renvoie jamais le secret attendu", async () => {
    const res = await POST(requete("Bearer mauvais-secret"));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(SECRET);
    rienEcrit();
  });

  it("le secret d'une autre route (CRON_SECRET) n'ouvre pas celle-ci", async () => {
    vi.stubEnv("CRON_SECRET", "secret-de-test-horloge-autre-route");
    const res = await POST(requete("Bearer secret-de-test-horloge-autre-route"));
    expect(res.status).toBe(401);
    rienEcrit();
  });

  it("le secret est comparé par memeJeton (temps constant), jamais par ===", async () => {
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(moq.memeJeton).toHaveBeenCalledWith(SECRET, SECRET);
  });
});

describe("POST /api/gantt — réception", () => {
  it("succès : migrations, puis écriture de l'envoi tel quel, et l'heure de réception rendue", async () => {
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recu: "2026-10-22T20:50:03.000Z" });
    expect(moq.assurerMigrations).toHaveBeenCalledTimes(1);
    expect(moq.enregistrerGantt).toHaveBeenCalledWith(envoi());
  });

  it("après la réponse, le hub pousse l'état du chantier à MemoryAI avec le jeton dédié ; sans envoi valide, rien n'est poussé", async () => {
    vi.stubEnv("MEMORYAI_SORTIES_TOKEN", "jeton-de-test-sorties-0123456789");
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(moq.pousser).not.toHaveBeenCalled(); // pas avant la réponse
    expect(moq.apres).toHaveLength(1);
    await moq.apres[0]!();
    expect(moq.pousser).toHaveBeenCalledWith(
      expect.objectContaining({ donneesGzB64: envoi().donnees_gz_b64, jeton: "jeton-de-test-sorties-0123456789", maintenant: expect.any(Date) }),
    );
    moq.apres.length = 0;
    await POST(requete("Bearer faux"));
    await POST(requete(`Bearer ${SECRET}`, "pas du json"));
    expect(moq.apres).toHaveLength(0);
  });

  it("une écriture en base qui échoue ne pousse rien", async () => {
    moq.enregistrerGantt.mockRejectedValue(new Error("base"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(requete(`Bearer ${SECRET}`))).status).toBe(500);
    expect(moq.apres).toHaveLength(0);
  });

  it("sans base : 503, rien écrit", async () => {
    moq.baseConfiguree.mockReturnValue(false);
    expect((await POST(requete(`Bearer ${SECRET}`))).status).toBe(503);
    rienEcrit();
  });

  it("JSON illisible : 400, rien écrit (le dernier relevé reste)", async () => {
    const res = await POST(requete(`Bearer ${SECRET}`, "{pas du json"));
    expect(res.status).toBe(400);
    rienEcrit();
  });

  it("envoi incomplet : 400 qui nomme le champ, rien écrit", async () => {
    const sansQuota: Record<string, unknown> = envoi();
    delete sansQuota.quota;
    const res = await POST(requete(`Bearer ${SECRET}`, JSON.stringify(sansQuota)));
    expect(res.status).toBe(400);
    expect((await res.json()).raison).toContain("quota");
    rienEcrit();
  });

  it("corps annoncé trop gros : 413 sans même le lire", async () => {
    const r = requete(`Bearer ${SECRET}`);
    r.headers.set("content-length", String(TAILLE_MAX_OCTETS + 1));
    expect((await POST(r)).status).toBe(413);
    rienEcrit();
  });

  it("corps réellement trop gros malgré un en-tête discret : 413", async () => {
    const gros = JSON.stringify({ ...envoi(), etat: { x: "a".repeat(TAILLE_MAX_OCTETS) } });
    expect((await POST(requete(`Bearer ${SECRET}`, gros))).status).toBe(413);
    rienEcrit();
  });

  it("écriture qui échoue : 500, jamais un 200 qui cache la panne", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    moq.enregistrerGantt.mockRejectedValue(new Error("relation absente"));
    const res = await POST(requete(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});

describe("POST /api/gantt — limite de débit", () => {
  it("au-delà de 10 appels par minute pour un même client : 429, avant toute vérification", async () => {
    const client = "192.0.2.88";
    for (let i = 0; i < 10; i++) {
      expect((await POST(requete("Bearer faux", undefined, client))).status).toBe(401);
    }
    moq.memeJeton.mockClear();
    const res = await POST(requete(`Bearer ${SECRET}`, undefined, client));
    expect(res.status).toBe(429);
    expect(moq.memeJeton).not.toHaveBeenCalled();
    rienEcrit();
  });
});
