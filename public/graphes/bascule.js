// public/graphes/bascule.js — le bouton « 3D » de la vue 2D d'un graphe de code.
//
// Posé par la route /api/graphes/[depot] sur la page 2D d'origine (servie en bac à sable : elle ne
// voit pas les styles du hub, donc ils vivent ici). Texte posé par textContent, jamais de HTML.
(function () {
  "use strict";
  var script = document.currentScript;
  var cause = script ? script.getAttribute("data-cause") : null;
  var depot = script ? script.getAttribute("data-depot") : null;

  var style = document.createElement("style");
  style.textContent =
    ".hub-bascule{position:fixed;z-index:50;top:max(12px,env(safe-area-inset-top));right:12px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".hub-bascule a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:76px;padding:0 20px;border-radius:12px;border:1px solid #93A0FF;background:#0E1014;color:#E2E8F0;font-size:1.1rem;font-weight:600;text-decoration:none}" +
    ".hub-bascule a:hover,.hub-bascule a:focus-visible{background:#93A0FF;color:#07090D}" +
    ".hub-bascule p{margin:0;max-width:min(30rem,calc(100vw - 24px));padding:10px 14px;border-radius:12px;border:1px solid #F87171;background:#0E1014;color:#E2E8F0;font-size:1rem;line-height:1.4}";
  document.head.appendChild(style);

  var boite = document.createElement("div");
  boite.className = "hub-bascule";
  var lien = document.createElement("a");
  // Ramène à /graphes, où la carte du dépôt s'ouvre sur place (aucune page de plus).
  lien.href = "/graphes#graphe-" + encodeURIComponent(depot || "");
  lien.textContent = "3D";
  lien.setAttribute("aria-label", "Ouvrir la vue 3D dans la page des graphes");
  boite.appendChild(lien);
  if (cause) {
    var p = document.createElement("p");
    p.setAttribute("role", "alert");
    p.textContent = cause;
    boite.appendChild(p);
  }
  document.body.appendChild(boite);
})();
