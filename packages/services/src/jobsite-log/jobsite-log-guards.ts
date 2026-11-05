import { addDecimal, compareDecimal, multiplyDecimal, roundQty, roundToDecimals } from "@bloqer/utils";
import { ServiceError } from "../types";

export type JobsiteLogProgressSnapshotEntry = {
  /** Sum of incremental physicalPct from APPROVED (and optionally SUBMITTED) logs. */
  approvedIncrementalPct: string;
  /** Persisted 4-decimal sum for validation and prefill. */
  exactApprovedIncrementalPct: string;
  /** max(0, 100 − approvedIncrementalPct) — prefill for “% del día”. */
  remainingPct: string;
  /** Sum of quantityCompleted from the same logs (operational evidence). */
  approvedQty?: string;
};

export type JobsiteLogProgressSnapshot = Record<string, JobsiteLogProgressSnapshotEntry>;

/** Remaining physical % that can still be booked without exceeding 100 (2 dp half-up). */
export function remainingPhysicalPct(approvedIncrementalPct: string | number): string {
  try {
    const rem = addDecimal("100", multiplyDecimal(approvedIncrementalPct, "-1"));
    if (compareDecimal(rem, "0") < 0) return "0.00";
    return roundToDecimals(rem, 2);
  } catch {
    return "100.00";
  }
}

export function buildProgressSnapshotEntry(
  approvedIncrementalPct: string | number,
  approvedQty?: string | number,
): JobsiteLogProgressSnapshotEntry {
  let pct: string;
  let exactPct: string;
  try {
    pct = roundToDecimals(approvedIncrementalPct, 2);
    exactPct = roundQty(approvedIncrementalPct);
  } catch {
    pct = "0.00";
    exactPct = "0.0000";
  }
  const entry: JobsiteLogProgressSnapshotEntry = {
    approvedIncrementalPct: pct,
    exactApprovedIncrementalPct: exactPct,
    remainingPct: remainingPhysicalPct(pct),
  };
  if (approvedQty != null) {
    try {
      entry.approvedQty = roundQty(approvedQty);
    } catch {
      entry.approvedQty = String(approvedQty);
    }
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
  return Object.values(snapshot).some((v) => {
    try {
      return compareDecimal(v.exactApprovedIncrementalPct, "100") > 0;
    } catch {
      return false;
    }
  });
}
