# Bibliothèques tierces auto-hébergées

- `vis-network-9.1.6.min.js` — vis-network 9.1.6 (licence MIT ou Apache-2.0, au choix du projet amont),
  copie exacte de `https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js`.
  Empreinte sha384 : `sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1`
  (vérifiée par `tests/grapheHtml.test.ts`).
  Sert à la page `/graphes` : les `graph.html` des dépôts la chargeaient depuis unpkg, ce que la
  politique de sécurité du hub interdit. Mise à jour : voir `lib/grapheHtml.ts` (`VIS_VERSION`).
