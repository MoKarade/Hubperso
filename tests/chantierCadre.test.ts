// tests/chantierCadre.test.ts — la page Chantier dans son cadre isolé : l'isolement, ce que le hub répond
// au cadre, et — surtout, ce dépôt étant PUBLIC — que le document servi ne porte AUCUNE donnée.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CSP_CADRE,
  MESSAGE_COUTS,
  MESSAGE_GESTE,
  MESSAGE_PRET,
  ONGLETS,
  SANDBOX_CADRE,
  URL_CADRE,
  URL_COUTS,
  URL_GESTES,
  URL_RELEVE,
  consigneDeReponse,
  erreurCouts,
  estGzip,
  estMessagePret,
  ongletDe,
} from "@/lib/chantierCadre";

const DOCUMENT = readFileSync(resolve(process.cwd(), "chantier", "cadre.html"), "utf8");

describe("l'isolement du cadre", () => {
  const directives = new Map(
    CSP_CADRE.split("; ").map((d) => [d.split(" ")[0]!, d.slice(d.indexOf(" ") + 1)] as const),
  );

  it("origine opaque : `sandbox` sans allow-same-origin ni navigation du hub, sur l'attribut ET dans la CSP", () => {
    for (const valeur of [SANDBOX_CADRE, directives.get("sandbox")!]) {
      expect(valeur).toContain("allow-scripts");
      expect(valeur).not.toContain("allow-same-origin");
      expect(valeur).not.toContain("allow-top-navigation");
      expect(valeur).not.toContain("allow-forms");
    }
  });

  it("aucun réseau, aucune ressource externe, et seul le hub peut la mettre en cadre", () => {
    expect(directives.get("default-src")).toBe("'none'");
    expect(directives.get("connect-src")).toBe("'none'");
    expect(directives.get("form-action")).toBe("'none'");
    expect(directives.get("frame-ancestors")).toBe("'self'");
    // `script-src` n'admet que le script du document lui-même : aucun hôte, aucun 'self'.
    expect(directives.get("script-src")).toBe("'unsafe-inline'");
    expect(CSP_CADRE).not.toMatch(/https?:/);
  });

  it("les deux adresses sont celles des routes du hub", () => {
    expect(URL_CADRE).toBe("/api/chantier/cadre");
    expect(URL_RELEVE).toBe("/api/chantier/releve");
  });
});

describe("consigneDeReponse", () => {
  it("200 : un relevé à poster ; 304 : rien à faire", () => {
    expect(consigneDeReponse(200)).toEqual({ type: "poster" });
    expect(consigneDeReponse(304)).toEqual({ type: "inchange" });
  });

  it("une absence n'est pas une panne, et une panne n'est pas une absence", () => {
    const aucun = consigneDeReponse(404);
    const panne = consigneDeReponse(500);
    expect(aucun).toMatchObject({ type: "etat", message: "Aucun relevé reçu pour l'instant." });
    expect(panne).toMatchObject({ type: "etat" });
    expect((panne as { message: string }).message).toContain("indisponible");
    expect((panne as { message: string }).message).not.toContain("Aucun relevé");
  });

  it.each([401, 429, 503, 500, 502])("%i : un message en clair pour le cadre", (status) => {
    const c = consigneDeReponse(status);
    expect(c.type).toBe("etat");
    expect((c as { message: string }).message.length).toBeGreaterThan(10);
  });
});

describe("estGzip", () => {
  it("reconnaît l'en-tête gzip (1f 8b) et rien d'autre", () => {
    const octets = (...o: number[]) => new Uint8Array(o).buffer;
    expect(estGzip(octets(0x1f, 0x8b, 8))).toBe(true);
    expect(estGzip(octets(0x7b, 0x22))).toBe(false); // « {" » : du JSON
    expect(estGzip(octets(0x1f))).toBe(false);
    expect(estGzip(octets())).toBe(false);
  });
});

describe("estMessagePret", () => {
  it("ne reconnaît que le message du cadre", () => {
    expect(estMessagePret({ type: MESSAGE_PRET })).toBe(true);
    for (const autre of [null, undefined, "chantier-pret", 3, {}, { type: "autre" }]) {
      expect(estMessagePret(autre), String(autre)).toBe(false);
    }
  });
});

// ── LE DOCUMENT SERVI : UN DÉPÔT PUBLIC NE PORTE AUCUNE DONNÉE ──────────────────────────
//
// `chantier/cadre.html` est la page de suivi telle qu'elle est publiée sur claude.ai, SANS ses données :
// le relevé arrive par le hub, et le registre des dépenses (reçus, prélèvements, montants personnels)
// par le relevé (`couts_manuels`, produit sur le PC). Ces tests échouent si l'un d'eux y revient.
describe("chantier/cadre.html", () => {
  it("n'embarque aucun relevé : il n'attend que celui du hub", () => {
    expect(DOCUMENT).toContain("const EMBED = null;");
    expect(DOCUMENT).toContain("function start(d){ if (started || !d) return;");
  });

  it("le registre des dépenses est vide dans le code (il vient du relevé)", () => {
    for (const [nom, vide] of [
      ["VERCEL_RECUS", "[]"],
      ["VERCEL_COURANT", "null"],
      ["CLIGNES", "[]"],
      ["CAVENIR", "[]"],
      ["CNOTES", "{}"],
    ] as const) {
      expect(DOCUMENT, nom).toContain(`let ${nom} = ${vide};`);
    }
    expect(DOCUMENT).toContain("couts_manuels");
  });

  it("aucun montant en dollars ni boîte de courriel dans le texte du document", () => {
    // Un montant à décimales (« 151,28 $ ») ou « Gmail » dit un reçu réel : ils n'ont rien à faire ici.
    // Les `$` des gabarits JS (`${…}`) et les repères entiers (« 20 $ par mois ») ne sont pas visés.
    expect(DOCUMENT).not.toMatch(/\d{2,}[,.]\d{2} ?\$/);
    expect(DOCUMENT).not.toMatch(/gmail/i);
    expect(DOCUMENT).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });

  it("n'a aucun accès réseau ni ressource externe (le cadre n'en aurait de toute façon pas)", () => {
    expect(DOCUMENT).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|importScripts|new Worker/);
    expect(DOCUMENT).not.toMatch(/<script[^>]+\ssrc=|<link[^>]+href=|@import|url\(["']?https?:/);
    const adresses = [...DOCUMENT.matchAll(/https?:\/\/[^\s"'<>)`]+/g)].map((m) => m[0]);
    for (const a of adresses) {
      expect(a.startsWith("https://github.com/MoKarade/") || a === "http://www.w3.org/2000/svg", a).toBe(true);
    }
  });

  it("tout lien s'ouvre dans une autre fenêtre : jamais dans le cadre, qui reçoit le relevé", () => {
    const liens = [...DOCUMENT.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    expect(liens.length).toBeGreaterThan(5);
    for (const l of liens) {
      expect(l, l).toContain('target="_blank"');
      expect(l, l).toContain("noopener");
    }
  });

  it("parle au hub par un canal : nomme l'origine du hub, jamais « * », et ne lit que son canal", () => {
    expect(DOCUMENT).toContain(`type: '${MESSAGE_PRET}'`);
    expect(DOCUMENT).toContain("new MessageChannel()");
    expect(DOCUMENT).toContain("new URL(location.href).origin");
    expect(DOCUMENT).toContain("canal.port1.onmessage = surCanal");
    // aucun postMessage à destinataire « * » : ni dans la page, ni dans le hub
    expect(DOCUMENT).not.toMatch(/postMessage\([^)]*['"]\*['"]/);
    for (const fichier of ["components/ChantierCadre.tsx"]) {
      const code = readFileSync(resolve(process.cwd(), fichier), "utf8").replace(/\/\/[^\n]*/g, "");
      expect(code, fichier).not.toMatch(/postMessage\([^)]*["']\*["']/);
    }
  });
});

describe("les coûts des apps dans le cadre (la page Coûts du hub, reprise)", () => {
  it("l'onglet demandé par l'adresse est validé : une valeur inconnue n'ouvre rien d'inventé", () => {
    expect(ONGLETS).toContain("couts");
    expect(ongletDe("couts")).toBe("couts");
    for (const mauvais of [undefined, null, "", "COUTS", "couts#x", "../x", ["couts"], 3]) {
      expect(ongletDe(mauvais)).toBeNull();
    }
  });

  it("chaque onglet validé existe dans le document", () => {
    for (const onglet of ONGLETS) expect(DOCUMENT, onglet).toContain(`['${onglet}', `);
  });

  it("le document reçoit les coûts par le canal, sans réseau, et dit quand ils manquent", () => {
    expect(URL_COUTS).toBe("/api/chantier/couts");
    expect(MESSAGE_COUTS).toBe("chantier-couts");
    expect(DOCUMENT).toContain(`m.type === '${MESSAGE_COUTS}'`);
    expect(DOCUMENT).toContain("window.hubCouts");
    expect(DOCUMENT).toContain("En attente des coûts des apps");
    expect(DOCUMENT).not.toContain(URL_COUTS); // il ne les lit pas lui-même
  });

  it("le document garde les règles de l'ancienne page : une période à la fois, plafond non publié dit", () => {
    expect(DOCUMENT).toContain("plafond non publié");
    expect(DOCUMENT).toContain("Cette app ne publie pas encore de coûts ni de quotas.");
    expect(DOCUMENT).toContain("jamais estimé par le hub");
  });

  it("la raison d'un refus est dite en clair", () => {
    expect(erreurCouts(401)).toMatch(/session du hub a expiré/);
    expect(erreurCouts(404)).toMatch(/réservé au propriétaire/);
    expect(erreurCouts(429)).toMatch(/Trop de lectures/);
    expect(erreurCouts(500)).toContain("erreur 500");
  });
});

describe("les gestes de l'onglet « À toi » dans le cadre (sans Drive)", () => {
  it("le cadre remet le geste au hub par son canal et attend sa réponse, jamais un « * »", () => {
    expect(URL_GESTES).toBe("/api/chantier/gestes");
    expect(MESSAGE_GESTE).toBe("chantier-geste");
    expect(DOCUMENT).toContain(`m.type === '${MESSAGE_GESTE}'`);
    expect(DOCUMENT).toContain("window.hubGeste");
    expect(DOCUMENT).toContain("canalHub.postMessage({ type: '" + MESSAGE_GESTE + "'");
    expect(DOCUMENT).not.toContain(URL_GESTES); // il ne dépose pas lui-même : il n'a pas de réseau
  });

  it("le hub d'abord, le dossier Drive en repli, GitHub sans l'un ni l'autre", () => {
    expect(DOCUMENT).toContain("window.hubGestes === true || !!(DRV.mcp && DRV.parent)");
    expect(DOCUMENT).toContain("if (parHub) await window.hubGeste(corps)");
    expect(DOCUMENT).toContain("ni hub ni connecteur Google Drive");
  });
});

describe("la barre du Gantt montre l'état au fil du temps (Hubperso#572)", () => {
  it("chaque barre de tâche ou de parent est découpée par état, avec sa légende", () => {
    expect(DOCUMENT).toContain("function etatsOf(");
    expect(DOCUMENT).toContain("function agregOf(");
    expect(DOCUMENT).toContain("Couleur d'une barre, à chaque instant");
    expect(DOCUMENT).toContain("const hist = etatsOf(n, seg);");
  });

  it("un projet, un chantier et une mission prennent l'état de leurs tâches, le travail mesuré en bleu", () => {
    expect(DOCUMENT).toContain("function fondre(");
    expect(DOCUMENT).toContain("const travailDe = l =>");
    expect(DOCUMENT).toContain("const app = n.lvl === 'app'");
  });

  it("une seule épaisseur : les blocs à hauteur variable ne servent que sans historique d'états", () => {
    expect(DOCUMENT).toContain("if (!hist && !n.leaf && n.ls) bars += chunkBars(n.ls, n);");
    expect(DOCUMENT).toContain("if (n.leaf && !hist) bars += chunkBars([n], n);");
    expect(DOCUMENT).toContain(".gl2[class*=\" et-\"]{height:12px;margin-top:-6px;background:var(--sc)}");
  });

  it("une tâche sans historique d'états garde sa barre d'avant : aucune couleur inventée", () => {
    expect(DOCUMENT).toContain("bars += hist || seg(n.start, end, `gl2 ${sc}`)");
  });
});

describe("les quotas se lisent d'un coup d'oeil, une ligne par ressource", () => {
  it("chaque ressource est une ligne cliquable : nom, barre avec son repère, valeur, une phrase", () => {
    expect(DOCUMENT).toContain("function quotaPhrase(");
    expect(DOCUMENT).toContain("const QORD = {ko: 0, vig: 1, nd: 2, ok: 3};");
    expect(DOCUMENT).toContain("<div class=\"qlist\">");
    expect(DOCUMENT).toContain("data-qd=\"${esc(g.key)}\"");
  });

  it("Copilot reste une ligne à part, sans quota inventé", () => {
    expect(DOCUMENT).toContain("pas de quota mesuré");
    expect(DOCUMENT).toContain("data-det=\"copilot\"");
  });

  it("les courbes sont repliées sous les lignes et les cibles font au moins 44 px", () => {
    expect(DOCUMENT).toContain("<details class=\"qmore\"><summary>Courbes réel contre rythme</summary>");
    expect(DOCUMENT).toMatch(/\.qrow\{[^}]*min-height:44px/);
  });
});

describe("une tâche jamais commencée montre aussi ses états (Hubperso#589)", () => {
  it("son historique part de son premier état étiqueté, jamais d'une date inventée", () => {
    expect(DOCUMENT).toContain("const deb = n.start != null ? n.start : Array.isArray(n.et) && n.et.length ? Date.parse(n.et[0][1]) : NaN;");
    expect(DOCUMENT).toContain("if (!Array.isArray(n.et) || !isFinite(deb)) return null;");
    expect(DOCUMENT).toContain("let cur = 'cours', t = deb;");
  });

  it("la ligne du Gantt trace la barre d'une tâche sans début de travail quand elle a un historique", () => {
    expect(DOCUMENT).toContain("} else if (n.start != null || (n.leaf && etatsOf(n, seg))){");
  });
});

describe("aucune projection de quota trop tôt dans la période (Hubperso#592)", () => {
  it("sous 10 % de la période écoulée, la jauge ne projette pas et le dit", () => {
    expect(DOCUMENT).toContain("proj = f >= .1 ? o.used / f : null;");
    expect(DOCUMENT).toContain("else if (proj != null && proj > o.limit) {");
    expect(DOCUMENT).toContain("début de période : trop tôt pour projeter");
  });

  it("la phrase de la ligne et le tiroir de détail ne lisent pas une projection absente", () => {
    expect(DOCUMENT).toContain("if (j.proj != null && j.proj > g.limit) return 'à ce rythme : '");
    expect(DOCUMENT).toContain("j.proj == null ? 'trop tôt : moins de 10 % de la période écoulée'");
  });
});
