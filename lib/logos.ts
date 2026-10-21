// lib/logos.ts — quelles apps ont un logo dessiné dans le hub.
//
// Marc, 21/10/2026 : « remplace les cercles par le logo de chaque application ; s'il manque un
// logo, dis-le-moi ». Un logo est le dessin de l'app (son `icon.svg`), repris en tracé pour que
// le logo LUI-MÊME prenne la couleur et le mouvement de l'état (`components/LogoApp.tsx`).
// Une app sans logo n'en reçoit PAS un inventé : elle garde son initiale, et `tests/logos.test.ts`
// liste ce qui manque pour que ça se sache.
//
// Clé = `HubSource.id` (jamais `app.name`, qu'une app peut changer).

/** Les apps dont le logo est dessiné, et d'où il vient. */
export const LOGOS = {
  financeai: "FinanceAI/public/icon.svg (monogramme « Fi », refait en tracé)",
  driveai: "DriveAI/app/public/icone.svg (lettres A et D)",
  batchchef: "batchchef-/web/app/icon.svg (marmite et vapeur)",
  carai: "CarAI/app/icon.svg (prise de recharge)",
  jobai: "JobAI/app/icon.svg (invite de terminal)",
} as const;

export type IdAvecLogo = keyof typeof LOGOS;

export function aUnLogo(id: string): id is IdAvecLogo {
  return Object.prototype.hasOwnProperty.call(LOGOS, id);
}
