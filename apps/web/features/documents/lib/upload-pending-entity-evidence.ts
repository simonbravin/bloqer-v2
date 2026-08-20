export type PendingEntityEvidenceUploadFn = (
  formData: FormData,
) => Promise<{ documentId: string; storageConfigured?: boolean } | { error: string }>;

export type PendingEntityEvidenceFailure = {
  index: number;
  fileName: string;
  error: string;
};

export type PendingEntityEvidenceUploadResult = {
  uploaded: number;
  failures: PendingEntityEvidenceFailure[];
};

export type PendingEntityEvidenceFile = File | { file: File; clientId?: string };

function normalizePendingFiles(
  files: PendingEntityEvidenceFile[],
): Array<{ file: File; clientId?: string }> {
  return files.map((item) => (item instanceof File ? { file: item } : item));
}

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

/**
 * Sequential uploads using the existing document action. Does not roll back the entity.
 * Always sends `idempotencyKey` (provided `clientId` or a fresh UUID) so retries do not
 * duplicate R2/DB rows.
 */
export async function uploadPendingEntityEvidence(input: {
  projectId: string;
  entityId: string;
  linkedEntityType: string;
  files: PendingEntityEvidenceFile[];
  upload: PendingEntityEvidenceUploadFn;
  category: string;
  afterUploadPath: string;
}): Promise<PendingEntityEvidenceUploadResult> {
  const failures: PendingEntityEvidenceFailure[] = [];
  let uploaded = 0;
  const items = normalizePendingFiles(input.files);

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item) continue;
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("category", input.category);
    formData.append("projectId", input.projectId);
    formData.append("linkedEntityType", input.linkedEntityType);
    formData.append("linkedEntityId", input.entityId);
    formData.append("revalidatePaths", JSON.stringify([input.afterUploadPath]));
    const clientId = item.clientId ?? crypto.randomUUID();
    formData.append("idempotencyKey", clientId);
    const result = await input.upload(formData);
    if ("error" in result) {
      failures.push({ index, fileName: item.file.name, error: result.error });
    } else {
      uploaded += 1;
    }
  }

  return { uploaded, failures };
}
