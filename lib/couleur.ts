// lib/couleur.ts — choisir un texte lisible sur la couleur d'une app. PURE.
//
// ══ POURQUOI CE MODULE EXISTE ════════════════════════════════════════════════════════
//
// Marc, 15/09 : « les couleurs plus prononcées pour chaque app », et les boutons prennent
// la couleur de l'app. Or `app.color` arrive du CONTRAT, à l'exécution : le hub ne connaît
// aucune app en particulier et ne peut donc pas écrire « JobAI → texte noir » quelque part.
//
// MESURÉ sur les six couleurs du 15/09, et c'est ce qui rend ce module nécessaire :
//
//   CarAI      #db2777   blanc 4,60   noir 4,57   → blanc
//   BatchChef  #c2410c   blanc 5,18   noir 4,06   → blanc
//   FinanceAI  #0f766e   blanc 5,47   noir 3,84   → blanc
//   MemoryAI   #7c3aed   blanc 5,70   noir 3,69   → blanc
//   JobAI      #f2a31b   blanc 2,09   noir 10,03  → NOIR
//   DriveAI    #8ab4f8   blanc 2,11   noir 9,96   → NOIR
//
// Deux des six rendent le texte blanc ILLISIBLE (2,09 et 2,11, là où la norme demande 4,5).
// Poser `color: #fff` sur tous les boutons aurait donc cassé un tiers du tableau de bord,
// et rien dans le code ne l'aurait dit.
//
// ⚠️ CE QUI EST GARANTI, ET CE N'EST PAS UNE COÏNCIDENCE. Prendre le MEILLEUR du noir et du
// blanc rend toujours au moins 4,58:1 — le pire cas est la luminance où les deux s'égalisent
// (L ≈ 0,179), et là le rapport vaut encore 4,58. Autrement dit : quelle que soit la couleur
// qu'une app publie, aujourd'hui ou dans six mois, le texte du bouton reste conforme AA. Le
// hub n'a donc pas à faire confiance aux apps sur ce point, ni à maintenir une liste.

/** Le noir ou le blanc — les deux seules valeurs qu'on pose, pour que le calcul soit trivial
 *  à vérifier à l'œil dans l'inspecteur du navigateur. */
export type TexteSurAccent = "#000000" | "#ffffff";

/** `#rrggbb`, la SEULE forme que le contrat accepte (vérifié : `#abc` et `red` sont refusés
 *  par `validateSummary`). Tout le reste rend `null` plutôt qu'une supposition. */
const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/**
 * Luminance relative WCAG 2.1, entre 0 (noir) et 1 (blanc). PURE.
 *
 * ⚠️ PAS la « luminosité perçue » `(r×299 + g×587 + b×114) / 1000` qu'on trouve partout.
 * Cette dernière n'a pas de rapport défini avec la lisibilité : elle ignore la linéarisation
 * gamma, donc elle ne permet pas de CALCULER un rapport de contraste — seulement de le
 * deviner. Ici on veut un nombre qu'on puisse affirmer dans un test.
 *
 * `null` sur une entrée hors forme : on ne pose alors aucune couleur de texte, et le bouton
 * garde le style neutre. Un `#000000` par défaut aurait été invisible sur un fond sombre.
 */
export function luminanceRelative(couleur: string | null | undefined): number | null {
  const m = typeof couleur === "string" ? HEX.exec(couleur.trim()) : null;
  if (!m) return null;

  const canaux = [m[1]!, m[2]!, m[3]!].map((paire) => {
    const c = parseInt(paire, 16) / 255;
    // Linéarisation sRGB : c'est cette étape que la formule « perçue » omet.
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * canaux[0]! + 0.7152 * canaux[1]! + 0.0722 * canaux[2]!;
}

/** Rapport de contraste WCAG entre deux luminances relatives. Toujours ≥ 1. */
export function rapportContraste(a: number, b: number): number {
  const haut = Math.max(a, b);
  const bas = Math.min(a, b);
  return (haut + 0.05) / (bas + 0.05);
}

/**
 * Le texte lisible sur cette couleur — le meilleur du noir et du blanc. PURE.
 *
 * `null` quand la couleur n'est pas exploitable : l'appelant ne pose alors RIEN, et le
 * bouton retombe sur les couleurs neutres du hub. C'est la même règle que partout ici —
 * mieux vaut un bouton sobre qu'un bouton dont on ne sait pas s'il est lisible.
 */
export function texteSur(couleur: string | null | undefined): TexteSurAccent | null {
  const l = luminanceRelative(couleur);
  if (l === null) return null;
  const surBlanc = rapportContraste(l, 1);
  const surNoir = rapportContraste(l, 0);
  return surBlanc >= surNoir ? "#ffffff" : "#000000";
}

/** Le rapport obtenu par le choix de `texteSur`. Pour les tests et le diagnostic. */
export function contrasteRetenu(couleur: string | null | undefined): number | null {
  const l = luminanceRelative(couleur);
  if (l === null) return null;
  return Math.max(rapportContraste(l, 1), rapportContraste(l, 0));
}
