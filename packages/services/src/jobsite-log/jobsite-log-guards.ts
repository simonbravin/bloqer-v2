import { ServiceError } from "../types";

export type JobsiteLogProgressSnapshot = Record<string, { approvedIncrementalPct: string }>;

export function assertJobsiteLogApprovable(status: string): void {
  if (status !== "SUBMITTED") {
    throw new ServiceError(
      "CONFLICT",
      `El parte en estado "${status}" no puede aprobarse. Debe estar enviado.`,
    );
  }
}

/** True if any WBS has approved incremental sum > 100 (legacy data hint). */
export function hasLegacyPhysicalPctOverflow(snapshot: JobsiteLogProgressSnapshot): boolean {
  return Object.values(snapshot).some((v) => parseFloat(v.approvedIncrementalPct) > 100);
}
