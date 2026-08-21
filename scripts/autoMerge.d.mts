export const LABEL_FREIN: string;

export interface CheckPR {
  name?: string;
  /** Les statuts « legacy » (Vercel) portent `context` là où les checks portent `name`. */
  context?: string;
  status?: string;
  conclusion?: string;
  state?: string;
  /** Le texte d'un statut legacy — c'est là que Vercel annonce un plafond de quota. */
  description?: string;
  title?: string;
  output?: string;
}

export interface EtatPR {
  isDraft?: boolean;
  isCrossRepository?: boolean;
  labels?: { name?: string }[];
  checks?: CheckPR[];
  mergeStateStatus?: string;
  state?: string;
}

export function decision(pr: unknown): { merger: boolean; raison: string };
