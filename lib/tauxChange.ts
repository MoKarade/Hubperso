// lib/tauxChange.ts — LE taux USD→CAD du hub, lu dans le relevé du PC (Hubperso#642). PUR : aucune base, aucun réseau.
//
// Avant, trois taux sans date pour le même coût (1,38 dans le hub, 1,4305 dans la page, 1,38 recopié dans le relevé). Le relevé du PC
// porte maintenant UN taux de la Banque du Canada (`quota.taux_usd_cad` : `taux`, `date`, `source`, `releve`) et tout le hub s'en sert.
//
// Sans taux lisible (relevé absent, champ absent, taux hors de 0,5 à 3, taux relevé il y a plus de 72 h), le repli 1,38 s'applique et il
// est DIT (`repli: true` et le motif), jamais présenté comme un taux du jour. Une conversion reste une estimation : un coût passé est
// reconverti au taux courant, pas à celui du jour de la dépense.

/** Le taux de repli, le seul valeur écrite en dur du hub : approximatif, utilisé seulement quand le relevé n'en donne pas de lisible. */
export const TAUX_REPLI = 1.38;

/** Au-delà, le taux du relevé n'est plus un taux « du jour » : le repli s'applique, dit. */
export const AGE_MAX_MS = 72 * 3_600_000;

export interface TauxChange {
  taux: number;
  /** Le jour de la série (AAAA-MM-JJ) que la Banque du Canada a publié, ou `null` au repli. */
  date: string | null;
  source: string | null;
  /** Vrai quand le taux est le repli et non un taux du relevé. */
  repli: boolean;
  /** Pourquoi le repli s'applique (au repli seulement). */
  motif: string | null;
}

const repli = (motif: string): TauxChange => ({ taux: TAUX_REPLI, date: null, source: null, repli: true, motif });

/** Le taux quand rien n'est fourni (tests, appelants sans relevé) : le repli, dit. */
export const TAUX_PAR_DEFAUT: TauxChange = repli("aucun relevé du PC consulté");

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** @param quota le champ `quota` du dernier relevé du PC, ou `null` s'il n'est pas lisible */
export function lireTaux(quota: unknown, maintenant: number): TauxChange {
  if (!estObjet(quota)) return repli("relevé du PC absent");
  const brut = quota.taux_usd_cad;
  if (!estObjet(brut)) return repli("le relevé du PC ne porte pas de taux");
  const taux = brut.taux;
  if (typeof taux !== "number" || !Number.isFinite(taux) || taux < 0.5 || taux > 3) return repli("taux du relevé hors de 0,5 à 3");
  const releveLe = typeof brut.releve === "string" ? Date.parse(brut.releve) : NaN;
  if (Number.isNaN(releveLe)) return repli("le taux du relevé n'a pas d'heure de relevé");
  if (maintenant - releveLe > AGE_MAX_MS) return repli("taux relevé il y a plus de 72 h");
  return {
    taux,
    date: typeof brut.date === "string" ? brut.date.slice(0, 10) : null,
    source: typeof brut.source === "string" ? brut.source : null,
    repli: false,
    motif: null,
  };
}

/** Le taux en mots, pour la page : « 1 $ US = 1,4038 $ CA (Banque du Canada, 27/10) » ou le repli et sa cause. */
export function direTaux(t: TauxChange): string {
  const valeur = t.taux.toString().replace(".", ",");
  if (t.repli) return `1 $ US = ${valeur} $ CA : taux de repli, pas un cours du jour (${t.motif ?? "aucun taux lisible"})`;
  const jour = t.date ? ` du ${t.date}` : "";
  return `1 $ US = ${valeur} $ CA : ${t.source ?? "taux du relevé du PC"}${jour}`;
}
