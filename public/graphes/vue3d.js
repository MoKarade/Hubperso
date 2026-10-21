// public/graphes/vue3d.js — le visualiseur 3D des graphes de code du hub.
//
// Chargé par la page de `lib/grapheVue3d.ts`, en bac à sable (origine opaque, `connect-src 'none'`) :
// il ne lit que le JSON inerte `#donnees` et la bibliothèque `ForceGraph3D` (3d-force-graph, copie
// auto-hébergée). Tout texte venu du dépôt est posé par `textContent` ; les couleurs sont celles du
// hub (le bac à sable ne voit pas `globals.css`). Aucun appel réseau, aucun stockage.
//
// Peu de texte, gros : les noms n'apparaissent qu'au survol, à la sélection et en zoomant.
// `prefers-reduced-motion` coupe la rotation, les lumières sur les liens, l'envol de la caméra.
(function () {
  "use strict";

  var FOND = "#07090D";
  var TEXTE = "#E2E8F0";
  var DOUX = "#94A3B8";
  var MARQUE = "#93A0FF";
  var SURFACE = "#0E1014";
  var BORD = "rgba(255,255,255,0.12)";
  var PALETTE = ["#93A0FF", "#34D399", "#FBBF24", "#F87171", "#22D3EE", "#E879F9", "#A3E635", "#FB923C", "#60A5FA", "#C4B5FD"];
  var AUTRES = "#8896A8";

  var reduit = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ── données ──────────────────────────────────────────────────────────────────────────
  var D;
  try {
    D = JSON.parse(document.getElementById("donnees").textContent);
  } catch (e) {
    D = null;
  }

  function el(balise, classe, texte) {
    var n = document.createElement(balise);
    if (classe) n.className = classe;
    if (texte !== undefined) n.textContent = texte;
    return n;
  }

  function injecterStyle() {
    var s = el("style");
    s.textContent =
      "html,body{margin:0;height:100%;background:" + FOND + ";color:" + TEXTE + ";overflow:hidden;" +
      "font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-tap-highlight-color:transparent}" +
      "#scene{position:fixed;inset:0;cursor:grab}#scene:active{cursor:grabbing}" +
      "*{box-sizing:border-box}.v3-haut,.v3-panneau,.v3-legende{position:fixed;z-index:5}" +
      ".v3-haut{top:max(12px,env(safe-area-inset-top));left:12px;right:12px;display:flex;flex-direction:column;gap:10px;pointer-events:none}" +
      ".v3-haut>*{pointer-events:auto}" +
      ".v3-barre{display:flex;flex-wrap:wrap;align-items:center;gap:10px;pointer-events:none}" +
      ".v3-barre>*{pointer-events:auto}" +
      ".v3-titre{margin:0 8px 0 0;font-size:clamp(1.5rem,1.1rem + 2vw,2.2rem);font-weight:700;letter-spacing:-0.01em}" +
      ".v3-meta{color:" + DOUX + ";font-size:1rem}" +
      ".v3-bouton{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;min-width:44px;padding:0 16px;" +
      "border-radius:12px;border:1px solid " + BORD + ";background:" + SURFACE + ";color:" + TEXTE + ";font:inherit;font-size:1.05rem;font-weight:600;" +
      "text-decoration:none;cursor:pointer;transition:background .2s,border-color .2s,transform .2s}" +
      ".v3-bouton:hover,.v3-bouton:focus-visible{border-color:" + MARQUE + ";outline:none}" +
      ".v3-bouton[aria-pressed=true],.v3-bouton--actif{background:" + MARQUE + ";border-color:" + MARQUE + ";color:" + FOND + "}" +
      ".v3-recherche{width:min(22rem,100%)}" +
      ".v3-recherche input{width:100%;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid " + BORD + ";" +
      "background:" + SURFACE + ";color:" + TEXTE + ";font:inherit;font-size:16px}" +
      ".v3-recherche input:focus{outline:none;border-color:" + MARQUE + "}" +
      ".v3-resultats{display:flex;flex-direction:column;margin-top:6px;border-radius:12px;overflow:hidden;background:" + SURFACE + ";border:1px solid " + BORD + "}" +
      ".v3-resultats:empty{display:none}" +
      ".v3-resultats .v3-bouton{justify-content:flex-start;border:0;border-radius:0;font-weight:500}" +
      ".v3-legende{left:12px;bottom:max(12px,env(safe-area-inset-bottom));max-width:min(19rem,calc(100vw - 24px));max-height:38vh;display:flex;flex-direction:column;gap:6px}" +
      ".v3-liste{overflow:auto;display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:12px;background:" + SURFACE + ";border:1px solid " + BORD + "}" +
      ".v3-liste[hidden]{display:none}" +
      ".v3-dossier{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:" + TEXTE + ";font:inherit;font-size:1.05rem;text-align:left;cursor:pointer}" +
      ".v3-dossier:hover,.v3-dossier[aria-pressed=true]{background:rgba(255,255,255,0.08)}" +
      ".v3-dossier i{flex:none;width:14px;height:14px;border-radius:50%;box-shadow:0 0 10px currentColor}" +
      ".v3-dossier span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".v3-dossier b{color:" + DOUX + ";font-weight:500;font-size:.95rem}" +
      ".v3-panneau{right:12px;bottom:max(12px,env(safe-area-inset-bottom));width:min(24rem,calc(100vw - 24px));max-height:46vh;display:flex;flex-direction:column;gap:8px;" +
      "padding:16px;border-radius:16px;border:1px solid " + BORD + ";background:" + SURFACE + ";box-shadow:0 12px 40px rgba(0,0,0,.55);" +
      "transform:translateY(24px);opacity:0;pointer-events:none;transition:transform .35s cubic-bezier(.16,1,.3,1),opacity .25s}" +
      ".v3-panneau.v3-ouvert{transform:none;opacity:1;pointer-events:auto}" +
      ".v3-panneau h2{margin:0;font-size:1.5rem;line-height:1.2;overflow-wrap:anywhere}" +
      ".v3-panneau code{color:" + DOUX + ";font-size:.95rem;overflow-wrap:anywhere}" +
      ".v3-panneau h3{margin:4px 0 0;font-size:1rem;color:" + DOUX + ";font-weight:500}" +
      ".v3-voisins{overflow:auto;display:flex;flex-wrap:wrap;gap:6px}" +
      ".v3-voisins .v3-bouton{min-height:44px;font-weight:500;padding:0 12px}" +
      ".v3-ferme{position:absolute;top:8px;right:8px}" +
      ".v3-etiquette{position:fixed;z-index:4;left:0;top:0;pointer-events:none;white-space:nowrap;font-size:clamp(1rem,.9rem + .5vw,1.3rem);font-weight:600;" +
      "color:" + TEXTE + ";text-shadow:0 0 6px " + FOND + ",0 0 14px " + FOND + ",0 1px 2px " + FOND + ";will-change:transform}" +
      ".v3-aide{position:fixed;z-index:3;left:50%;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 70px);transform:translateX(-50%);max-width:min(30rem,calc(100vw - 48px));text-align:center;" +
      "font-size:1.2rem;color:" + DOUX + ";pointer-events:none;transition:opacity 1s}" +
      ".v3-etat{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font-size:1.3rem}" +
      "@media (max-width:640px){.v3-panneau{max-height:40vh}.v3-legende{max-height:30vh}.v3-avec-panneau .v3-legende{display:none}}";
    if (!reduit) {
      s.textContent +=
        "@keyframes v3-entree{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}" +
        ".v3-barre>*{animation:v3-entree .7s cubic-bezier(.16,1,.3,1) both}" +
        ".v3-barre>*:nth-child(2){animation-delay:.08s}.v3-barre>*:nth-child(3){animation-delay:.16s}.v3-barre>*:nth-child(4){animation-delay:.24s}.v3-barre>*:nth-child(5){animation-delay:.32s}" +
        ".v3-recherche,.v3-legende{animation:v3-entree .8s .35s cubic-bezier(.16,1,.3,1) both}" +
        ".v3-bouton:active{transform:scale(.96)}";
    }
    document.head.appendChild(s);
  }

  function etatErreur(message) {
    injecterStyle();
    var boite = el("div", "v3-etat");
    boite.setAttribute("role", "alert");
    boite.appendChild(el("p", "", message));
    var lien = el("a", "v3-bouton", "Vue 2D");
    lien.href = "?vue=2d";
    boite.appendChild(lien);
    document.body.appendChild(boite);
  }

  function webglDisponible() {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch (e) {
      return false;
    }
  }

  if (!D || !D.noeuds || !D.liens) return etatErreur("Données du graphe illisibles.");
  if (typeof window.ForceGraph3D !== "function") return etatErreur("La bibliothèque 3D n'a pas pu se charger.");
  if (!webglDisponible()) return etatErreur("Ce navigateur n'offre pas la 3D (WebGL).");

  // ── modèle ───────────────────────────────────────────────────────────────────────────
  function hexVersRgba(hex, alpha) {
    var v = parseInt(hex.slice(1), 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + alpha + ")";
  }

  var nodes = D.noeuds.map(function (n, i) {
    return { id: i, nom: n.nom, fichier: n.fichier, dossier: n.dossier, type: n.type, degre: n.degre, taille: n.taille, voisins: [], liens: [] };
  });

  // Une couleur par dossier, les plus gros d'abord ; au-delà de la palette, « autres ».
  var parDossier = {};
  nodes.forEach(function (n) { parDossier[n.dossier] = (parDossier[n.dossier] || 0) + 1; });
  var dossiers = Object.keys(parDossier).sort(function (a, b) { return parDossier[b] - parDossier[a]; });
  var couleurDossier = {};
  dossiers.forEach(function (d, i) { couleurDossier[d] = i < PALETTE.length ? PALETTE[i] : AUTRES; });
  nodes.forEach(function (n) {
    n.couleur = couleurDossier[n.dossier];
    n.pale = hexVersRgba(n.couleur, 0.1);
    n.lien = hexVersRgba(n.couleur, 0.4);
  });

  var links = D.liens.map(function (l, i) {
    var a = nodes[l.de];
    var b = nodes[l.vers];
    var lien = { source: l.de, target: l.vers, relation: l.relation, sur: l.sur, i: i, a: a, b: b };
    a.voisins.push(b);
    b.voisins.push(a);
    a.liens.push(lien);
    b.liens.push(lien);
    return lien;
  });

  var parDegre = nodes.slice().sort(function (a, b) { return b.degre - a.degre; });
  var concentrateurs = parDegre.slice(0, 40);

  // ── état ─────────────────────────────────────────────────────────────────────────────
  var selection = null;
  var ensemble = null; // nœuds éclairés : la sélection et ses voisins
  var dossierActif = null;
  var survol = null;
  var distanceAjustee = 0;

  function eclaire(n) {
    if (ensemble) return ensemble.has(n);
    if (dossierActif) return n.dossier === dossierActif;
    return true;
  }

  function lienEclaire(l) {
    if (selection) return l.a === selection || l.b === selection;
    if (dossierActif) return l.a.dossier === dossierActif && l.b.dossier === dossierActif;
    return false;
  }

  function lienEteint(l) {
    return !!(selection || dossierActif) && !lienEclaire(l);
  }

  // ── interface ────────────────────────────────────────────────────────────────────────
  injecterStyle();

  var scene = el("div");
  scene.id = "scene";
  document.body.appendChild(scene);

  var haut = el("div", "v3-haut");
  var barre = el("div", "v3-barre");
  barre.appendChild(el("h1", "v3-titre", D.depot));
  barre.appendChild(el("span", "v3-meta", nodes.length + " nœuds · " + links.length + " liens"));
  var btnRotation = el("button", "v3-bouton", reduit ? "Tourner" : "Pause");
  btnRotation.type = "button";
  btnRotation.setAttribute("aria-pressed", String(reduit));
  var btnCentrer = el("button", "v3-bouton", "Recentrer");
  btnCentrer.type = "button";
  var lien2d = el("a", "v3-bouton", "2D");
  lien2d.href = "?vue=2d";
  lien2d.setAttribute("aria-label", "Ouvrir la vue 2D");
  barre.appendChild(btnRotation);
  barre.appendChild(btnCentrer);
  barre.appendChild(lien2d);
  haut.appendChild(barre);

  var recherche = el("div", "v3-recherche");
  var champ = el("input");
  champ.type = "search";
  champ.placeholder = "Chercher un nom";
  champ.setAttribute("aria-label", "Chercher un nœud");
  champ.autocomplete = "off";
  var resultats = el("div", "v3-resultats");
  recherche.appendChild(champ);
  recherche.appendChild(resultats);
  haut.appendChild(recherche);
  document.body.appendChild(haut);

  var legende = el("div", "v3-legende");
  var btnLegende = el("button", "v3-bouton", "Dossiers (" + dossiers.length + ")");
  btnLegende.type = "button";
  btnLegende.setAttribute("aria-pressed", "false");
  var liste = el("div", "v3-liste");
  liste.hidden = true;
  var boutonsDossier = {};
  dossiers.forEach(function (d) {
    var b = el("button", "v3-dossier");
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    var puce = el("i");
    puce.style.color = couleurDossier[d];
    puce.style.background = couleurDossier[d];
    b.appendChild(puce);
    b.appendChild(el("span", "", d));
    b.appendChild(el("b", "", String(parDossier[d])));
    b.addEventListener("click", function () { choisirDossier(dossierActif === d ? null : d); });
    boutonsDossier[d] = b;
    liste.appendChild(b);
  });
  legende.appendChild(btnLegende);
  legende.appendChild(liste);
  document.body.appendChild(legende);

  var panneau = el("section", "v3-panneau");
  panneau.setAttribute("aria-label", "Détail du nœud");
  document.body.appendChild(panneau);

  var aide = el("p", "v3-aide", "Glisser pour tourner · molette ou pincer pour zoomer · toucher un point pour l'explorer");
  document.body.appendChild(aide);
  setTimeout(function () { aide.style.opacity = "0"; }, 7000);

  var calqueEtiquettes = el("div");
  document.body.appendChild(calqueEtiquettes);

  // ── graphe ───────────────────────────────────────────────────────────────────────────
  var G = window.ForceGraph3D({ controlType: "orbit" })(scene)
    .backgroundColor(FOND)
    .showNavInfo(false)
    .enableNodeDrag(false)
    .nodeId("id")
    .nodeLabel(function () { return ""; })
    .nodeRelSize(4)
    .nodeVal(function (n) { return Math.pow(n.taille / 10, 1.5) * (n === selection ? 1.6 : 1); })
    .nodeResolution(12)
    .nodeOpacity(reduit ? 0.95 : 0)
    .nodeColor(function (n) {
      if (n === selection) return "#FFFFFF";
      return eclaire(n) ? n.couleur : n.pale;
    })
    .linkColor(function (l) {
      if (lienEclaire(l)) return "rgba(255,255,255,0.9)";
      if (lienEteint(l)) return "rgba(255,255,255,0.025)";
      return l.a.lien;
    })
    .linkOpacity(1)
    .linkWidth(function (l) { return lienEclaire(l) ? 0.8 : l.sur ? 0.5 : 0.25; })
    .linkDirectionalParticles(function (l) {
      if (reduit) return 0;
      if (lienEclaire(l)) return 3;
      if (selection || dossierActif) return 0;
      return l.i % (links.length > 2500 ? 8 : 4) === 0 ? 1 : 0;
    })
    .linkDirectionalParticleWidth(function (l) { return lienEclaire(l) ? 1.8 : 1.3; })
    .linkDirectionalParticleSpeed(function (l) { return lienEclaire(l) ? 0.012 : 0.005; })
    .linkDirectionalParticleColor(function (l) { return lienEclaire(l) ? "#FFFFFF" : l.a.couleur; })
    .cooldownTime(7000)
    .onNodeHover(function (n) {
      survol = n || null;
      scene.style.cursor = n ? "pointer" : "";
    })
    .onNodeClick(function (n) { selectionner(n); })
    .onBackgroundClick(function () { selectionner(null); })
    .graphData({ nodes: nodes, links: links });

  var controles = G.controls();
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.autoRotate = !reduit;
  controles.autoRotateSpeed = 0.7;
  controles.addEventListener("start", function () { arreterRotation(); });

  function arreterRotation() {
    controles.autoRotate = false;
    btnRotation.setAttribute("aria-pressed", "true");
    btnRotation.textContent = "Tourner";
  }

  function redessiner() {
    G.nodeColor(G.nodeColor()).nodeVal(G.nodeVal()).linkColor(G.linkColor()).linkWidth(G.linkWidth())
      .linkDirectionalParticles(G.linkDirectionalParticles())
      .linkDirectionalParticleWidth(G.linkDirectionalParticleWidth())
      .linkDirectionalParticleColor(G.linkDirectionalParticleColor());
  }

  function redimensionner() { G.width(window.innerWidth).height(window.innerHeight); }
  window.addEventListener("resize", redimensionner);
  redimensionner();

  // Entrée : la caméra part de loin et plonge vers le graphe pendant qu'il se déplie ; les
  // nœuds se fondent. Puis le graphe se cadre tout seul quand la simulation se pose.
  var cadre = false;
  if (!reduit) {
    G.cameraPosition({ x: 0, y: 260, z: 1500 });
    setTimeout(function () {
      G.cameraPosition({ x: 0, y: 120, z: 520 }, { x: 0, y: 0, z: 0 }, 2600);
    }, 150);
    var pas = 0;
    var fondu = setInterval(function () {
      pas += 1;
      G.nodeOpacity(Math.min(0.95, pas * 0.08));
      if (pas >= 12) clearInterval(fondu);
    }, 90);
  }
  // Cadrage : on cadre le cœur du graphe (85 % des nœuds, les plus proches du centre), pas les
  // quelques isolés lointains qui rapetisseraient tout. La caméra garde son angle et recule ou
  // avance sur l'axe qui la relie au centre.
  function cadrer(ms) {
    var cx = 0, cy = 0, cz = 0;
    nodes.forEach(function (n) { cx += n.x; cy += n.y; cz += n.z; });
    cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
    var ordre = nodes.map(function (n) {
      return Math.sqrt((n.x - cx) * (n.x - cx) + (n.y - cy) * (n.y - cy) + (n.z - cz) * (n.z - cz));
    }).sort(function (a, b) { return a - b; });
    var rayon = ordre[Math.floor(ordre.length * 0.85)] || 100;
    var cam = G.camera().position;
    var dx = cam.x - cx, dy = cam.y - cy, dz = cam.z - cz;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var cible = rayon * 2.3;
    G.cameraPosition(
      { x: cx + (dx / d) * cible, y: cy + (dy / d) * cible, z: cz + (dz / d) * cible },
      { x: cx, y: cy, z: cz },
      ms
    );
    setTimeout(mesurerDistance, ms + 200);
  }
  G.onEngineStop(function () {
    if (cadre) return;
    cadre = true;
    cadrer(reduit ? 0 : 1400);
  });
  function mesurerDistance() {
    distanceAjustee = G.camera().position.distanceTo(controles.target);
  }

  // ── gestes ───────────────────────────────────────────────────────────────────────────
  function voler(n) {
    var d = 130;
    var r = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    var pos = r < 1 ? { x: n.x, y: n.y, z: n.z + d } : { x: n.x * (1 + d / r), y: n.y * (1 + d / r), z: n.z * (1 + d / r) };
    G.cameraPosition(pos, { x: n.x, y: n.y, z: n.z }, reduit ? 0 : 1100);
  }

  function selectionner(n) {
    selection = n;
    if (n) {
      ensemble = new Set(n.voisins);
      ensemble.add(n);
      dossierActif = null;
      majDossiers();
      arreterRotation();
      voler(n);
      ouvrirPanneau(n);
    } else {
      ensemble = null;
      fermerPanneau();
    }
    redessiner();
  }

  function choisirDossier(d) {
    if (d) {
      selection = null;
      ensemble = null;
      fermerPanneau();
    }
    dossierActif = d;
    majDossiers();
    redessiner();
    if (d) {
      arreterRotation();
      G.zoomToFit(reduit ? 0 : 900, 60, function (n) { return n.dossier === d; });
    }
  }

  function majDossiers() {
    dossiers.forEach(function (d) { boutonsDossier[d].setAttribute("aria-pressed", String(d === dossierActif)); });
  }

  function fermerPanneau() {
    panneau.classList.remove("v3-ouvert");
    document.body.classList.remove("v3-avec-panneau");
  }

  function ouvrirPanneau(n) {
    panneau.textContent = "";
    var fermer = el("button", "v3-bouton v3-ferme", "×");
    fermer.type = "button";
    fermer.setAttribute("aria-label", "Fermer");
    fermer.addEventListener("click", function () { selectionner(null); });
    panneau.appendChild(fermer);
    panneau.appendChild(el("h2", "", n.nom));
    if (n.fichier) panneau.appendChild(el("code", "", n.fichier));
    panneau.appendChild(el("span", "v3-meta", n.degre + (n.degre > 1 ? " liens" : " lien") + " · " + n.dossier));
    if (n.voisins.length) {
      panneau.appendChild(el("h3", "", "Liés"));
      var zone = el("div", "v3-voisins");
      n.voisins
        .slice()
        .sort(function (a, b) { return b.degre - a.degre; })
        .slice(0, 40)
        .forEach(function (v) {
          var b = el("button", "v3-bouton", v.nom);
          b.type = "button";
          b.style.borderColor = v.couleur;
          b.addEventListener("click", function () { selectionner(v); });
          zone.appendChild(b);
        });
      panneau.appendChild(zone);
    }
    panneau.classList.add("v3-ouvert");
    document.body.classList.add("v3-avec-panneau");
  }

  btnRotation.addEventListener("click", function () {
    controles.autoRotate = !controles.autoRotate;
    btnRotation.setAttribute("aria-pressed", String(!controles.autoRotate));
    btnRotation.textContent = controles.autoRotate ? "Pause" : "Tourner";
  });
  btnCentrer.addEventListener("click", function () {
    selection = null;
    ensemble = null;
    dossierActif = null;
    majDossiers();
    fermerPanneau();
    redessiner();
    cadrer(reduit ? 0 : 900);
  });
  btnLegende.addEventListener("click", function () {
    liste.hidden = !liste.hidden;
    btnLegende.setAttribute("aria-pressed", String(!liste.hidden));
  });

  function normaliser(t) {
    return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  champ.addEventListener("input", function () {
    resultats.textContent = "";
    var q = normaliser(champ.value.trim());
    if (q.length < 2) return;
    parDegre
      .filter(function (n) { return normaliser(n.nom).indexOf(q) !== -1; })
      .slice(0, 6)
      .forEach(function (n) {
        var b = el("button", "v3-bouton", n.nom);
        b.type = "button";
        b.addEventListener("click", function () {
          resultats.textContent = "";
          champ.value = "";
          selectionner(n);
        });
        resultats.appendChild(b);
      });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") selectionner(null);
  });

  // ── étiquettes : survol, sélection et voisins ; les nœuds principaux seulement en zoomant ──
  var pool = [];
  function etiquette(i) {
    if (!pool[i]) {
      pool[i] = el("div", "v3-etiquette");
      calqueEtiquettes.appendChild(pool[i]);
    }
    return pool[i];
  }

  var vecteur = G.camera().position.clone();
  function boucleEtiquettes() {
    var cam = G.camera();
    var L = window.innerWidth;
    var H = window.innerHeight;
    var candidats = [];
    if (survol) candidats.push(survol);
    if (selection) {
      candidats.push(selection);
      selection.voisins.slice().sort(function (a, b) { return b.degre - a.degre; }).slice(0, 18).forEach(function (v) { candidats.push(v); });
    } else if (distanceAjustee > 0 && cam.position.distanceTo(controles.target) < distanceAjustee * 0.55) {
      concentrateurs.forEach(function (n) { if (eclaire(n)) candidats.push(n); });
    }
    var posees = [];
    var utilisees = 0;
    for (var k = 0; k < candidats.length && utilisees < 26; k++) {
      var n = candidats[k];
      if (n.x === undefined) continue;
      vecteur.set(n.x, n.y, n.z).project(cam);
      if (vecteur.z < -1 || vecteur.z > 1 || Math.abs(vecteur.x) > 1.05 || Math.abs(vecteur.y) > 1.05) continue;
      var x = (vecteur.x * 0.5 + 0.5) * L;
      var y = (-vecteur.y * 0.5 + 0.5) * H;
      var libre = true;
      for (var j = 0; j < posees.length; j++) {
        if (Math.abs(posees[j].x - x) < 150 && Math.abs(posees[j].y - y) < 26) { libre = false; break; }
      }
      if (!libre && n !== survol && n !== selection) continue;
      posees.push({ x: x, y: y });
      var e = etiquette(utilisees++);
      if (e.textContent !== n.nom) e.textContent = n.nom;
      e.style.display = "block";
      e.style.transform = "translate(" + Math.round(x + 12) + "px," + Math.round(y - 30) + "px)";
    }
    for (var q = utilisees; q < pool.length; q++) pool[q].style.display = "none";
    requestAnimationFrame(boucleEtiquettes);
  }
  requestAnimationFrame(boucleEtiquettes);
})();
