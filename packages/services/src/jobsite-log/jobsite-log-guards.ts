import { ServiceError } from "../types";

export type JobsiteLogProgressSnapshotEntry = {
  /** Sum of incremental physicalPct from APPROVED (and optionally SUBMITTED) logs. */
  approvedIncrementalPct: string;
  /** max(0, 100 − approvedIncrementalPct) — prefill for “% del día”. */
  remainingPct: string;
  /** Sum of quantityCompleted from the same logs (operational evidence). */
  approvedQty?: string;
};

export type JobsiteLogProgressSnapshot = Record<string, JobsiteLogProgressSnapshotEntry>;

/** Remaining physical % that can still be booked without exceeding 100. */
export function remainingPhysicalPct(approvedIncrementalPct: string | number): string {
  const approved = typeof approvedIncrementalPct === "number"
    ? approvedIncrementalPct
    : parseFloat(approvedIncrementalPct);
  if (!Number.isFinite(approved)) return "100.00";
  const rem = Math.max(0, 100 - approved);
  return rem.toFixed(2);
}

export function buildProgressSnapshotEntry(
  approvedIncrementalPct: string | number,
  approvedQty?: string | number,
): JobsiteLogProgressSnapshotEntry {
  const pct =
    typeof approvedIncrementalPct === "number"
      ? approvedIncrementalPct.toFixed(2)
      : approvedIncrementalPct;
  const entry: JobsiteLogProgressSnapshotEntry = {
    approvedIncrementalPct: pct,
    remainingPct: remainingPhysicalPct(pct),
  };
  if (approvedQty != null) {
    entry.approvedQty =
      typeof approvedQty === "number" ? approvedQty.toFixed(4) : String(approvedQty);
  }
  return entry;
}

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
