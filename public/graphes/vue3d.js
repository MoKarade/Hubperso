// public/graphes/vue3d.js — le visualiseur 3D des graphes de code du hub.
//
// Chargé par `components/GraphesVivants.tsx` sur /graphes, après la bibliothèque `ForceGraph3D`
// (3d-force-graph, copie auto-hébergée dans public/vendor). Il expose `window.GrapheVue3d` :
//   - `monter(conteneur, donnees, options)` : un graphe 3D, en aperçu de carte ou en plein écran ;
//   - `activer(grille)` : branche les aperçus vivants des cartes et l'ouverture sur place.
//
// ⚠️ Ce script tourne DANS l'origine du hub (plus de bac à sable) : les données d'un dépôt n'y sont
// que du JSON inerte lu par `/api/graphes/<dépôt>?vue=donnees`, et tout texte venu du dépôt est posé
// par `textContent`, jamais par du HTML. `tests/grapheVue3d.test.ts` interdit ici toute écriture de
// HTML, l'évaluation de code, le stockage, les adresses externes et tout appel réseau autre que la
// lecture des données du hub. Les couleurs sont celles du hub, écrites ici
// parce qu'un script statique ne lit pas `globals.css`.
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

  function el(balise, classe, texte) {
    var n = document.createElement(balise);
    if (classe) n.className = classe;
    if (texte !== undefined) n.textContent = texte;
    return n;
  }

  function webglDisponible() {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  }

  function hexVersRgba(hex, alpha) {
    var v = parseInt(hex.slice(1), 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + alpha + ")";
  }

  // ── styles (tout est sous `.v3-…` : rien ne déborde sur le reste de la page) ───────────
  var styleInjecte = false;
  function injecterStyle() {
    if (styleInjecte) return;
    styleInjecte = true;
    var s = el("style");
    s.textContent =
      ".v3-racine,.v3-racine *{box-sizing:border-box}" +
      ".v3-racine{position:absolute;inset:0;overflow:hidden;color:" + TEXTE + ";" +
      "font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-tap-highlight-color:transparent}" +
      ".v3-racine:not(.v3-apercu){background:" + FOND + "}" +
      ".v3-scene{position:absolute;inset:0;cursor:grab}.v3-scene:active{cursor:grabbing}" +
      ".v3-apercu .v3-scene{pointer-events:none;cursor:pointer}" +
      ".v3-haut,.v3-panneau,.v3-legende{position:absolute;z-index:5}" +
      ".v3-haut{top:12px;left:12px;right:12px;display:flex;flex-direction:column;gap:10px;pointer-events:none}" +
      ".v3-haut>*{pointer-events:auto}" +
      ".v3-barre{display:flex;flex-wrap:wrap;align-items:center;gap:10px;pointer-events:none}" +
      ".v3-barre>*{pointer-events:auto}" +
      ".v3-titre{margin:0 8px 0 0;font-size:clamp(1.5rem,1.1rem + 2vw,2.2rem);font-weight:700;letter-spacing:-0.01em}" +
      ".v3-meta{color:" + DOUX + ";font-size:1rem}" +
      ".v3-fin{margin-left:auto}" +
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
      ".v3-legende{left:12px;bottom:12px;max-width:min(19rem,calc(100% - 24px));max-height:38%;display:flex;flex-direction:column;gap:6px}" +
      ".v3-liste{overflow:auto;display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:12px;background:" + SURFACE + ";border:1px solid " + BORD + "}" +
      ".v3-liste[hidden]{display:none}" +
      ".v3-dossier{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:" + TEXTE + ";font:inherit;font-size:1.05rem;text-align:left;cursor:pointer}" +
      ".v3-dossier:hover,.v3-dossier[aria-pressed=true]{background:rgba(255,255,255,0.08)}" +
      ".v3-dossier i{flex:none;width:14px;height:14px;border-radius:50%;box-shadow:0 0 10px currentColor}" +
      ".v3-dossier span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".v3-dossier b{color:" + DOUX + ";font-weight:500;font-size:.95rem}" +
      ".v3-panneau{right:12px;bottom:12px;width:min(24rem,calc(100% - 24px));max-height:46%;display:flex;flex-direction:column;gap:8px;" +
      "padding:16px;border-radius:16px;border:1px solid " + BORD + ";background:" + SURFACE + ";box-shadow:0 12px 40px rgba(0,0,0,.55);" +
      "transform:translateY(24px);opacity:0;pointer-events:none;transition:transform .35s cubic-bezier(.16,1,.3,1),opacity .25s}" +
      ".v3-panneau.v3-ouvert{transform:none;opacity:1;pointer-events:auto}" +
      ".v3-panneau h2{margin:0;padding-right:52px;font-size:1.5rem;line-height:1.2;overflow-wrap:anywhere}" +
      ".v3-panneau code{color:" + DOUX + ";font-size:.95rem;overflow-wrap:anywhere}" +
      ".v3-panneau h3{margin:4px 0 0;font-size:1rem;color:" + DOUX + ";font-weight:500}" +
      ".v3-voisins{overflow:auto;display:flex;flex-wrap:wrap;gap:6px}" +
      ".v3-voisins .v3-bouton{min-height:44px;font-weight:500;padding:0 12px}" +
      ".v3-ferme{position:absolute;top:8px;right:8px}" +
      ".v3-etiquette{position:absolute;z-index:4;left:0;top:0;pointer-events:none;white-space:nowrap;font-size:clamp(1rem,.9rem + .5vw,1.3rem);font-weight:600;" +
      "color:" + TEXTE + ";text-shadow:0 0 6px " + FOND + ",0 0 14px " + FOND + ",0 1px 2px " + FOND + ";will-change:transform}" +
      ".v3-aide{position:absolute;z-index:3;left:50%;bottom:76px;transform:translateX(-50%);max-width:min(30rem,calc(100% - 48px));text-align:center;" +
      "font-size:1.2rem;color:" + DOUX + ";pointer-events:none;transition:opacity 1s}" +
      ".v3-plein{position:fixed;inset:0;z-index:100;background:" + FOND + ";clip-path:circle(0 at 50% 50%)}" +
      ".v3-chargement{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;margin:0;padding:24px;text-align:center;font-size:1.3rem;color:" + DOUX + "}" +
      "html.v3-fige{overflow:hidden}" +
      "@media (max-width:640px){.v3-titre{order:1;flex:1 1 0;min-width:0}.v3-fin{order:2}.v3-meta{order:3;flex-basis:100%}.v3-barre>.v3-bouton:not(.v3-fin){order:4}.v3-panneau{max-height:40%}.v3-legende{max-height:30%}.v3-avec-panneau .v3-legende{display:none}}";
    if (!reduit) {
      s.textContent +=
        "@keyframes v3-entree{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}" +
        "@keyframes v3-respire{0%,100%{opacity:.45}50%{opacity:1}}" +
        ".v3-plein{transition:clip-path .75s cubic-bezier(.16,1,.3,1)}" +
        ".v3-barre>*{animation:v3-entree .7s .3s cubic-bezier(.16,1,.3,1) both}" +
        ".v3-barre>*:nth-child(2){animation-delay:.38s}.v3-barre>*:nth-child(3){animation-delay:.46s}.v3-barre>*:nth-child(4){animation-delay:.54s}.v3-barre>*:nth-child(5){animation-delay:.62s}" +
        ".v3-recherche,.v3-legende{animation:v3-entree .8s .65s cubic-bezier(.16,1,.3,1) both}" +
        ".v3-chargement{animation:v3-respire 1.4s ease-in-out infinite}" +
        ".v3-bouton:active{transform:scale(.96)}";
    }
    document.head.appendChild(s);
  }

  // ── un graphe 3D ─────────────────────────────────────────────────────────────────────
  // options : { mode: "apercu" | "complet", url2d, onFermer }
  function monter(conteneur, D, options) {
    options = options || {};
    var complet = options.mode === "complet";
    injecterStyle();

    var racine = el("div", "v3-racine" + (complet ? "" : " v3-apercu"));
    conteneur.appendChild(racine);
    var scene = el("div", "v3-scene");
    racine.appendChild(scene);

    // — modèle —
    var nodes = D.noeuds.map(function (n, i) {
      return { id: i, nom: n.nom, fichier: n.fichier, dossier: n.dossier, type: n.type, degre: n.degre, taille: n.taille, voisins: [], liens: [] };
    });
    var parDossier = {};
    nodes.forEach(function (n) { parDossier[n.dossier] = (parDossier[n.dossier] || 0) + 1; });
    var dossiers = Object.keys(parDossier).sort(function (a, b) { return parDossier[b] - parDossier[a]; });
    var couleurDossier = {};
    dossiers.forEach(function (d, i) { couleurDossier[d] = i < PALETTE.length ? PALETTE[i] : AUTRES; });
    nodes.forEach(function (n) {
      n.couleur = couleurDossier[n.dossier];
      n.pale = hexVersRgba(n.couleur, 0.1);
      n.lien = hexVersRgba(n.couleur, complet ? 0.4 : 0.55);
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

    // — état —
    var vivant = true;
    var selection = null;
    var ensemble = null; // nœuds éclairés : la sélection et ses voisins
    var dossierActif = null;
    var survol = null;
    var distanceAjustee = 0;
    var cadre = false;
    var minuteurs = [];

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

    // — le graphe —
    var G = window.ForceGraph3D({
      controlType: "orbit",
      rendererConfig: { antialias: complet, alpha: !complet, powerPreference: complet ? "high-performance" : "low-power" }
    })(scene)
      .backgroundColor(complet ? FOND : "rgba(0,0,0,0)")
      .showNavInfo(false)
      .enableNodeDrag(false)
      .nodeId("id")
      .nodeLabel(function () { return ""; })
      .nodeRelSize(complet ? 4 : 5)
      .nodeVal(function (n) { return Math.pow(n.taille / 10, 1.5) * (n === selection ? 1.6 : 1); })
      .nodeResolution(complet ? 12 : 6)
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
      .linkWidth(function (l) { return lienEclaire(l) ? 0.8 : l.sur ? (complet ? 0.5 : 0.7) : 0.25; })
      .linkDirectionalParticles(function (l) {
        if (reduit) return 0;
        if (lienEclaire(l)) return 3;
        if (selection || dossierActif) return 0;
        var pas = complet ? (links.length > 2500 ? 8 : 4) : 7;
        return l.i % pas === 0 ? 1 : 0;
      })
      .linkDirectionalParticleWidth(function (l) { return lienEclaire(l) ? 1.8 : complet ? 1.3 : 1.8; })
      .linkDirectionalParticleSpeed(function (l) { return lienEclaire(l) ? 0.012 : 0.005; })
      .linkDirectionalParticleColor(function (l) { return lienEclaire(l) ? "#FFFFFF" : l.a.couleur; })
      .cooldownTime(complet ? 7000 : 3500)
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
    controles.autoRotateSpeed = complet ? 0.7 : 1.6;
    if (!complet) {
      try { G.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); } catch { /* aperçu : résolution par défaut */ }
    }

    function redimensionner() {
      var w = racine.clientWidth;
      var h = racine.clientHeight;
      if (w > 0 && h > 0) G.width(w).height(h);
    }
    var observateur = typeof ResizeObserver === "function" ? new ResizeObserver(redimensionner) : null;
    if (observateur) observateur.observe(racine);
    else window.addEventListener("resize", redimensionner);
    redimensionner();

    function redessiner() {
      G.nodeColor(G.nodeColor()).nodeVal(G.nodeVal()).linkColor(G.linkColor()).linkWidth(G.linkWidth())
        .linkDirectionalParticles(G.linkDirectionalParticles())
        .linkDirectionalParticleWidth(G.linkDirectionalParticleWidth())
        .linkDirectionalParticleColor(G.linkDirectionalParticleColor());
    }

    // Entrée : la caméra plonge vers le graphe pendant qu'il se déplie, les nœuds se fondent.
    if (!reduit) {
      G.cameraPosition({ x: 0, y: complet ? 260 : 80, z: complet ? 1500 : 700 });
      minuteurs.push(setTimeout(function () {
        G.cameraPosition({ x: 0, y: complet ? 120 : 40, z: complet ? 520 : 380 }, { x: 0, y: 0, z: 0 }, complet ? 2600 : 2000);
      }, 150));
      var pas = 0;
      var fondu = setInterval(function () {
        pas += 1;
        G.nodeOpacity(Math.min(0.95, pas * 0.08));
        if (pas >= 12) clearInterval(fondu);
      }, 90);
      minuteurs.push(fondu);
    } else {
      G.cameraPosition({ x: 0, y: 0, z: 420 });
    }

    function mesurerDistance() {
      if (vivant) distanceAjustee = G.camera().position.distanceTo(controles.target);
    }

    // Cadrage : le cœur du graphe (85 % des nœuds, les plus proches du centre), pas les quelques
    // isolés lointains qui rapetisseraient tout. La caméra garde son angle.
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
      var cible = rayon * (complet ? 2.3 : 1.9);
      G.cameraPosition(
        { x: cx + (dx / d) * cible, y: cy + (dy / d) * cible, z: cz + (dz / d) * cible },
        { x: cx, y: cy, z: cz },
        ms
      );
      minuteurs.push(setTimeout(mesurerDistance, ms + 200));
    }
    G.onEngineStop(function () {
      if (cadre) return;
      cadre = true;
      cadrer(reduit ? 0 : 1400);
    });

    // — interface (plein écran seulement) —
    var panneau = null;
    var btnRotation = null;
    var calqueEtiquettes = null;
    var pool = [];
    var rafEtiquettes = 0;
    var boutonsDossier = {};
    var champ = null;
    var resultats = null;
    var btnCentrer = null;
    var surTouche = null;

    function arreterRotation() {
      controles.autoRotate = false;
      if (btnRotation) {
        btnRotation.setAttribute("aria-pressed", "true");
        btnRotation.textContent = "Tourner";
      }
    }

    function voler(n) {
      var d = 130;
      var r = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
      var pos = r < 1 ? { x: n.x, y: n.y, z: n.z + d } : { x: n.x * (1 + d / r), y: n.y * (1 + d / r), z: n.z * (1 + d / r) };
      G.cameraPosition(pos, { x: n.x, y: n.y, z: n.z }, reduit ? 0 : 1100);
    }

    function majDossiers() {
      dossiers.forEach(function (d) { boutonsDossier[d].setAttribute("aria-pressed", String(d === dossierActif)); });
    }
    function fermerPanneau() {
      panneau.classList.remove("v3-ouvert");
      racine.classList.remove("v3-avec-panneau");
    }
    function ouvrirPanneau(n) {
      panneau.textContent = "";
      var fermer = el("button", "v3-bouton v3-ferme", "×");
      fermer.type = "button";
      fermer.setAttribute("aria-label", "Fermer le détail");
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
      racine.classList.add("v3-avec-panneau");
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
        if (panneau) fermerPanneau();
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

    function normaliser(t) {
      return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    }

    if (complet) {
      var haut = el("div", "v3-haut");
      var barre = el("div", "v3-barre");
      barre.appendChild(el("h1", "v3-titre", D.depot));
      barre.appendChild(el("span", "v3-meta", nodes.length + " nœuds · " + links.length + " liens"));
      btnRotation = el("button", "v3-bouton", reduit ? "Tourner" : "Pause");
      btnRotation.type = "button";
      btnRotation.setAttribute("aria-pressed", String(reduit));
      btnCentrer = el("button", "v3-bouton", "Recentrer");
      btnCentrer.type = "button";
      barre.appendChild(btnRotation);
      barre.appendChild(btnCentrer);
      if (options.url2d) {
        var lien2d = el("a", "v3-bouton", "2D");
        lien2d.href = options.url2d;
        lien2d.target = "_blank";
        lien2d.rel = "noopener noreferrer";
        lien2d.setAttribute("aria-label", "Ouvrir la vue 2D d'origine dans un nouvel onglet");
        barre.appendChild(lien2d);
      }
      var btnFermer = el("button", "v3-bouton v3-fin", "Fermer");
      btnFermer.type = "button";
      btnFermer.addEventListener("click", function () { if (options.onFermer) options.onFermer(); });
      barre.appendChild(btnFermer);
      haut.appendChild(barre);

      var recherche = el("div", "v3-recherche");
      champ = el("input");
      champ.type = "search";
      champ.placeholder = "Chercher un nom";
      champ.setAttribute("aria-label", "Chercher un nœud");
      champ.autocomplete = "off";
      resultats = el("div", "v3-resultats");
      recherche.appendChild(champ);
      recherche.appendChild(resultats);
      haut.appendChild(recherche);
      racine.appendChild(haut);

      var legende = el("div", "v3-legende");
      var btnLegende = el("button", "v3-bouton", "Dossiers (" + dossiers.length + ")");
      btnLegende.type = "button";
      btnLegende.setAttribute("aria-pressed", "false");
      var liste = el("div", "v3-liste");
      liste.hidden = true;
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
      racine.appendChild(legende);

      panneau = el("section", "v3-panneau");
      panneau.setAttribute("aria-label", "Détail du nœud");
      racine.appendChild(panneau);

      var aide = el("p", "v3-aide", "Glisser pour tourner · molette ou pincer pour zoomer · toucher un point pour l'explorer");
      racine.appendChild(aide);
      minuteurs.push(setTimeout(function () { aide.style.opacity = "0"; }, 7000));

      calqueEtiquettes = el("div");
      racine.appendChild(calqueEtiquettes);

      controles.addEventListener("start", arreterRotation);
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
      surTouche = function (e) {
        if (e.key !== "Escape") return;
        if (selection) selectionner(null);
        else if (options.onFermer) options.onFermer();
      };
      document.addEventListener("keydown", surTouche);

      // Étiquettes : survol, sélection et voisins ; les nœuds principaux seulement en zoomant.
      var vecteur = G.camera().position.clone();
      var boucle = function () {
        if (!vivant) return;
        var cam = G.camera();
        var L = racine.clientWidth;
        var H = racine.clientHeight;
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
          if (!pool[utilisees]) {
            pool[utilisees] = el("div", "v3-etiquette");
            calqueEtiquettes.appendChild(pool[utilisees]);
          }
          var e = pool[utilisees++];
          if (e.textContent !== n.nom) e.textContent = n.nom;
          e.style.display = "block";
          e.style.transform = "translate(" + Math.round(x + 12) + "px," + Math.round(y - 30) + "px)";
        }
        for (var q = utilisees; q < pool.length; q++) pool[q].style.display = "none";
        rafEtiquettes = requestAnimationFrame(boucle);
      };
      rafEtiquettes = requestAnimationFrame(boucle);
    }

    return {
      pause: function () { if (vivant) G.pauseAnimation(); },
      reprendre: function () { if (vivant) G.resumeAnimation(); },
      detruire: function () {
        if (!vivant) return;
        vivant = false;
        cancelAnimationFrame(rafEtiquettes);
        minuteurs.forEach(function (m) { clearTimeout(m); clearInterval(m); });
        if (observateur) observateur.disconnect();
        else window.removeEventListener("resize", redimensionner);
        if (surTouche) document.removeEventListener("keydown", surTouche);
        try {
          G.pauseAnimation();
          var rendu = G.renderer();
          if (typeof G._destructor === "function") G._destructor();
          rendu.dispose();
          rendu.forceContextLoss();
        } catch { /* le contexte est libéré de toute façon quand le canvas disparaît */ }
        racine.remove();
      }
    };
  }

  // ── la page /graphes : aperçus vivants et ouverture sur place ────────────────────────
  // Chaque carte `[data-graphe]` porte l'identifiant de son dépôt ; sa zone `.carte-graphe__apercu`
  // reçoit un vrai graphe 3D réduit quand elle entre à l'écran, détruit quand elle en sort (un
  // contexte WebGL par aperçu visible, jamais dix d'un coup).
  function activer(grille) {
    if (!grille || !webglDisponible()) return function () {};
    injecterStyle();

    var donnees = {};
    function charger(id) {
      if (!donnees[id]) {
        var p = fetch("/api/graphes/" + encodeURIComponent(id) + "?vue=donnees", { credentials: "same-origin" }).then(function (r) {
          // Le hub écrit la cause en clair (graphe absent, expiré, format inattendu…) : on la montre.
          if (!r.ok) return r.text().then(function (t) { throw new Error(t || "HTTP " + r.status); });
          return r.json();
        });
        p.catch(function () { delete donnees[id]; });
        donnees[id] = p;
      }
      return donnees[id];
    }

    var cartes = Array.prototype.slice.call(grille.querySelectorAll("[data-graphe]"));
    var vivants = {}; // id -> { inst, boite }
    var visibles = {};
    var file = [];
    var minuteur = 0;
    var actif = true;
    var overlay = null;

    function demarrer() {
      if (minuteur || !actif || overlay) return;
      var carte = null;
      while (file.length && !carte) {
        var c = file.shift();
        var cid = c.getAttribute("data-graphe");
        if (visibles[cid] && !vivants[cid]) carte = c;
      }
      if (!carte) return;
      var id = carte.getAttribute("data-graphe");
      var boite = carte.querySelector(".carte-graphe__apercu");
      vivants[id] = { inst: null, boite: boite };
      charger(id).then(function (D) {
        var v = vivants[id];
        if (!v || !actif || !visibles[id]) { delete vivants[id]; return; }
        v.inst = monter(boite, D, { mode: "apercu" });
        boite.classList.add("v3-pret");
        if (overlay) v.inst.pause();
      }).catch(function () { delete vivants[id]; });
      minuteur = setTimeout(function () { minuteur = 0; demarrer(); }, 450);
    }

    function eteindre(id) {
      var v = vivants[id];
      if (!v) return;
      if (v.inst) v.inst.detruire();
      v.boite.classList.remove("v3-pret");
      delete vivants[id];
    }

    var vigie = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        var id = e.target.getAttribute("data-graphe");
        visibles[id] = e.isIntersecting;
        if (e.isIntersecting) {
          if (file.indexOf(e.target) === -1) file.push(e.target);
        } else {
          eteindre(id);
        }
      });
      demarrer();
    }, { rootMargin: "120px" });
    cartes.forEach(function (c) { vigie.observe(c); });

    // — ouverture sur place —
    var ouvertParClic = false;

    function ouvrir(id, carte, parClic) {
      if (overlay) return;
      var nom = carte.getAttribute("data-nom") || id;
      var rect = carte.getBoundingClientRect();
      var cx = Math.round(rect.left + rect.width / 2);
      var cy = Math.round(rect.top + rect.height / 2);
      var plein = el("div", "v3-plein");
      plein.setAttribute("role", "dialog");
      plein.setAttribute("aria-modal", "true");
      plein.setAttribute("aria-label", "Graphe de " + nom);
      plein.style.clipPath = "circle(0px at " + cx + "px " + cy + "px)";
      var attente = el("p", "v3-chargement", "Chargement du graphe");
      plein.appendChild(attente);
      document.body.appendChild(plein);
      document.documentElement.classList.add("v3-fige");
      overlay = { plein: plein, inst: null, carte: carte, cx: cx, cy: cy };
      ouvertParClic = parClic;
      Object.keys(vivants).forEach(function (k) { if (vivants[k].inst) vivants[k].inst.pause(); });
      requestAnimationFrame(function () {
        plein.style.clipPath = "circle(150% at " + cx + "px " + cy + "px)";
      });
      charger(id).then(function (D) {
        if (!overlay || overlay.plein !== plein) return;
        attente.remove();
        overlay.inst = monter(plein, D, {
          mode: "complet",
          url2d: "/api/graphes/" + encodeURIComponent(id) + "?vue=2d",
          onFermer: demanderFermeture
        });
      }).catch(function (e) {
        if (!overlay || overlay.plein !== plein) return;
        attente.textContent = e.message;
        attente.setAttribute("role", "alert");
        var b = el("button", "v3-bouton", "Fermer");
        b.type = "button";
        b.addEventListener("click", demanderFermeture);
        var l2 = el("a", "v3-bouton", "Vue 2D");
        l2.href = "/api/graphes/" + encodeURIComponent(id) + "?vue=2d";
        l2.target = "_blank";
        l2.rel = "noopener noreferrer";
        attente.appendChild(b);
        attente.appendChild(l2);
        b.focus();
      });
    }

    function fermer() {
      if (!overlay) return;
      var o = overlay;
      overlay = null;
      ouvertParClic = false;
      o.plein.style.clipPath = "circle(0px at " + o.cx + "px " + o.cy + "px)";
      function fin() {
        if (o.inst) o.inst.detruire();
        o.plein.remove();
        document.documentElement.classList.remove("v3-fige");
        Object.keys(vivants).forEach(function (k) { if (vivants[k].inst) vivants[k].inst.reprendre(); });
        demarrer();
        var bouton = o.carte.querySelector("a,button");
        if (bouton) bouton.focus({ preventScroll: true });
      }
      if (reduit) fin();
      else setTimeout(fin, 700);
    }

    // La barre d'adresse suit : `#graphe-<dépôt>` ouvre, le retour du navigateur ferme.
    function demanderFermeture() {
      if (!overlay) return;
      if (ouvertParClic && /^#graphe-/.test(location.hash)) history.back();
      else {
        history.replaceState(null, "", location.pathname + location.search);
        fermer();
      }
    }
    function surHash() {
      var m = /^#graphe-(.+)$/.exec(location.hash);
      if (!m) { fermer(); return; }
      var carte = grille.querySelector('[data-graphe="' + m[1].replace(/[^a-z0-9-]/g, "") + '"]');
      if (carte && !overlay) ouvrir(m[1], carte, ouvertParClic);
    }
    window.addEventListener("hashchange", surHash);

    cartes.forEach(function (carte) {
      var id = carte.getAttribute("data-graphe");
      var cible = carte.querySelectorAll("[data-ouvrir]");
      Array.prototype.forEach.call(cible, function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          ouvertParClic = true;
          location.hash = "graphe-" + id;
        });
      });
      // Effet de lumière qui suit le pointeur, et léger relief : pas de contexte WebGL pour ça.
      if (!reduit) {
        carte.addEventListener("pointermove", function (e) {
          var r = carte.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width;
          var y = (e.clientY - r.top) / r.height;
          carte.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
          carte.style.setProperty("--my", (y * 100).toFixed(1) + "%");
          carte.style.setProperty("--rx", ((0.5 - y) * 5).toFixed(2) + "deg");
          carte.style.setProperty("--ry", ((x - 0.5) * 6).toFixed(2) + "deg");
        });
        carte.addEventListener("pointerleave", function () {
          carte.style.setProperty("--rx", "0deg");
          carte.style.setProperty("--ry", "0deg");
        });
      }
    });

    if (/^#graphe-/.test(location.hash)) surHash();

    return function arreter() {
      actif = false;
      clearTimeout(minuteur);
      vigie.disconnect();
      window.removeEventListener("hashchange", surHash);
      if (overlay) {
        overlay.plein.style.transition = "none";
        var o = overlay;
        overlay = null;
        if (o.inst) o.inst.detruire();
        o.plein.remove();
        document.documentElement.classList.remove("v3-fige");
      }
      Object.keys(vivants).forEach(eteindre);
    };
  }

  window.GrapheVue3d = { monter: monter, activer: activer };
})();
