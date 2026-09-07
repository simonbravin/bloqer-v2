import {
  formatPartialEntityUploadMessage,
  uploadPendingEntityEvidence,
  type PendingEntityEvidenceUploadResult,
} from "@/features/documents/lib/upload-pending-entity-evidence";

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
 * Sequential document uploads for jobsite evidence. Does not roll back the log.
 */
export async function uploadJobsiteLogEvidence(input: {
  projectId: string;
  logId: string;
  files: File[];
  category?: string;
}): Promise<JobsiteLogEvidenceUploadResult> {
  return uploadPendingEntityEvidence({
    projectId: input.projectId,
    entityId: input.logId,
    linkedEntityType: "JOBSITE_LOG",
    files: input.files,
    category: input.category ?? "JOBSITE_EVIDENCE",
    afterUploadPath: `/proyectos/${input.projectId}/libro-obra/${input.logId}`,
  });
}
