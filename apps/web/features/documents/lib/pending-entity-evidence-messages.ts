export type PendingEntityEvidenceFailure = {
  index: number;
  fileName: string;
  error: string;
};

export type PendingEntityEvidenceUploadResult = {
  uploaded: number;
  failures: PendingEntityEvidenceFailure[];
};

export function formatPartialEntityUploadMessage(input: {
  createdLabel: string;
  itemNounSingular: string;
  itemNounPlural: string;
  result: PendingEntityEvidenceUploadResult;
}): string | null {
  if (input.result.failures.length === 0) return null;
  const n = input.result.failures.length;
  const noun = n === 1 ? input.itemNounSingular : input.itemNounPlural;
  const verb = n === 1 ? "pudo" : "pudieron";
  return `${input.createdLabel}. ${n} ${noun} no ${verb} subirse.`;
}
