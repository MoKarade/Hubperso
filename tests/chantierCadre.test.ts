// tests/chantierCadre.test.ts — la page Chantier dans son cadre isolé : l'isolement, ce que le hub répond
// au cadre, et — surtout, ce dépôt étant PUBLIC — que le document servi ne porte AUCUNE donnée.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CSP_CADRE,
  MESSAGE_CLIC_DROIT,
  MESSAGE_COUTS,
  MESSAGE_EVENEMENTS,
  MESSAGE_GESTE,
  MESSAGE_ONGLET,
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
  lireClicDroit,
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

  it("les courbes réel contre rythme sont toujours affichées, sans tiroir, et les cibles font au moins 44 px", () => {
    expect(DOCUMENT).toContain('<h3 class="qjh">Réel contre rythme');
    expect(DOCUMENT).not.toContain("qmore");
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

describe("le cadre ne se recharge pas quand on change de page du hub (#596)", () => {
  const lire = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");

  it("le cadre vit dans la mise en page, réservé à qui a l'entrée Chantier, monté à la première visite", () => {
    const nav = lire("components/Navigation.tsx");
    expect(nav).toContain("<ChantierPersistant />");
    expect(nav).toMatch(/modele\.vue\.some\(\(e\) => e\.id === "chantier"\)/);
    const persistant = lire("components/ChantierPersistant.tsx");
    expect(persistant).toContain('chemin === "/chantier"');
    expect(persistant).toContain("useState(actif)");
    expect(persistant).toContain("if (actif && !visite) setVisite(true)");
  });

  it("la page garde l'accès et n'affiche rien : un cadre dans la page serait détruit à chaque départ", () => {
    const page = lire("app/chantier/page.tsx");
    expect(page).toContain("await exigerProprietaire()");
    expect(page).toContain("return null");
    expect(page).not.toContain("<ChantierCadre");
  });

  it("caché, le cadre n'occupe aucune place (le sélecteur est APRÈS la règle qui lui donne sa taille)", () => {
    const css = lire("app/globals.css");
    const cache = css.indexOf(".chantier-cadre--cache {");
    expect(cache).toBeGreaterThan(css.indexOf(".chantier-cadre {"));
    expect(css.slice(cache, cache + 60)).toContain("display: none");
  });

  it("le document change d'onglet à la demande du hub, sans se recharger, et ne mesure rien tant qu'il est caché", () => {
    expect(DOCUMENT).toContain(`m.type === '${MESSAGE_ONGLET}'`);
    expect(DOCUMENT).toContain("window.surOnglet = o =>");
    expect(DOCUMENT).toContain("if (!document.hidden && innerWidth){ tickGantt(); tickAgo(); }");
  });
});

describe("le clic droit du cadre est dit au hub (#610)", () => {
  it("écoute contextmenu en capture, laisse Maj et les champs de saisie au navigateur", () => {
    expect(DOCUMENT).toContain("document.addEventListener('contextmenu'");
    expect(DOCUMENT).toContain("if (e.shiftKey || e.target.closest('input,textarea,select,[contenteditable]')) return;");
    expect(DOCUMENT).toMatch(/\}, true\);\nlet LONG = null;/);
  });

  it("poste { type, x, y, genre, texte } dans le canal, texte coupé à 300 caractères", () => {
    expect(DOCUMENT).toContain(`type: '${MESSAGE_CLIC_DROIT}'`);
    expect(DOCUMENT).toContain("portHub.postMessage(msg)");
    expect(DOCUMENT).toContain(".slice(0, 300)");
    expect(DOCUMENT).toContain("genre: g[1], texte");
  });

  it("sans hub qui écoute, le menu du navigateur reste en place (preventDefault seulement si le message est parti)", () => {
    expect(DOCUMENT).toContain("if (direAuHub(e.clientX, e.clientY, e.target)) e.preventDefault();");
    expect(DOCUMENT).toContain("if (!portHub) return false;");
  });

  it("appui long tactile de 650 ms, annulé par un mouvement de plus de 8 px", () => {
    expect(DOCUMENT).toContain("}, 650)");
    expect(DOCUMENT).toContain("> 8) finLong()");
  });
});

describe("l'onglet Vitesse : la rapidité des PR et des tâches, par acteur (#613)", () => {
  it("existe dans la barre, s'ouvre par ?onglet=vitesse et n'est plus l'ancien « Rythme »", () => {
    expect(ongletDe("vitesse")).toBe("vitesse");
    expect(DOCUMENT).toContain("['vitesse', 'Vitesse']");
    expect(DOCUMENT).toContain("tab === 'vitesse' ? vVitesseM()");
    expect(DOCUMENT).toMatch(/const ANCIEN = \{plan: 'taches', cartes: 'taches', quota: 'rythme'\};/);
    expect(DOCUMENT).toContain("t === 'vitesse' ? t : ANCIEN[t]");
  });

  it("mêmes couleurs d'acteurs que « Qui fusionne » de l'Accueil (une seule table)", () => {
    expect(DOCUMENT).toContain("const LAB = QUI, tot");
    expect(DOCUMENT.match(/const QUI = \{claude:/g)).toHaveLength(1);
  });

  it("rien n'est inventé : une tâche dont on ne sait pas qui l'a faite va dans « Non attribué »", () => {
    expect(DOCUMENT).toContain("return !k ? 'inconnu' : QUI[k] ? k : 'autre';");
    expect(DOCUMENT).toContain("inconnu: ['Non attribué'");
  });

  it("le délai d'une PR va de sa création à sa fusion, la durée d'une tâche de son début à son acceptation", () => {
    expect(DOCUMENT).toContain("d: (p.t - Date.parse(p.c)) / 6e4");
    expect(DOCUMENT).toContain("d: (l.end - l.start) / 6e4");
  });
});


describe("la période choisie commande toute la page (#621)", () => {
  it("l'Accueil compte les tâches actives sur la période et éteint les autres briques", () => {
    expect(DOCUMENT).toContain("act = l => inP(l.u) || inP(l.x) || inP(l.c) || inP(l.start)");
    expect(DOCUMENT).toContain("#mx .bk.q{opacity:.13");
  });

  it("chaque quota dit ce qu'il a bougé sur la période, ou sa fenêtre propre, jamais un chiffre caché", () => {
    expect(DOCUMENT).toContain("function quotaPer(g)");
    expect(DOCUMENT).toContain("depuis la remise à zéro il y a");
    expect(DOCUMENT).toContain("valeur du moment, pas d\\'historique");
    expect(DOCUMENT).toContain("${(qp => qp ?");
  });

  it("la barre des quotas de Ressources et celle de Vitesse ne partagent plus de sélecteur", () => {
    expect(DOCUMENT).toContain(".qrow .qbar{grid-area:b;");
    expect(DOCUMENT).toContain(".qvb{grid-column:1/-1");
    expect(DOCUMENT).not.toMatch(/\n\.qbar\{grid-column:1\/-1/);
  });

  it("les coûts suivent la période au jour près : total, postes, barres au jour jusqu'à 1 mois, cumul", () => {
    expect(DOCUMENT).toContain("const coutsPer = C =>");
    expect(DOCUMENT).toContain("CLIGNES.filter(l => l[0] >= t0d && l[0] <= C.auj)");
    expect(DOCUMENT).toContain("const coutsSerie = C =>");
    expect(DOCUMENT).toContain("$ payés en ${esc(PS().n)}");
    expect(DOCUMENT).toContain("Cumul payé");
    expect(DOCUMENT).not.toContain("costMonths");
  });

  it("« Quand ça fusionne » ne force plus 7 jours : une rangée par heure sous 7 j", () => {
    expect(DOCUMENT).toContain("R = PS().ms < 7 * DAY ? 1 : 7");
    expect(DOCUMENT).not.toContain("au moins 7 j pour que la carte soit lisible");
  });
});

describe("Vitesse et Parcours en un seul onglet : le trajet d'une tâche et la vitesse par acteur (#625)", () => {
  it("il n'y a qu'un onglet : Vitesse porte aussi le parcours, pas d'onglet Parcours", () => {
    expect(ongletDe("parcours")).toBeNull();
    expect(DOCUMENT).not.toContain("['parcours', 'Parcours']");
    expect(DOCUMENT).toContain("const P = parcoursParts()");
    expect(DOCUMENT).toContain("P.hero + P.flow");
  });

  it("les phases viennent d'instants du relevé ; un instant absent saute la phase, jamais estimé", () => {
    expect(DOCUMENT).toContain("[['idee', l.c], ['prise', l.start], ['pr', cr], ['fus', l.merged], ['acc', l.end]].filter(b => b[1] != null");
    expect(DOCUMENT).toContain("ok ? PCPH[a][2] : 'var(--line2)'");
    expect(DOCUMENT).toContain("'Non détaillé'");
  });

  it("« dans l'app » n'a pas d'instant propre : dès le relevé qui suit l'acceptation", () => {
    expect(DOCUMENT).toContain("Visible dans cette page dès le relevé qui suit l\\'acceptation");
  });

  it("la période filtre le trajet et chaque ligne ouvre la fiche de la tâche", () => {
    expect(DOCUMENT).toContain("const L = M.leaves.filter(act)");
    expect(DOCUMENT).toContain('class="pcr" data-open="${esc(l.ref)}"');
  });

  it("les graphes ajoutés : où va le temps (acteur, app), bout en bout, tâches en vol, entrées et sorties", () => {
    expect(DOCUMENT).toContain("function chPhases(W, title, groups)");
    expect(DOCUMENT).toContain("chPhases(W2, 'Par acteur'");
    expect(DOCUMENT).toContain("chPhases(W2, 'Par app'");
    expect(DOCUMENT).toContain("function chBoutEnBout(W, done)");
    expect(DOCUMENT).toContain("title: 'Tâches en vol'");
    expect(DOCUMENT).toContain("title: 'Entrées et sorties'");
  });

  it("une tâche sans acteur connu reste « Non attribué » dans où va le temps", () => {
    expect(DOCUMENT).toContain("phasesPar(P.done, l => quiTask(l), k => QUIT[k][0])");
  });
});

describe("chaque bloc dit d'où vient sa donnée, son âge et sa nature (#640)", () => {
  it("un registre des sources : mesuré, calculé, saisi à la main ou estimé, avec leur cadence", () => {
    expect(DOCUMENT).toContain("function sources()");
    for (const nature of ["mesuré", "calculé", "saisi à la main", "estimé"]) expect(DOCUMENT).toContain(`'${nature}'`);
    for (const id of ["taches", "actions", "vercel", "jules", "gemini", "claude", "api-mois", "api-cumul", "couts-apps", "recus", "taux", "elec"]) {
      expect(DOCUMENT, id).toContain(`id: '${id}'`);
    }
  });

  it("une source sans instant lisible est « fixe », jamais « à jour » ; une jauge dite périmée par le PC l'est aussi", () => {
    expect(DOCUMENT).toContain("!isFinite(age) ? 'fixe'");
    expect(DOCUMENT).toContain("isFinite(s.perime) && now > s.perime");
    expect(DOCUMENT).not.toContain("!isFinite(age) ? 'ok'");
  });

  it("chaque source est jugée sur sa vraie cadence : la Semaine Claude passe une fois par heure, une app au repos garde sa date", () => {
    expect(DOCUMENT).toContain("cad: 60 * MIN, ret: 75 * MIN, per: 120 * MIN");
    expect(DOCUMENT).toContain("cad: 2 * H, ret: 3 * H, per: 6 * H");
    expect(DOCUMENT).toContain("const ret = s.ret || 1.5 * s.cad, per = s.per || 3 * s.cad;");
    expect(DOCUMENT).toContain("s.age / s.per * 100");
  });

  it("les reçus sont dits saisis à la main et le taux est dit estimé : rien ne se rafraîchit en douce", () => {
    expect(DOCUMENT).toContain("nat: 'sai'");
    expect(DOCUMENT).toContain("pas un cours du jour");
    expect(DOCUMENT).toContain("ne se rafraîchit jamais seul");
  });

  it("chaque bloc porte sa pastille et elle avance avec l'horloge", () => {
    expect(DOCUMENT).toContain("const band = (ico, title, inner, ids)");
    expect(DOCUMENT).toContain("fraisHTML(ids)");
    expect(DOCUMENT).toContain("majFrais(); }");
    expect(DOCUMENT).toContain("fraisHTML(['taches', 'prev'])");
    expect(DOCUMENT).toContain("['actions', 'vercel', 'jules', 'gemini', 'claude', 'api-mois']");
    expect(DOCUMENT).toContain("fraisHTML(['recus', 'taux'])");
    expect(DOCUMENT).toContain("window.hubCoutsAt = window.hubCouts ? Date.now() : NaN");
  });

  it("le bloc « Données » liste les sources avec leur âge, et chaque jauge dit le sien", () => {
    expect(DOCUMENT).toContain("function vDonnees()");
    expect(DOCUMENT).toContain("d’où vient chaque chiffre");
    expect(DOCUMENT).toContain("mesuré <span class=\"qage");
  });
});

describe("le cadre se tient à jour sans que l'on recharge la page (#640)", () => {
  it("un relevé qui arrive est lu tout de suite, sans attendre le tour suivant de la minute", () => {
    expect(DOCUMENT).toContain("if (typeof window.surReleve === 'function') window.surReleve();");
    expect(DOCUMENT).toContain("window.surReleve = () => { tick().catch(() => {}); };");
  });

  it("une version neuve du document : le cadre se recharge quand la page est cachée ou inutilisée depuis 45 s, après avoir prévenu le hub", () => {
    expect(DOCUMENT).toContain("m.type === 'chantier-version-neuve'");
    expect(DOCUMENT).toContain("window.surVersionNeuve = () => {");
    expect(DOCUMENT).toContain("!document.hidden && Date.now() - action < 45e3");
    expect(DOCUMENT).toContain("portHub.postMessage({ type: 'chantier-recharge', onglet: location.hash.replace('#', '') });");
  });

  it("le cadre ne se recharge jamais lui-même : son rechargement part sans cookie de session (401 « unauthenticated », Hubperso#719)", () => {
    expect(DOCUMENT).not.toContain("location.reload");
    expect(DOCUMENT).not.toMatch(/location\.(href|assign|replace)\s*[=(]/);
  });
});

describe("plus de graphes, tirés du relevé seulement (#640)", () => {
  it("le chiffre du haut porte sa pastille de fraîcheur, les quotas par jour leur titre, le taux sa valeur visible", () => {
    expect(DOCUMENT).toContain("${fraisHTML(['taches'])}</div></div></section>`");
    expect(DOCUMENT).toContain('<h3 class="qjh">Consommation, ${esc(PS().n)}');
    expect(DOCUMENT).toContain('const fxLigne = () => `<p class="qnote cxfx">1 $ US = <b>${esc(fxTxt())} $ CA</b>');
    expect(DOCUMENT).toContain("Payé, d’après les reçus</b>${fraisHTML(['recus', 'taux'])}</p>${fxLigne()}");
    expect(DOCUMENT).toContain("taux de repli, pas un cours du jour : le relevé du PC ne donne pas de taux lisible (absent ou de plus de 72 h)");
  });

  it("les tâches ouvertes : leur âge et leur répartition par app, avec leur légende", () => {
    expect(DOCUMENT).toContain("function chAge(W)");
    expect(DOCUMENT).toContain("function chOuvertesApp(W)");
    expect(DOCUMENT).toContain("Tâches ouvertes : depuis quand");
    expect(DOCUMENT).toContain("toutes les tâches ouvertes, quelle que soit la période choisie");
  });

  it("la consommation de chaque ressource suit la période choisie (7 jours, 1 mois, 3 mois), jamais une série inventée", () => {
    expect(DOCUMENT).toContain("function chRes(key, W)");
    expect(DOCUMENT).not.toContain("chQuotaJours");
    for (const k of ["vercel", "jules", "gemini", "actions", "claude", "api"]) {
      expect(DOCUMENT).toContain(`chRes('${k}', W`);
    }
    expect(DOCUMENT).toContain("evBins(");
    expect(DOCUMENT).toContain("Math.max(now - PS().ms, first)");
    expect(DOCUMENT).toContain("['actions', 'vercel', 'jules', 'gemini', 'claude', 'api'].filter(");
  });

  it("le taux USD→CAD est celui du relevé (Banque du Canada) quand il existe, borné, sinon, ou au-delà de 72 h, le repli 1,38 est dit", () => {
    expect(DOCUMENT).toContain("CUR.quota.taux_usd_cad");
    expect(DOCUMENT).toContain("+x.taux >= .5 && +x.taux <= 3 && Date.now() - r <= 72 * 36e5");
    expect(DOCUMENT).toContain("const FX = 1.38;");
    expect(DOCUMENT).toContain("taux de repli, pas un cours du jour : le relevé du PC ne donne pas de taux lisible'");
    expect(DOCUMENT).toContain("const cc = (m, dev) => dev === 'USD' ? m * fxTaux() : m;");
    expect(DOCUMENT).not.toContain("m * FX");
  });

  it("le cumul de l'API est présenté comme la mesure la plus ancienne des apps, pas comme la date du relevé", () => {
    expect(DOCUMENT).toContain("API des apps, plus ancienne mesure");
  });
});

describe("lireClicDroit : ce que le hub retient du clic droit du cadre", () => {
  const bon = { type: MESSAGE_CLIC_DROIT, x: 120.5, y: 48, genre: "une barre du Gantt", texte: "Hubperso#604" };

  it("un message conforme donne la place et la description", () => {
    expect(lireClicDroit(bon)).toEqual({ x: 120.5, y: 48, description: { genre: "une barre du Gantt", texte: "Hubperso#604" } });
  });

  it("sans texte, la description n'a que le genre", () => {
    expect(lireClicDroit({ ...bon, texte: "" })).toEqual({ x: 120.5, y: 48, description: { genre: "une barre du Gantt" } });
    expect(lireClicDroit({ ...bon, texte: undefined })).toEqual({ x: 120.5, y: 48, description: { genre: "une barre du Gantt" } });
  });

  it("le texte est coupé à 300 caractères, le genre à 80, sans caractère de contrôle", () => {
    const r = lireClicDroit({ ...bon, genre: `un${"x".repeat(200)}`, texte: `a\u0000b\n${"y".repeat(500)}` })!;
    expect(r.description.genre).toHaveLength(80);
    expect(r.description.texte).toHaveLength(300);
    expect(r.description.texte!.startsWith("a b y")).toBe(true);
  });

  it("les faits du relevé (donnees) passent, coupés à 1 200 caractères, sans caractère de contrôle ; vides ou d'un autre type, ils sont ignorés", () => {
    const r = lireClicDroit({ ...bon, donnees: `Mission « M » ;\u0000 3 tâches\n${"z".repeat(2000)}` })!;
    expect(r.description.donnees).toHaveLength(1200);
    expect(r.description.donnees!.startsWith("Mission « M » ; 3 tâches z")).toBe(true);
    expect(lireClicDroit({ ...bon, donnees: "   " })!.description).not.toHaveProperty("donnees");
    expect(lireClicDroit({ ...bon, donnees: 42 })!.description).not.toHaveProperty("donnees");
    expect(lireClicDroit({ ...bon, texte: "", donnees: "faits" })!.description).toEqual({ genre: "une barre du Gantt", donnees: "faits" });
  });

  it("une donnée du cadre n'est jamais une consigne : seuls x, y, genre, texte et donnees sortent", () => {
    const r = lireClicDroit({ ...bon, outil: "supprimer", href: "javascript:alert(1)" })!;
    expect(Object.keys(r).sort()).toEqual(["description", "x", "y"]);
    expect(Object.keys(r.description).sort()).toEqual(["genre", "texte"]);
  });

  it("un message mal formé est ignoré", () => {
    for (const mauvais of [
      null,
      "chantier-clic-droit",
      [],
      { ...bon, type: "chantier-geste" },
      { ...bon, x: "120" },
      { ...bon, y: Number.NaN },
      { ...bon, x: Infinity },
      { ...bon, x: 1e9 },
      { ...bon, genre: 5 },
      { ...bon, genre: "   " },
      { ...bon, genre: undefined },
    ]) {
      expect(lireClicDroit(mauvais), JSON.stringify(mauvais)).toBeNull();
    }
  });
});

describe("l'onglet En cours : tout ce qui se passe et la suite prévue, tiré du relevé seulement (#640)", () => {
  it("existe dans la barre et s'ouvre par ?onglet=cours", () => {
    expect(ongletDe("cours")).toBe("cours");
    expect(DOCUMENT).toContain("['cours', 'En cours']");
    expect(DOCUMENT).toContain("tab === 'cours' ? vEnCours()");
    expect(DOCUMENT).toContain("t === 'cours' || t === 'couts'");
  });

  it("montre le process en pastilles, sans phrases : une colonne par étape, une ligne par app, le pouls et les 48 prochaines heures", () => {
    for (const t of ["'Idée'", "'En file'", "'Attend toi'", "'Prise'", "'PR brouillon'", "'PR prête'", "'Contrôles'", "'File Mergify'", "'Fusionnée'", "'En ligne'", "'Preuve'", "'Acceptée'"]) expect(DOCUMENT).toContain(t);
    // vocabulaire de Marc (28/10) : « attend » ne se dit que de son geste ; tout le reste est « prévu », avec sa raison
    expect(DOCUMENT).toContain("l.e === 'marc' ? 'att'");
    expect(DOCUMENT).toContain("blk: 'prévue : dépend d\\'autre chose'");
    expect(DOCUMENT).not.toContain("'attend autre chose'");
    expect(DOCUMENT).toContain("function xcPouls(W)");
    expect(DOCUMENT).toContain("function xcSuite(W)");
    expect(DOCUMENT).toContain("const ecQui = l =>");
    expect(DOCUMENT).toContain("M.sante.hors");
    expect(DOCUMENT).not.toContain("la file Mergify et le déploiement de chaque PR ne sont pas dans le relevé : la page ne les montre pas plutôt");
  });

  it("reste en direct : la pastille d'âge du relevé, un redessin toutes les 30 s, la forme dit qui travaille", () => {
    expect(DOCUMENT).toContain("fraisHTML([...(D ? ['taches', 'prs'] : ['taches']), ...(xcEtapes() ? ['etapes'] : []), ...(isFinite(EVS.lu) || EVS.err ? ['evenements'] : [])])");
    expect(DOCUMENT).toContain("ST.tab === 'cours' && !document.hidden) render(); }, 30e3)");
    expect(DOCUMENT).toContain("q === 'Jules' ? 'J' : q === 'Copilot' ? 'Cp' : q === 'Marc' ? 'M' : 'C'");
    expect(DOCUMENT).toContain("prefers-reduced-motion:reduce){#mx .xc-b.on");
  });

  it("branche Contrôles et En ligne sur prs_ouvertes, grisées avec « ? » quand la clé manque, jamais vertes sans preuve", () => {
    expect(DOCUMENT).toContain("CUR.prs_ouvertes");
    expect(DOCUMENT).toContain("const xcData = () =>");
    expect(DOCUMENT).toContain("Pas dans le relevé pour l’instant");
    // une PR brouillon ou sans contrôle lu ne passe jamais en Contrôles ; « aucun » et « non_lu » ne sont pas du vert
    expect(DOCUMENT).toContain("!r.brouillon && r.ci && !r.ci.erreur ? r.ci.etat : null");
    expect(DOCUMENT).toContain("['en_cours', 'vert', 'rouge', 'annule'].includes(xcEtatCi(r))");
    expect(DOCUMENT).toContain("ce === 'vert' ? 'ok' : ''");
    expect(DOCUMENT).toContain("ce === 'rouge' || ce === 'annule'");
    // le déploiement est celui du dépôt, pas celui d'une PR, et le dit
    expect(DOCUMENT).toContain("dernier déploiement du dépôt, pas celui d’une PR");
    expect(DOCUMENT).toContain("lecture des PR incomplète");
    // une PR que la fiche de sa tâche ne porte pas (2e PR d'une tâche, PR sans tâche) reste visible, au bon étage
    expect(DOCUMENT).toContain("D.prs.filter(r => r && !refs.has(");
  });

  it("lit les événements GitHub en direct : ils passent avant le relevé, et rien n'est dit « en direct » sans lecture récente (Hubperso#684)", () => {
    expect(MESSAGE_EVENEMENTS).toBe("chantier-evenements");
    expect(DOCUMENT).toContain(`m.type === '${MESSAGE_EVENEMENTS}'`);
    expect(DOCUMENT).toContain("window.surEvenements = m =>");
    expect(DOCUMENT).toContain("const evIdx = () =>");
    // une PR fusionnée ou fermée n'est plus ouverte, un brouillon change d'état, un déploiement se suit : seulement ce qui date d'APRÈS le relevé
    expect(DOCUMENT).toContain("if (e.etat === 'fusionnee' || e.etat === 'fermee') delete par[k];");
    expect(DOCUMENT).toContain("const xcLeaf = l =>");
    // un contrôle ne devient jamais vert sur un seul événement (les autres peuvent courir encore) : seul le rouge est définitif
    expect(DOCUMENT).toContain("['failure', 'timed_out', 'startup_failure'].includes(e.etat)");
    expect(DOCUMENT).not.toContain("ci = {...par[k].ci, etat: 'vert'");
    // la pastille dit « en direct » seulement après une lecture réussie de moins de 90 s ; sinon « relevé du PC », et la source passe en retard puis périmée
    expect(DOCUMENT).toContain("const evVivant = () => isFinite(EVS.lu) && !EVS.err && Date.now() - EVS.lu < 90e3;");
    expect(DOCUMENT).toContain("id: 'evenements'");
    expect(DOCUMENT).toContain("ret: 12 * MIN, per: 20 * MIN");
    // la sortie du brouillon et la mise en ligne reviennent des événements quand `etapes` ne les date pas
    expect(DOCUMENT).toContain("ix.pret.get(k)");
    expect(DOCUMENT).toContain("ix.ok.get(x.r + '@'");
  });

  it("donne la durée moyenne de chaque étape mesurée et dit où elle se passe, sans inventer celles que le relevé ne date pas", () => {
    expect(DOCUMENT).toContain("const xcDurees = () =>");
    expect(DOCUMENT).toContain("const XLIEU = {");
    for (const l of ["'Mergify'", "'Vercel'", "'GitHub / PC'", "'agent'"]) expect(DOCUMENT).toContain(l);
    // seules les étapes datées par le relevé ont une durée ; les autres montrent « ? »
    expect(DOCUMENT).toContain("S = {file: [], fileEl: [], prise: [], draft: [], rel: [], ci: [], mg: [], dep: [], prove: [], acc: [], total: []}");
    expect(DOCUMENT).toContain("Le relevé ne date pas cette étape : la durée reste inconnue plutôt qu’inventée");
    expect(DOCUMENT).toContain("moyenne ' + xcDur(d.mean) + ' · médiane ' + xcDur(d.med)");
    // la file Mergify est son étape, séparée des contrôles
    expect(DOCUMENT).toContain("(xcQueue(l, D) ? 'mg' : 'ci')");
    expect(DOCUMENT).toContain("const cc = Math.min(Math.max(ci, fin), mg)");
    expect(DOCUMENT).toContain("c === 'mg' ? mgPos(x) - mgPos(y)");
    // PR prête et En ligne : clé optionnelle `etapes` (.github#689) ; une PR jamais en brouillon ou sans déploiement n'est jamais comptée comme 0
    expect(DOCUMENT).toContain("const xcEtapes = () =>");
    expect(DOCUMENT).toContain("E.prets[k]");
    expect(DOCUMENT).toContain("ed.termine !== false ? t(ed.pret_le)");
    expect(DOCUMENT).toContain("(c === 'draft' || c === 'rel' || c === 'dep' ? 3 : 1)");
    expect(DOCUMENT).toContain("PR fusionnées sans déploiement, non comptées");
    expect(DOCUMENT).toContain("if (!E){ delete o.rel; delete o.dep; }");
    expect(DOCUMENT).toContain("id: 'etapes'");
  });

  it("laisse choisir moyenne ou médiane et le type (Claude, Jules, Copilot), montre où va le temps, avec rond / losange / carré pour qui agit", () => {
    expect(DOCUMENT).toContain("let XST = 'moy', XQ = 'tous';");
    expect(DOCUMENT).toContain("data-xst");
    expect(DOCUMENT).toContain("['copilot', 'Copilot']");
    expect(DOCUMENT).toContain("const xcType = l => l.j ? 'jules'");
    expect(DOCUMENT).toContain("x.k !== 'tache' || (XQ !== 'tous' && quiDe(x) !== XQ)");
    expect(DOCUMENT).toContain("['Avant la PR'");
    expect(DOCUMENT).toContain("['Dans la PR'");
    expect(DOCUMENT).toContain("['Après la fusion'");
    expect(DOCUMENT).toContain("la somme des étapes n’est pas le total");
    expect(DOCUMENT).toContain("const XFORME = {h: '<circle");
    expect(DOCUMENT).toContain("const xcDur = ms => ms < 60e3 ? '< 1 min' : dur(ms);");
    expect(DOCUMENT).toContain("case 'acc': return l.end ? 'acceptée ' + quand(l.end)");
    expect(DOCUMENT).toContain("id: 'prs'");
  });
});

describe("les reçus lus dans Gmail s'ajoutent à l'onglet Coûts sans jamais passer pour sûrs (#640)", () => {
  it("se lisent dans couts_manuels.recus_gmail, avec leur âge et la cadence hebdomadaire du PC", () => {
    expect(DOCUMENT).toContain("k.indexOf('recus_') === 0");
    expect(DOCUMENT).toContain("RECUS_COURRIELS = c[kR]");
    expect(DOCUMENT).toContain("id: 'recus-courriels'");
    expect(DOCUMENT).toContain("cad: 7 * 24 * H");
    expect(DOCUMENT).toContain("tot = sur.reduce(");
  });

  it("un reçu à vérifier est montré à part, une devise probable est dite probable, un montant absent n'est pas deviné", () => {
    expect(DOCUMENT).toContain("av = !!r.a_verifier || m == null || !dev");
    expect(DOCUMENT).toContain("sur: !av");
    expect(DOCUMENT).toContain("(devise probable)");
    expect(DOCUMENT).toContain("montant absent");
    expect(DOCUMENT).toContain("à vérifier · ");
    expect(DOCUMENT).toContain("vAppsHub() + sf('Reçus courriels', vRecusCourriels) + vCoutsRegistre()");
  });
});
