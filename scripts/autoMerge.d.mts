export const LABEL_FREIN: string;

export interface CheckPR {
  name?: string;
  status?: string;
  conclusion?: string;
  state?: string;
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
