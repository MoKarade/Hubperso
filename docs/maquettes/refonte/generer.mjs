// Génère les pages HTML statiques des maquettes (node generer.mjs). Aucun code d'app.
// Thème sombre seul (décision de Marc, 26/09). Toutes les valeurs affichées sont des EXEMPLES.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));

/* ---------- icônes (sprite) ---------- */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  coins: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  wifioff: '<path d="M2 8.8a15 15 0 0 1 4-2.5M22 8.8a15 15 0 0 0-8-3.7M5 12.5a10 10 0 0 1 3-2M19 12.5a10 10 0 0 0-5-2.5M8.5 16a5 5 0 0 1 4-1.4M12 20h.01M3 3l18 18"/>',
  lock: '<path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3"/>',
  filex: '<path d="M6 3h8l4 4v14H6zM10 12l4 4M14 12l-4 4"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  back: '<path d="M19 12H5M12 5l-7 7 7 7"/>',
  user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  logout: '<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  minus: '<path d="M5 12h14"/>',
  tup: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  tdown: '<path d="M3 7l6 6 4-4 8 8M15 17h6v-6"/>',
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
};
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(ICONS)
  .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join("")}</defs></svg>`;
const ic = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;

/* ---------- données d'exemple (couleurs = celles du contrat, ici fictives) ---------- */
const SUR = "#0b0d12"; // texteSur : contraste ≥ 4,5:1 mesuré sur chaque couleur (contrastes.py)
const APPS = [
  { id: "financeai", nom: "FinanceAI", ini: "FI", c: "#2dd4bf" },
  { id: "driveai", nom: "DriveAI", ini: "DR", c: "#60a5fa" },
  { id: "batchchef", nom: "BatchChef", ini: "BC", c: "#fb923c" },
  { id: "carai", nom: "CarAI", ini: "CA", c: "#a3e635" },
  { id: "jobai", nom: "JobAI", ini: "JO", c: "#f472b6" },
  { id: "memoryai", nom: "MemoryAI", ini: "ME", c: "#a78bfa" },
];
const app = (id) => APPS.find((a) => a.id === id);
const style = (a) => `--app:${a.c};--sur:${SUR}`;

/* ---------- gabarit de page ---------- */
const NAV_VUE = [
  ["accueil", "Accueil", "home"],
  ["attention", "Attention", "alert", 3],
  ["couts", "Coûts &amp; quotas", "coins"],
];
function nav(active) {
  const item = (href, label, icon, n, extra = "") =>
    `<a class="nav" href="${href}.html"${active === href ? ' aria-current="page"' : ""}${extra}>${ic(icon)}<span>${label}</span>${n ? `<span class="n">${n}<span class="sr"> à traiter</span></span>` : ""}</a>`;
  return `<aside class="side" aria-label="Navigation">
  <a class="brand" href="accueil.html"><span class="brand__dot" aria-hidden="true"></span>Hubperso</a>
  <nav class="navgroup" aria-label="Vue"><h2>Vue</h2>${NAV_VUE.map((v) => item(v[0], v[1], v[2], v[3])).join("")}</nav>
  <nav class="navgroup" aria-label="Apps"><h2>Apps</h2>${APPS.map((a) =>
    `<a class="nav" style="${style(a)}" href="app.html"${active === "app-" + a.id ? ' aria-current="page"' : ""}><span class="pt" aria-hidden="true"></span><span>${a.nom}</span></a>`).join("")}</nav>
  <nav class="navgroup" aria-label="Gérer"><h2>Gérer</h2>${item("administration", "Administration", "shield")}</nav>
  <div class="profil"><div><p>Propriétaire</p><small>Compte connecté (exemple)</small></div>
    <a class="btn btn--ghost btn--fit" href="login.html">${ic("logout")}Se déconnecter</a></div>
</aside>`;
}
function tabbar(active) {
  const t = (href, label, icon, n) => `<a href="${href}.html"${active === href || (href === "administration" && active.startsWith("app")) ? ' aria-current="page"' : ""}>${ic(icon)}${label}${n ? `<span class="n">${n}</span>` : ""}</a>`;
  return `<nav class="tabbar" aria-label="Navigation principale">${t("accueil", "Accueil", "home")}${t("attention", "Attention", "alert", 3)}${t("couts", "Coûts", "coins")}${t("administration", "Plus", "more")}</nav>`;
}
const HEAD = (titre) => `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${titre} — maquette Hubperso</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300..800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="maquette.css">
</head>`;
const STRIP = `<div class="maquette" role="note"><b>MAQUETTE</b> · thème sombre · toutes les valeurs, noms et couleurs d'app sont des <b>exemples</b>, aucune donnée réelle</div>`;

function page(file, titre, active, contenu) {
  const html = `${HEAD(titre)}
<body>${sprite}${STRIP}
<div class="shell">${nav(active)}
<main class="main" id="contenu">${contenu}</main></div>
${tabbar(active)}
</body></html>
`;
  writeFileSync(join(OUT, file), html);
}
function pageNue(file, titre, contenu) {
  writeFileSync(join(OUT, file), `${HEAD(titre)}\n<body>${sprite}${STRIP}${contenu}</body></html>\n`);
}
const entete = (eyebrow, titre, sous, outils = "") => `<header class="head"><div><p class="eyebrow">${eyebrow}</p><h1 class="display">${titre}</h1>${sous ? `<p class="sous">${sous}</p>` : ""}</div>${outils ? `<div class="outils">${outils}</div>` : ""}</header>`;

/* ---------- widgets ---------- */
const badge = (ton, icone, txt) => `<span class="badge badge--${ton}">${ic(icone)}${txt}</span>`;
const B = {
  ok: badge("ok", "check", "À jour"),
  stale: badge("warn", "clock", "En cache"),
  degraded: badge("warn", "clock", "Données en retard"),
  building: badge("info", "wrench", "En construction"),
  unreachable: badge("danger", "wifioff", "Injoignable"),
  unauthorized: badge("danger", "lock", "Non autorisée"),
  invalid: badge("danger", "filex", "Réponse invalide"),
  toonew: badge("warn", "up", "Contrat trop récent"),
  unconfigured: badge("neutral", "minus", "Non configurée"),
};
const spark = (pts, label) => {
  const max = Math.max(...pts), min = Math.min(...pts);
  const xy = pts.map((v, i) => `${(i / (pts.length - 1)) * 200},${40 - ((v - min) / (max - min || 1)) * 34}`);
  const last = xy[xy.length - 1].split(",");
  return `<svg class="spark" viewBox="0 0 200 44" preserveAspectRatio="none" role="img" aria-label="${label}"><polyline vector-effect="non-scaling-stroke" points="${xy.join(" ")}"/></svg>`;
};
const metrics = (rows) => `<dl class="metrics">${rows.map(([k, v, u]) => `<div><dt>${k}</dt><dd class="tab">${v}${u ? `<small>${u}</small>` : ""}</dd></div>`).join("")}</dl>`;
const head = (a, sous, b) => `<header class="w__head"><span class="avatar" aria-hidden="true">${a.ini}</span><div><h2>${a.nom}</h2><p class="meta">${sous}</p></div>${b}</header>`;
const note = (ton, ico, html) => `<p class="note note--${ton}" role="${ton === "danger" ? "alert" : "note"}">${ic(ico)}<span>${html}</span></p>`;

function widget(id, etat, size = "") {
  const a = app(id);
  const cls = `w ${size ? "w--" + size : ""}`;
  const s = style(a);
  const ouvrir = `<a class="btn btn--ghost btn--fit" href="app.html">Ouvrir ${a.nom}</a>`;
  switch (etat) {
    case "ok":
      return `<article class="${cls}" style="${s}" aria-label="${a.nom}">${head(a, "Relevé il y a 4 min", B.ok)}
${metrics([["Éléments traités", "128"], ["En attente", "7"], ["Erreurs", "0"]])}${spark([4, 6, 5, 8, 7, 10, 9, 12], "Tendance sur 8 relevés : en hausse")}
<div class="w__foot">${ouvrir}<button class="btn btn--app btn--fit" type="button">${ic("play")}Lancer la synchro</button></div></article>`;
    case "degraded":
      return `<article class="${cls} w--warn" style="${s}" aria-label="${a.nom}">${head(a, "Dernier relevé il y a 2 h", B.degraded)}
${metrics([["Éléments traités", "54"], ["En attente", "31"]])}${note("warn", "clock", "<strong>Les chiffres datent de 2 h.</strong> L'app répond mais ne les a pas rafraîchis.")}
<div class="w__foot">${ouvrir}</div></article>`;
    case "building":
      return `<article class="${cls}" style="${s}" aria-label="${a.nom}">${head(a, "Relevé il y a 1 min", B.building)}
${note("info", "wrench", "<strong>L'app se construit.</strong> Elle n'expose pas encore ses chiffres : rien n'est affiché plutôt qu'un chiffre provisoire.")}
<div class="skel" style="width:70%"></div><div class="skel" style="width:45%"></div>
<div class="w__foot">${ouvrir}</div></article>`;
    case "unreachable":
      return `<article class="${cls} w--danger" style="${s}" aria-label="${a.nom}">${head(a, "Dernière réponse : aucune sur cette visite", B.unreachable)}
${note("danger", "wifioff", "<strong>L'app n'a pas répondu à temps (9 s).</strong> Aucun chiffre n'est montré : le dernier connu serait trompeur.")}
<div class="w__foot"><button class="btn btn--ghost btn--fit" type="button">${ic("refresh")}Réessayer</button>${ouvrir}</div></article>`;
    case "unauthorized":
      return `<article class="${cls} w--danger" style="${s}" aria-label="${a.nom}">${head(a, "L'app répond", B.unauthorized)}
${note("danger", "lock", "<strong>L'app refuse le jeton du hub.</strong> Le jeton doit être revérifié côté serveur ; il n'est jamais affiché.")}
<div class="w__foot"><a class="btn btn--ghost btn--fit" href="administration.html">Ouvrir l'administration</a></div></article>`;
    case "invalid":
      return `<article class="${cls} w--danger" style="${s}" aria-label="${a.nom}">${head(a, "L'app répond", B.invalid)}
${note("danger", "filex", "<strong>La réponse ne respecte pas le contrat.</strong> Le hub ne montre rien plutôt qu'un chiffre douteux.")}
<div class="w__foot"><button class="btn btn--ghost btn--fit" type="button">${ic("refresh")}Réessayer</button></div></article>`;
    case "toonew":
      return `<article class="${cls} w--warn" style="${s}" aria-label="${a.nom}">${head(a, "L'app fonctionne", B.toonew)}
${note("warn", "up", "<strong>C'est le hub qui est en retard, pas l'app.</strong> Le contrat de l'app est plus récent que celui du hub : à re-pinner. Jamais masqué par le cache.")}
<div class="w__foot">${ouvrir}</div></article>`;
    case "stale":
      return `<article class="${cls} w--warn" style="${s}" aria-label="${a.nom}">${head(a, "Réponse en cache", B.stale)}
<div class="dim">${metrics([["Éléments traités", "97"], ["En attente", "3"]])}</div>${note("warn", "clock", "<strong>Valeurs du dernier relevé réussi (il y a 26 min).</strong> L'app n'a pas répondu à cette visite.")}
<div class="w__foot"><button class="btn btn--ghost btn--fit" type="button">${ic("refresh")}Réessayer</button></div></article>`;
    case "unconfigured":
      return `<article class="${cls}" style="${s}" aria-label="${a.nom}">${head(a, "Aucune adresse de résumé", B.unconfigured)}
${note("info", "info", "Cette app n'a pas d'adresse honnête à interroger. Elle est listée mais ne remonte aucun chiffre.")}
<div class="w__foot">${ouvrir}</div></article>`;
  }
}

/* ---------- pages ---------- */
// Accueil
page("accueil.html", "Accueil", "accueil", `
${entete("hubperso.com", "Accueil", "4/6 en ligne · rafraîchi à l'instant (exemple)", `<button class="btn btn--ghost btn--fit" type="button">${ic("refresh")}Rafraîchir</button>`)}
<div class="bandeau" role="region" aria-label="Attention"><span class="badge badge--danger">${ic("alert")}3 points</span><p>3 points demandent ton attention : 1 app injoignable, 2 en retard ou à re-pinner.</p><a class="btn btn--primary btn--fit" href="attention.html">Voir</a></div>
<section aria-label="Applications"><div class="bento">
${widget("financeai", "ok", "lg")}${widget("driveai", "degraded")}${widget("batchchef", "building")}
${widget("carai", "unreachable")}${widget("jobai", "toonew")}
<article class="w" style="--app:#8b8fa3;--sur:${SUR}" aria-label="Coûts et quotas">${head({ ini: "€", nom: "Coûts &amp; quotas" }, "Par période, jamais un total global", `<span class="badge badge--neutral">Par unité</span>`)}
${metrics([["Ce mois · USD", "12,40"], ["Ce mois · requêtes", "3 210"]])}<div class="w__foot"><a class="btn btn--ghost btn--fit" href="couts.html">Détail des coûts</a></div></article>
${widget("memoryai", "ok")}
</div></section>
<section class="section" aria-labelledby="etats"><h2 id="etats">États honnêtes d'une carte</h2><p class="sous">Une carte n'invente jamais un chiffre. <a href="etats.html">Voir tous les états</a>.</p></section>
`);

// Page d'une app
{
  const a = app("financeai");
  page("app.html", "Page d'une app", "app-financeai", `
<div style="${style(a)}">
${entete(`<a href="accueil.html" style="text-decoration:none">← Accueil</a>`, `${a.nom}`, "Contrat v1 · relevé il y a 4 min · valeurs d'exemple",
    `<a class="btn btn--app btn--fit" href="#">${ic("ext")}Ouvrir ${a.nom}</a><button class="btn btn--ghost btn--fit" type="button">${ic("refresh")}Rafraîchir</button>`)}
<p style="margin:-8px 0 24px">${B.ok}</p>
<section class="kpis" aria-label="Indicateurs">
<div class="kpi"><span class="tiny">Éléments traités</span><span class="kpi__v">128</span><span class="tend tend--ok">${ic("tup")}en hausse (+12 sur 7 relevés)</span></div>
<div class="kpi"><span class="tiny">En attente</span><span class="kpi__v">7</span><span class="tend tend--n">${ic("minus")}stable</span></div>
<div class="kpi"><span class="tiny">Erreurs</span><span class="kpi__v">0</span><small>aucune sur 7 relevés</small></div>
<div class="kpi"><span class="tiny">Dernière synchro</span><span class="kpi__v" style="font-size:20px">il y a 4 min</span><small>donnée de l'app (dataAsOf)</small></div>
</section>
<div class="cols cols--2 section">
<section class="card" aria-labelledby="hist"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h2 class="h2" id="hist">Historique</h2>
<div class="pills" role="radiogroup" aria-label="Période"><a role="radio" aria-checked="true" aria-current="true" href="#">7 j</a><a role="radio" aria-checked="false" href="#">30 j</a></div></div>
<div style="margin:16px 0">${spark([4, 6, 5, 8, 7, 10, 9, 12], "Éléments traités : de 4 à 12 sur 8 relevés")}</div>
<p class="meta">Éléments traités · 8 relevés : de 4 à 12 (hausse). Le texte double toujours le graphique.</p></section>
<section class="card" aria-labelledby="alr"><h2 class="h2" id="alr">Alertes de l'app</h2>
<ul class="liste" style="margin-top:12px"><li class="ligne ligne--warn"><div class="corps"><p>7 éléments en attente depuis plus de 3 jours</p><p class="meta" style="font-weight:500">Exemple · niveau « à surveiller »</p></div>${badge("warn", "clock", "À surveiller")}</li></ul>
<p class="meta" style="margin-top:12px">Sans alerte : « Aucune alerte » avec l'icône ${"✓"} et le texte, jamais un espace vide.</p></section></div>
<section class="card section" aria-labelledby="det"><h2 class="h2" id="det">Détail</h2><div class="scroll"><table class="table"><caption class="sr">Lignes de détail</caption><thead><tr><th scope="col">Élément</th><th scope="col" class="num">Valeur</th><th scope="col">Statut</th></tr></thead><tbody>
<tr><th scope="row">Import de documents</th><td class="num">128</td><td>${badge("ok", "check", "OK")}</td></tr>
<tr><th scope="row">Rapprochement</th><td class="num">7</td><td>${badge("warn", "clock", "En attente")}</td></tr>
<tr><th scope="row">Export</th><td class="num">0</td><td>${badge("neutral", "minus", "Inactif")}</td></tr></tbody></table></div></section>
<section class="card section" aria-labelledby="act"><h2 class="h2" id="act">Actions</h2><p class="meta" style="margin:4px 0 12px">Action lancée par le serveur du hub, jamais par le navigateur. Confirmation avant exécution.</p>
<div class="outils"><button class="btn btn--app btn--fit" type="button">${ic("play")}Lancer la synchro</button><button class="btn btn--ghost btn--fit" type="button">Recalculer</button></div></section>
</div>`);
}

// Attention
page("attention.html", "Attention", "attention", `
${entete("hubperso.com", "Ce qui demande mon attention", "3 points · exemple")}
<ul class="liste" aria-label="Points d'attention">
<li class="ligne ligne--alert" style="${style(app("carai"))}"><span class="avatar" aria-hidden="true">CA</span><div class="corps"><p>CarAI est injoignable</p><p class="meta" style="font-weight:500">Aucune réponse sur 3 relevés consécutifs (exemple)</p></div>${B.unreachable}<a class="btn btn--ghost btn--fit" href="app.html">Voir l'app</a></li>
<li class="ligne ligne--warn" style="${style(app("jobai"))}"><span class="avatar" aria-hidden="true">JO</span><div class="corps"><p>JobAI a un contrat plus récent que le hub</p><p class="meta" style="font-weight:500">Action côté hub : re-pinner le contrat</p></div>${B.toonew}<a class="btn btn--ghost btn--fit" href="app.html">Voir l'app</a></li>
<li class="ligne ligne--warn" style="${style(app("driveai"))}"><span class="avatar" aria-hidden="true">DR</span><div class="corps"><p>DriveAI : données en retard</p><p class="meta" style="font-weight:500">Dernier relevé il y a 2 h</p></div>${B.degraded}<a class="btn btn--ghost btn--fit" href="app.html">Voir l'app</a></li></ul>
<section class="observation section" aria-labelledby="obs"><h2 class="h1" id="obs">Ce que le hub a pu observer</h2><p class="sous" style="margin-bottom:12px">Constats tirés de l'historique des relevés, sans interprétation.</p>
<div class="card card--plate"><ul class="liste"><li>${ic("tdown")} Un point observé (exemple) : un indicateur a baissé sur 5 relevés.</li><li>${ic("info")} Un autre constat (exemple) : un relevé manque entre deux dates.</li></ul></div></section>
`);

// Coûts
const cout = (id, lignes) => {
  const a = app(id);
  return `<section class="card" style="${style(a)};border-top:3px solid var(--app)" aria-label="${a.nom}"><header class="w__head" style="margin-bottom:12px"><span class="avatar" aria-hidden="true">${a.ini}</span><div><h2 class="h2">${a.nom}</h2></div></header>
<div class="scroll"><table class="table"><thead><tr><th scope="col">Ligne</th><th scope="col" class="num">Utilisé</th><th scope="col">Quota</th></tr></thead><tbody>${lignes.map(([n, v, u, q]) => `<tr><th scope="row">${n}</th><td class="num">${v}<span class="meta"> ${u}</span></td><td>${q}</td></tr>`).join("")}</tbody></table></div></section>`;
};
const quota = (p, ton) => `<span class="badge badge--${ton}">${ic(ton === "ok" ? "check" : "alert")}${p} % du quota</span>`;
page("couts.html", "Coûts et quotas", "couts", `
${entete("hubperso.com", "Coûts &amp; quotas", "Somme PAR période et par unité · valeurs d'exemple", `<div class="pills" role="radiogroup" aria-label="Période"><a role="radio" aria-checked="true" aria-current="true" href="#">Jour</a><a role="radio" aria-checked="false" href="#">Mois</a></div>`)}
<section aria-label="Totaux par période"><div class="kpis">
<div class="kpi"><span class="tiny">Ce mois · USD</span><span class="kpi__v">12,40</span><small>3 apps concernées</small></div>
<div class="kpi"><span class="tiny">Ce mois · requêtes</span><span class="kpi__v">3 210</span><small>2 apps concernées</small></div>
<div class="kpi"><span class="tiny">Aujourd'hui · USD</span><span class="kpi__v">0,42</span><small>1 app concernée</small></div></div>
${note("info", "info", "<strong>Aucun total global.</strong> Des dollars, des requêtes et des minutes ne s'additionnent pas : chaque unité a son propre total.")}</section>
<div class="cols cols--2 section">
${cout("financeai", [["Modèle A", "8,10", "USD", quota(41, "ok")], ["Requêtes", "1 900", "req.", quota(63, "ok")]])}
${cout("driveai", [["Modèle A", "3,20", "USD", quota(87, "warn")], ["Traitements", "1 310", "req.", quota(26, "ok")]])}
${cout("batchchef", [["Modèle B", "1,10", "USD", quota(11, "ok")]])}
<section class="vide" aria-label="Apps sans coût"><h3>3 apps sans coût déclaré</h3><p class="meta">CarAI, JobAI et MemoryAI ne publient pas de coût. Ligne vide, jamais un « 0 » inventé.</p></section></div>
`);

// Administration
const personne = (nom, mail, actifs) => `<li class="card card--plate"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px"><div><p class="h2">${nom}</p><p class="meta">${mail}</p></div><button class="btn btn--ghost btn--fit" type="button">Retirer la personne</button></div>
<ul class="chips" aria-label="Accès par app">${APPS.map((a) => { const on = actifs.includes(a.id); return `<li><button class="chip" style="--app:${a.c}" type="button" aria-pressed="${on}"><span class="pt" aria-hidden="true"></span>${on ? "✓" : "+"} ${a.nom}</button></li>`; }).join("")}</ul></li>`;
page("administration.html", "Administration", "administration", `
${entete("hubperso.com", "Administration", "Réservée au propriétaire", `<a class="btn btn--ghost btn--fit" href="accueil.html">${ic("back")}Hub</a>`)}
<p class="sous" style="font-size:14px;margin-bottom:24px;max-width:70ch">Une app accordée entière, jamais un niveau de lecture/écriture séparé. Le propriétaire a accès à tout, toujours : il n'apparaît pas ci-dessous.</p>
<form class="card" onsubmit="return false" aria-label="Ajouter une personne"><h2 class="h2" style="margin-bottom:12px">Ajouter une personne</h2><div class="outils" style="align-items:flex-end">
<div class="field"><label for="m">Adresse e-mail</label><input id="m" class="input" type="email" placeholder="adresse@exemple.com" required></div>
<div class="field"><label for="n">Nom (facultatif)</label><input id="n" class="input" type="text" placeholder="nom"></div>
<button class="btn btn--primary btn--fit" type="submit">${ic("plus")}Ajouter</button></div></form>
<ul class="liste section" aria-label="Personnes">${personne("Personne 1 (exemple)", "personne1@exemple.com", ["financeai", "batchchef"])}${personne("Personne 2 (exemple)", "personne2@exemple.com", [])}</ul>
<section class="section" aria-labelledby="ea"><h2 class="h1" id="ea">États de la page</h2><div class="cols cols--2" style="margin-top:12px">
<div>${note("info", "info", "<strong>Aucune base configurée.</strong> Sans elle, personne ne peut être ajouté : seul le propriétaire a accès au hub.")}</div>
<div>${note("danger", "wifioff", "<strong>Base injoignable pour l'instant.</strong> Réessaie dans un instant ; si ça persiste, vérifie la configuration.")}</div>
<div><section class="vide" style="padding:20px"><p class="meta">Personne d'ajouté pour l'instant.</p></section></div></div></section>
`);

// États honnêtes
page("etats.html", "États honnêtes", "accueil", `
${entete("hubperso.com", "États honnêtes d'une carte", "Un état n'est jamais porté par la couleur seule : couleur + icône + libellé + phrase")}
<div class="bento" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
${["ok", "stale", "degraded", "building", "unreachable", "unauthorized", "invalid", "toonew", "unconfigured"].map((e, i) => widget(APPS[i % 6].id, e)).join("")}
<article class="w" style="--app:#8b8fa3;--sur:${SUR}" aria-label="Chargement">${head({ ini: "…", nom: "Chargement" }, "Squelette", `<span class="badge badge--neutral">${ic("clock")}En cours</span>`)}<div class="skel" style="width:80%"></div><div class="skel" style="width:55%"></div><div class="skel" style="width:65%"></div></article>
</div>
<section class="section" aria-labelledby="v"><h2 class="h1" id="v">État vide de la page Attention</h2><div class="vide" style="margin-top:12px"><span class="badge badge--ok">${ic("check")}Tout va bien</span><h3>Rien ne demande ton attention</h3><p class="meta">Toutes les apps répondent et leurs données sont à jour.</p></div></section>
`);

// Connexion
pageNue("login.html", "Connexion", `<main class="login"><section class="card login__card" aria-labelledby="t"><p class="eyebrow">hubperso.com</p><h1 id="t">Hub privé</h1>
<p>Ce tableau de bord affiche des données personnelles. Connecte-toi pour y accéder.</p>
<button class="btn btn--primary" type="button">${ic("user")}Se connecter avec Google</button>
<p class="meta">Variante avec erreur ci-dessous.</p>
${note("danger", "alert", "<strong>Connexion refusée.</strong> Réessaie avec le compte qui a accès au hub.")}</section></main>`);
pageNue("sans-acces.html", "Pas d'accès", `<main class="login"><section class="card login__card" aria-labelledby="t"><p class="eyebrow">hubperso.com</p><h1 id="t">Pas d'accès à ce tableau de bord</h1>
<p>Tu es bien connecté avec <strong style="color:var(--titre)">adresse@exemple.com</strong>, mais ce compte n'a pas accès au tableau de bord du hub.</p>
<p>Ta connexion reste valable pour les apps auxquelles tu as accès : rouvre simplement le lien qu'on t'a transmis. Si tu penses qu'il manque un accès, demande-le à Marc.</p>
<button class="btn btn--ghost" type="button">${ic("logout")}Se déconnecter</button></section></main>`);

// Aperçu 360 / 768 / 1440
pageNue("apercu.html", "Aperçu des tailles", `<main style="padding:24px 16px">
<p class="eyebrow">Aperçu</p><h1 class="display">360 · 768 · 1440</h1>
<p class="sous" style="margin-bottom:16px">Écran : <span id="ecrans"></span></p>
<div class="apercu" id="cadres"></div></main>
<script>
var E=["accueil","app","attention","couts","administration","etats","login","sans-acces"];
var p=new URLSearchParams(location.search),e=p.get("e");if(E.indexOf(e)<0)e="accueil";
document.getElementById("ecrans").innerHTML=E.map(function(x){return x===e?"<b>"+x+"</b>":'<a href="?e='+x+'">'+x+"</a>"}).join(" · ");
var S=[[360,760,1],[768,900,.7],[1440,900,.5]];
document.getElementById("cadres").innerHTML=S.map(function(s){return "<figure><figcaption class='meta'>"+s[0]+" px</figcaption><iframe title='"+e+" "+s[0]+"' src='"+e+".html' style='width:"+s[0]+"px;height:"+s[1]+"px;zoom:"+s[2]+"'></iframe></figure>"}).join("");
</script>`);

// Sommaire
const SW = [["dark", "#07090D"], ["surface", "#0E1014"], ["surface-hl", "#15181E"], ["primary (argent)", "#E6EAF2"], ["accent Hubperso", "#93A0FF"], ["succès", "#34D399"], ["alerte", "#FBBF24"], ["danger", "#F87171"], ["info", "#60A5FA"]];
pageNue("index.html", "Refonte Hubperso", `<main style="max-width:960px;margin:0 auto;padding:32px 16px 64px">
<p class="eyebrow">Refonte · maquettes statiques</p><h1 class="display">Hubperso au style du nouveau FinanceAI</h1>
<p class="sous" style="font-size:14px;margin:8px 0 24px">Thème sombre seul (décision de Marc, 26/09). Rien n'est codé dans l'app : à valider visuellement avant toute passation. Référence : <span class="mono">docs/design/reference-style-financeai.md</span> (atelier).</p>
<h2 class="h1">Écrans</h2><ul class="cols cols--2" style="margin:12px 0 32px">
${[["accueil", "Accueil (bento de widgets génériques)"], ["app", "Page d'une app"], ["attention", "Attention"], ["couts", "Coûts &amp; quotas"], ["administration", "Administration"], ["login", "Connexion"], ["sans-acces", "Sans accès"], ["etats", "États honnêtes : injoignable, non autorisée, invalide, contrat trop récent, en construction, cache, vide"], ["apercu", "Aperçu 360 / 768 / 1440 côte à côte"]].map(([f, t]) => `<li><a class="card card--plate" style="display:block;text-decoration:none;min-height:var(--cible)" href="${f}.html"><span class="h2">${t}</span><br><span class="meta">${f}.html</span></a></li>`).join("")}</ul>
<h2 class="h1">Palette</h2><div class="sw" style="margin:12px 0 32px">${SW.map(([n, c]) => `<div><i style="background:${c}"></i><span>${n}<br>${c}</span></div>`).join("")}</div>
<h2 class="h1">Accent secondaire proposé pour Hubperso : « indigo brume » #93A0FF</h2>
<p style="margin:8px 0 12px;max-width:70ch">Un seul accent, discret : marque du menu actif, point de la marque, sur-titre de page. Jamais pour un état. Plus bleu que le violet #8B5CF6 de FinanceAI (donc reconnaissable) ; contraste 7,9:1 sur les cartes, contre 4,50 pour le violet (limite), donc utilisable pour du petit texte.</p>
<h2 class="h1">Contrastes mesurés</h2><p class="meta" style="margin:4px 0 12px">Script <span class="mono">contrastes.py</span> : 16 paires de jetons + 6 couleurs d'app avec texteSur, toutes ≥ 4,5:1 (texte) ou ≥ 3:1 (graphique), 0 échec.</p>
</main>`);

console.log("pages générées dans", OUT);
