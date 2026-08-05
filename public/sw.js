// app/sw.js — service worker MINIMAL, et volontairement inutile au réseau.
//
// Pourquoi il existe : les navigateurs Chromium exigent un service worker enregistré
// pour proposer « Installer l'application » sur PC et Android. Sans lui, le manifeste
// seul suffit à iOS (« Sur l'écran d'accueil ») mais pas au bouton d'installation.
//
// Pourquoi il ne MET RIEN EN CACHE : le hub affiche des données réelles et Marc ne veut
// jamais voir de chiffre périmé. Un service worker qui sert du cache est exactement la
// machine à afficher du vieux — et la pire version, parce qu'elle survit au rechargement
// et se moque du bouton « Rafraîchir ». On ne met donc AUCUN `caches.put`, AUCUN
// `caches.match`, et aucun mode hors-ligne : sans réseau, le hub ne s'ouvre pas. C'est
// honnête, et c'est préférable à un hub qui s'ouvre sur les chiffres d'hier.
//
// `skipWaiting` + `clients.claim` : un nouveau déploiement remplace immédiatement
// l'ancien worker, sans attendre la fermeture des onglets. Ça évite qu'une version
// périmée du worker traîne — même logique que le reste.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Un gestionnaire `fetch` est REQUIS pour l'installabilité, mais il laisse tout passer :
// pas de `respondWith`, donc le navigateur applique son comportement réseau normal.
self.addEventListener("fetch", () => {});
