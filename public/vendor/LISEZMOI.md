# Bibliothèques tierces auto-hébergées

- `vis-network-9.1.6.min.js` — vis-network 9.1.6 (licence MIT ou Apache-2.0, au choix du projet amont),
  copie exacte de `https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js`.
  Empreinte sha384 : `sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1`
  (vérifiée par `tests/grapheHtml.test.ts`).
  Sert à la page `/graphes` : les `graph.html` des dépôts la chargeaient depuis unpkg, ce que la
  politique de sécurité du hub interdit. Mise à jour : voir `lib/grapheHtml.ts` (`VIS_VERSION`).

- `3d-force-graph-1.80.1.min.js` — 3d-force-graph 1.80.1 (licence MIT), copie exacte du fichier
  `dist/3d-force-graph.min.js` du paquet npm `3d-force-graph@1.80.1` (three.js et d3-force embarqués).
  Empreinte sha384 : `sha384-i98VDQKdpyVrtyuFn0fjUWJBLBmxnqHqOANcvYe9HLJUgT2wPixa4ZkLd7Dh3VEk`
  (vérifiée par `tests/grapheVue3d.test.ts`).
  Sert à la vue 3D de `/graphes` (`public/graphes/vue3d.js`) : aperçu vivant dans chaque carte et
  ouverture sur place. Chargée depuis le hub (`script-src 'self'`), jamais depuis un CDN. Mise à jour :
  voir `lib/grapheVue3d.ts` (`LIB3D_VERSION`, `LIB3D_SRI`).
