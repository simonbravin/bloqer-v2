import {
  addDecimal,
  compareDecimal,
  divideDecimal,
  multiplyDecimal,
  roundMoney,
  roundQty,
  roundRatePct,
  roundToDecimals,
} from "@bloqer/utils";

function subtract(a: string, b: string): string {
  return addDecimal(a, multiplyDecimal(b, "-1"));
}

function nonnegative(value: string): string {
  return compareDecimal(value, "0") > 0 ? value : "0";
}

export function certificationQtyPct(qty: string, budgetQty: string): string | null {
  if (compareDecimal(budgetQty, "0") <= 0) return null;
  return roundRatePct(multiplyDecimal(divideDecimal(qty, budgetQty, 12), "100"));
}

/** Pure decimal preview, shared by server and UI; persistence is always recalculated in services. */
export function previewCertificationMeasurement(input: {
  currentQty: string;
  previousQty: string;
  budgetQty: string;
  unitSalePrice: string;
  physicalPct: string;
  previousPhysicalPct: string;
}) {
  const qty = roundQty(input.currentQty || "0");
  const cumulativeQty = addDecimal(input.previousQty, qty);
  const cumulativePhysicalPct = addDecimal(input.previousPhysicalPct, input.physicalPct || "0");
  return {
    periodAmount: roundMoney(multiplyDecimal(qty, input.unitSalePrice)),
    currentPct: certificationQtyPct(qty, input.budgetQty),
    cumulativePct: certificationQtyPct(cumulativeQty, input.budgetQty),
    cumulativePhysicalPct,
    remainingQty: roundQty(nonnegative(subtract(input.budgetQty, cumulativeQty))),
    overQuantity: compareDecimal(cumulativeQty, input.budgetQty) > 0,
    overPhysical: compareDecimal(cumulativePhysicalPct, "100") > 0,
  };
}

/** CERTIFICATION_FORMULAS: cumulative source minus every other active certificate. */
export function suggestCertificationFromProgress(input: {
  progressPct: string | null;
  budgetQty: string;
  previousQty: string;
  unitSalePrice: string;
}) {
  if (input.progressPct == null || compareDecimal(input.budgetQty, "0") <= 0) return null;
  const pct = compareDecimal(input.progressPct, "100") > 0 ? "100" : nonnegative(input.progressPct);
  const targetQty = roundQty(divideDecimal(multiplyDecimal(input.budgetQty, pct), "100", 12));
  const pending = nonnegative(subtract(targetQty, input.previousQty));
  const remaining = nonnegative(subtract(input.budgetQty, input.previousQty));
  const quantity = roundQty(compareDecimal(pending, remaining) > 0 ? remaining : pending);
  return {
    quantity,
    percentage: certificationQtyPct(quantity, input.budgetQty),
    amount: roundMoney(multiplyDecimal(quantity, input.unitSalePrice)),
  };
}

export function suggestPendingPhysicalPct(
  progressPct: string | null,
  previousPct: string,
): string | null {
  if (progressPct == null) return null;
  const capped = compareDecimal(progressPct, "100") > 0 ? "100" : nonnegative(progressPct);
  return roundRatePct(nonnegative(subtract(capped, previousPct)));
}

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

export function isDateKeyInPeriod(
  logDate: string,
  periodStart: string,
  periodEnd: string,
): boolean {
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
  hasPhysicalPct: boolean;
  hasProgress: boolean;
  qtyAcum: string;
  pctAcum: string;
  qtyPeriod: string;
  pctPeriod: string;
};

const EMPTY_PROGRESS: JobsiteProgressTotals = {
  hasPhysicalPct: false,
  hasProgress: false,
  qtyAcum: "0.0000",
  pctAcum: "0.0000",
  qtyPeriod: "0.0000",
  pctPeriod: "0.0000",
};

export function emptyJobsiteProgress(): JobsiteProgressTotals {
  return { ...EMPTY_PROGRESS };
}

/** Approved progress up to the certificate closing day; future logs must never affect historical suggestions. */
export function aggregateJobsiteProgress(
  rows: JobsiteProgressInput[],
  periodStart: string,
  periodEnd: string,
): Map<string, JobsiteProgressTotals> {
  const acc = new Map<string, JobsiteProgressTotals>();

  for (const row of rows) {
    if (row.logDate.slice(0, 10) > periodEnd.slice(0, 10)) continue;
    let cur = acc.get(row.wbsNodeId);
    if (!cur) {
      cur = emptyJobsiteProgress();
      acc.set(row.wbsNodeId, cur);
    }
    cur.qtyAcum = addDecimal(cur.qtyAcum, row.quantityCompleted || "0");
    cur.hasProgress = true;
    if (row.physicalPct != null && row.physicalPct !== "") {
      cur.hasPhysicalPct = true;
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
      hasProgress: cur.hasProgress,
      hasPhysicalPct: cur.hasPhysicalPct,
      qtyAcum: roundQty(cur.qtyAcum),
      pctAcum: roundRatePct(cur.pctAcum),
      qtyPeriod: roundQty(cur.qtyPeriod),
      pctPeriod: roundRatePct(cur.pctPeriod),
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
