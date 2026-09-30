import { addDecimal, compareDecimal, roundQty, roundRatePct, roundToDecimals } from "@bloqer/utils";

/** Qty to offer from the period jobsite log, capped by the contractual remainder. Null when there is nothing to suggest. */
export function suggestPeriodCertQty(periodQty: string, remainingQty: string): string | null {
  if (compareDecimal(periodQty, "0") <= 0) return null;
  if (compareDecimal(remainingQty, "0") <= 0) return null;
  const capped = compareDecimal(periodQty, remainingQty) <= 0 ? periodQty : remainingQty;
  const rounded = roundQty(capped);
  if (compareDecimal(rounded, "0") <= 0) return null;
  return rounded;
}

/**
 * Physical % hint for the certificate field (max 100).
 * The raw libro sum may exceed 100 ([Q-005b]); the field itself cannot.
 */
export function suggestPeriodPhysicalPct(periodPct: string): string | null {
  if (compareDecimal(periodPct, "0") <= 0) return null;
  const capped = compareDecimal(periodPct, "100") > 0 ? "100" : periodPct;
  return roundToDecimals(capped, 2);
}

export function isDateKeyInPeriod(logDate: string, periodStart: string, periodEnd: string): boolean {
  const day = logDate.slice(0, 10);
  const start = periodStart.slice(0, 10);
  const end = periodEnd.slice(0, 10);
  return day >= start && day <= end;
}

export type JobsiteProgressInput = {
  wbsNodeId: string;
  /** Calendar day `YYYY-MM-DD` (or an ISO timestamp; the date prefix is used). */
  logDate: string;
  quantityCompleted: string;
  physicalPct: string | null;
};

export type JobsiteProgressTotals = {
  qtyAcum: string;
  pctAcum: string;
  qtyPeriod: string;
  pctPeriod: string;
};

const EMPTY_PROGRESS: JobsiteProgressTotals = {
  qtyAcum: "0.0000",
  pctAcum: "0.00",
  qtyPeriod: "0.0000",
  pctPeriod: "0.00",
};

export function emptyJobsiteProgress(): JobsiteProgressTotals {
  return { ...EMPTY_PROGRESS };
}

/** Splits approved libro rows into cumulative vs certification-period totals. Dates outside the period stay in the cumulative only. */
export function aggregateJobsiteProgress(
  rows: JobsiteProgressInput[],
  periodStart: string,
  periodEnd: string,
): Map<string, JobsiteProgressTotals> {
  const acc = new Map<string, { qtyAcum: string; pctAcum: string; qtyPeriod: string; pctPeriod: string }>();

  for (const row of rows) {
    let cur = acc.get(row.wbsNodeId);
    if (!cur) {
      cur = { qtyAcum: "0", pctAcum: "0", qtyPeriod: "0", pctPeriod: "0" };
      acc.set(row.wbsNodeId, cur);
    }
    cur.qtyAcum = addDecimal(cur.qtyAcum, row.quantityCompleted || "0");
    if (row.physicalPct != null && row.physicalPct !== "") {
      cur.pctAcum = addDecimal(cur.pctAcum, row.physicalPct);
    }
    if (isDateKeyInPeriod(row.logDate, periodStart, periodEnd)) {
      cur.qtyPeriod = addDecimal(cur.qtyPeriod, row.quantityCompleted || "0");
      if (row.physicalPct != null && row.physicalPct !== "") {
        cur.pctPeriod = addDecimal(cur.pctPeriod, row.physicalPct);
      }
    }
  }

  const out = new Map<string, JobsiteProgressTotals>();
  for (const [id, cur] of acc) {
    out.set(id, {
      qtyAcum: roundQty(cur.qtyAcum),
      pctAcum: roundToDecimals(cur.pctAcum, 2),
      qtyPeriod: roundQty(cur.qtyPeriod),
      pctPeriod: roundToDecimals(cur.pctPeriod, 2),
    });
  }
  return out;
}

/**
 * Canonical qty for a persisted line. Null when empty, zero, negative, or not a decimal.
 * Rounds to 4 dp from the string so a JS number never reaches the money math.
 */
export function parseMeasurementQty(raw: string | undefined): string | null {
  if (raw == null || raw.trim() === "") return null;
  try {
    const rounded = roundQty(raw.trim());
    if (rounded.startsWith("-") || compareDecimal(rounded, "0") <= 0) return null;
    return rounded;
  } catch {
    return null;
  }
}

/** Physical % for the certificate field. Empty means 0. Null when it is not between 0 and 100. */
export function parseMeasurementPhysicalPct(raw: string | undefined): string | null {
  const source = raw == null || raw.trim() === "" ? "0" : raw.trim();
  try {
    const rounded = roundRatePct(source);
    if (compareDecimal(rounded, "0") < 0 || compareDecimal(rounded, "100") > 0) return null;
    return rounded;
  } catch {
    return null;
  }
}
