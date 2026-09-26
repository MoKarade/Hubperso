export const CHEMINS_INTERDITS: readonly string[];
export function normaliser(chemin: unknown): string | null;
export function examinerChemins(fichiers: unknown): { ok: boolean; raison: string };
