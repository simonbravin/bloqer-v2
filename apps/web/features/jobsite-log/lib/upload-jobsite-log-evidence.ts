import {
  formatPartialEntityUploadMessage,
  uploadPendingEntityEvidence,
  type PendingEntityEvidenceUploadFn,
  type PendingEntityEvidenceUploadResult,
} from "@/features/documents/lib/upload-pending-entity-evidence";

export type JobsiteLogEvidenceUploadFn = PendingEntityEvidenceUploadFn;
export type JobsiteLogEvidenceUploadResult = PendingEntityEvidenceUploadResult;
export type JobsiteLogEvidenceFailure = PendingEntityEvidenceUploadResult["failures"][number];

export function formatJobsiteLogPartialUploadMessage(
  result: JobsiteLogEvidenceUploadResult,
): string | null {
  return formatPartialEntityUploadMessage({
    createdLabel: "Parte creado correctamente",
    itemNounSingular: "foto",
    itemNounPlural: "fotos",
    result,
  });
}

/**
 * Sequential uploads using the existing document action. Does not roll back the log.
 */
export async function uploadJobsiteLogEvidence(input: {
  projectId: string;
  logId: string;
  files: File[];
  upload: JobsiteLogEvidenceUploadFn;
  category?: string;
}): Promise<JobsiteLogEvidenceUploadResult> {
  return uploadPendingEntityEvidence({
    projectId: input.projectId,
    entityId: input.logId,
    linkedEntityType: "JOBSITE_LOG",
    files: input.files,
    upload: input.upload,
    category: input.category ?? "JOBSITE_EVIDENCE",
    afterUploadPath: `/proyectos/${input.projectId}/libro-obra/${input.logId}`,
  });
}
