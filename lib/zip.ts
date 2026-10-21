// lib/zip.ts — lecture d'une archive ZIP en mémoire, sans dépendance.
//
// Pourquoi ici et pas un paquet : l'API GitHub rend un artefact Actions sous forme de ZIP, et
// le hub n'a besoin que de lire quelques fichiers de quelques centaines de Ko. Un lecteur de
// 60 lignes sur `node:zlib` évite une dépendance de plus à auditer (npm audit doit rendre 0).
//
// ⚠️ L'ARCHIVE VIENT D'AILLEURS : le contenu d'un dépôt passe par là. Deux bornes dures, sinon
// une archive piégée (bombe de décompression) ferait tomber la fonction qui la lit :
//   - au plus `MAX_ENTREES` fichiers ;
//   - au plus `maxOctets` octets décompressés EN TOUT (vérifié avant et pendant l'inflation).
// Au-delà, on LÈVE : jamais de lecture partielle présentée comme complète.

import { inflateRawSync } from "node:zlib";

const MAX_ENTREES = 20;

/** Plafond par défaut : 12 Mo décompressés, bien au-dessus d'un graphe réel (20 Ko à 2,6 Mo). */
const MAX_OCTETS_ZIP = 12 * 1024 * 1024;

const SIG_FIN = 0x06054b50; // fin du répertoire central
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Rend les fichiers de l'archive, par nom. Lève une `Error` claire si elle est invalide ou trop grosse. */
export function lireZip(archive: Buffer, maxOctets: number = MAX_OCTETS_ZIP): Map<string, Buffer> {
  // La fin du répertoire central est dans les 64 Ko + 22 derniers octets (commentaire éventuel).
  let fin = -1;
  const limite = Math.max(0, archive.length - 22 - 0xffff);
  for (let i = archive.length - 22; i >= limite; i--) {
    if (archive.readUInt32LE(i) === SIG_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("archive ZIP invalide : fin du répertoire central introuvable");

  const nb = archive.readUInt16LE(fin + 10);
  let pos = archive.readUInt32LE(fin + 16);
  if (nb > MAX_ENTREES) throw new Error(`archive ZIP refusée : ${nb} fichiers (maximum ${MAX_ENTREES})`);

  const fichiers = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < nb; n++) {
    if (pos + 46 > archive.length || archive.readUInt32LE(pos) !== SIG_CENTRAL) {
      throw new Error("archive ZIP invalide : entrée du répertoire central illisible");
    }
    const methode = archive.readUInt16LE(pos + 10);
    const tailleComprimee = archive.readUInt32LE(pos + 20);
    const tailleReelle = archive.readUInt32LE(pos + 24);
    const lNom = archive.readUInt16LE(pos + 28);
    const lExtra = archive.readUInt16LE(pos + 30);
    const lCommentaire = archive.readUInt16LE(pos + 32);
    const debutLocal = archive.readUInt32LE(pos + 42);
    const nom = archive.subarray(pos + 46, pos + 46 + lNom).toString("utf8");
    pos += 46 + lNom + lExtra + lCommentaire;

    if (nom.endsWith("/")) continue; // un dossier
    total += tailleReelle;
    if (total > maxOctets) throw new Error(`archive ZIP refusée : plus de ${maxOctets} octets décompressés`);

    if (debutLocal + 30 > archive.length || archive.readUInt32LE(debutLocal) !== SIG_LOCAL) {
      throw new Error("archive ZIP invalide : en-tête local illisible");
    }
    const debutDonnees =
      debutLocal + 30 + archive.readUInt16LE(debutLocal + 26) + archive.readUInt16LE(debutLocal + 28);
    const brut = archive.subarray(debutDonnees, debutDonnees + tailleComprimee);
    if (brut.length !== tailleComprimee) throw new Error("archive ZIP invalide : données tronquées");

    let contenu: Buffer;
    if (methode === 0) contenu = Buffer.from(brut);
    else if (methode === 8) contenu = inflateRawSync(brut, { maxOutputLength: tailleReelle + 1 });
    else throw new Error(`archive ZIP refusée : méthode de compression ${methode} non gérée`);

    if (contenu.length !== tailleReelle) throw new Error("archive ZIP invalide : taille décompressée incohérente");
    fichiers.set(nom, contenu);
  }
  return fichiers;
}
