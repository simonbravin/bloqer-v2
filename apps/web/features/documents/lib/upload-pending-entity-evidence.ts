import { clientUploadDocument } from "./client-upload-document";
import type {
  PendingEntityEvidenceFailure,
  PendingEntityEvidenceUploadResult,
} from "./pending-entity-evidence-messages";

export type {
  PendingEntityEvidenceFailure,
  PendingEntityEvidenceUploadResult,
} from "./pending-entity-evidence-messages";
export { formatPartialEntityUploadMessage } from "./pending-entity-evidence-messages";

export type PendingEntityEvidenceFile = File | { file: File; clientId?: string };

function normalizePendingFiles(
  files: PendingEntityEvidenceFile[],
): Array<{ file: File; clientId?: string }> {
  return files.map((item) => (item instanceof File ? { file: item } : item));
}

/**
 * Sequential direct-to-R2 uploads. Does not roll back the entity.
 * Always sends `idempotencyKey` (provided `clientId` or a fresh UUID) so retries do not
 * duplicate R2/DB rows.
 */
export async function uploadPendingEntityEvidence(input: {
  projectId: string;
  entityId: string;
  linkedEntityType: string;
  files: PendingEntityEvidenceFile[];
  category: string;
  afterUploadPath: string;
}): Promise<PendingEntityEvidenceUploadResult> {
  const failures: PendingEntityEvidenceFailure[] = [];
  let uploaded = 0;
  const items = normalizePendingFiles(input.files);

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item) continue;
    const clientId = item.clientId ?? crypto.randomUUID();
    const result = await clientUploadDocument({
      file: item.file,
      projectId: input.projectId,
      category: input.category,
      linkedEntityType: input.linkedEntityType,
      linkedEntityId: input.entityId,
      idempotencyKey: clientId,
      revalidatePaths: [input.afterUploadPath],
    });
    if ("error" in result) {
      failures.push({ index, fileName: item.file.name, error: result.error });
    } else {
      uploaded += 1;
    }
  }

  return { uploaded, failures };
}
