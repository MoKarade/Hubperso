// lib/logos.ts — quelles apps ont un logo dessiné dans le hub.
//
// Marc, 21/10/2026 : « remplace les cercles par le logo de chaque application ; s'il manque un
// logo, dis-le-moi » ; 22/10 : série A. Le dessin vit dans `components/LogoApp.tsx`, en tracé,
// pour que le logo LUI-MÊME prenne la couleur et le mouvement de l'état. Une app sans logo
// n'en reçoit PAS un inventé : elle garde son initiale, et `tests/logos.test.ts` liste ce qui
// manque pour que ça se sache.
//
// Clé = `HubSource.id` (jamais `app.name`, qu'une app peut changer).

/** Les apps dont le logo est dessiné (série A), et ce qu'il montre. */
export const LOGOS = {
  financeai: "une pièce au dollar, l'étincelle sur le bord",
  carai: "une voiture de profil, l'éclair dedans",
  jobai: "une loupe, l'étincelle dans la lentille",
  batchchef: "une marmite, l'étincelle monte comme la vapeur",
  driveai: "une arborescence : trois dossiers classés sous l'étincelle",
  memoryai: "trois strates de faits, l'étincelle sur la plus récente",
} as const;

export type IdAvecLogo = keyof typeof LOGOS;

export function aUnLogo(id: string): id is IdAvecLogo {
  return Object.prototype.hasOwnProperty.call(LOGOS, id);
}
