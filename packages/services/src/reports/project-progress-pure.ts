import { Prisma } from "@bloqer/database";

import { serializeQtyDecimal, serializeRatePctDecimal } from "../finance/money-decimal";
import { computeCostExposureLayers } from "../cost-control/cost-exposure";
import type { ProjectProgressCoverage } from "./project-progress.types";

const ZERO = new Prisma.Decimal(0);
export const PROGRESS_INCREMENTAL_CUTOFF = "2026-06-01";

export type ProjectProgressMeasurement = { date: string; pct: string | null; qty: string };
export type ProjectProgressPhysicalValue = {
  pct: Prisma.Decimal | null;
  sourcePct: Prisma.Decimal | null;
  qty: Prisma.Decimal;
  hasLegacy: boolean;
  invalid: boolean;
  issues: string[];
};

export function resolveProjectProgressPhysical(
  measurements: readonly ProjectProgressMeasurement[],
  budgetQty: string | null,
  cut: string,
): ProjectProgressPhysicalValue {
  const entries = measurements.filter((m) => m.date <= cut);
  const qty = entries.reduce((s, m) => s.plus(m.qty), ZERO);
  const percentages = entries.filter((m) => m.pct != null);
  const hasLegacy = percentages.some((m) => m.date < PROGRESS_INCREMENTAL_CUTOFF);
  const issues: string[] = [];
  if (!entries.length) issues.push("Sin medición aprobada al corte.");
  const baseQty = budgetQty == null ? null : new Prisma.Decimal(budgetQty);
  const sourcePct = percentages.length
    ? percentages.reduce((s, m) => s.plus(m.pct!), ZERO)
    : entries.length && baseQty?.gt(0)
      ? qty.div(baseQty).mul(100)
      : null;
  const invalid =
    (sourcePct != null && (sourcePct.lt(0) || sourcePct.gt(100))) ||
    qty.lt(0) ||
    Boolean(baseQty?.gt(0) && qty.gt(baseQty));
  if (hasLegacy)
    issues.push("Porcentaje anterior al 01/06/2026: fuente ambigua, requiere revisión.");
  if (invalid)
    issues.push(
      `Medición fuera de alcance: ${sourcePct == null ? "sin porcentaje" : `${serializeRatePctDecimal(sourcePct)}%`}, cantidad ${serializeQtyDecimal(qty)}.`,
    );
  if (entries.length && sourcePct == null)
    issues.push("Sin base de cantidad para interpretar la medición.");
  return {
    pct: entries.length && !hasLegacy && !invalid ? sourcePct : null,
    sourcePct,
    qty,
    hasLegacy,
    invalid,
    issues,
  };
}

export function aggregateProjectProgressCoverage(
  items: readonly {
    cost: string | null;
    pct: Prisma.Decimal | null;
    hasLegacy?: boolean;
    invalid?: boolean;
  }[],
): ProjectProgressCoverage {
  let totalCost = ZERO;
  let coveredCost = ZERO;
  let weighted = ZERO;
  let baseComplete = true;
  let weightedComplete = true;
  let coveredCount = 0;
  let zeroCostCount = 0;
  for (const item of items) {
    if (item.pct != null) coveredCount++;
    if (item.cost == null || new Prisma.Decimal(item.cost).lt(0)) {
      baseComplete = false;
      continue;
    }
    const cost = new Prisma.Decimal(item.cost);
    if (cost.isZero()) {
      zeroCostCount++;
      continue;
    }
    totalCost = totalCost.plus(cost);
    if (item.pct == null) weightedComplete = false;
    else {
      coveredCost = coveredCost.plus(cost);
      weighted = weighted.plus(cost.mul(item.pct));
    }
  }
  const observedPct =
    baseComplete && totalCost.gt(0) && coveredCount > 0
      ? serializeRatePctDecimal(weighted.div(totalCost))
      : null;
  return {
    pct:
      baseComplete && weightedComplete && !items.some((i) => i.hasLegacy || i.invalid)
        ? observedPct
        : null,
    observedPct,
    coveragePct:
      baseComplete && totalCost.gt(0)
        ? serializeRatePctDecimal(coveredCost.div(totalCost).mul(100))
        : null,
    coveredCount,
    totalCount: items.length,
    missingCount: items.filter((i) => i.pct == null && !i.invalid && !i.hasLegacy).length,
    invalidCount: items.filter((i) => i.invalid || i.hasLegacy).length,
    zeroCostCount,
    hasLegacy: items.some((i) => i.hasLegacy),
  };
}

/** The current task dates are a reference, never a historical baseline. */
export function projectProgressPlanPct(
  start: string | null,
  end: string | null,
  cut: string,
): Prisma.Decimal | null {
  if (!start || !end || end < start) return null;
  if (cut < start) return ZERO;
  if (cut >= end) return new Prisma.Decimal(100);
  const total = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  const elapsed = Date.parse(`${cut}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return total > 0 ? new Prisma.Decimal(elapsed).div(total).mul(100) : ZERO;
}

export type ProjectProgressCostEvent = {
  wbsNodeId: string;
  date: string;
  commitmentId?: string;
  committed?: Prisma.Decimal;
  accrued?: Prisma.Decimal;
  accruedLinked?: Prisma.Decimal;
  paid?: Prisma.Decimal;
};

/** D-065: paid is a cash layer and never added to accrued or exposure. */
export function projectProgressCostsAt(events: readonly ProjectProgressCostEvent[], cut: string) {
  const rows = new Map<
    string,
    {
      committed: Prisma.Decimal;
      accrued: Prisma.Decimal;
      accruedLinked: Prisma.Decimal;
      paid: Prisma.Decimal;
      exposure: Prisma.Decimal;
    }
  >();
  const commitments = new Map<
    string,
    Map<string, { committed: Prisma.Decimal; accruedLinked: Prisma.Decimal }>
  >();
  for (const event of events) {
    if (event.date > cut) continue;
    const row = rows.get(event.wbsNodeId) ?? {
      committed: ZERO,
      accrued: ZERO,
      accruedLinked: ZERO,
      paid: ZERO,
      exposure: ZERO,
    };
    row.committed = row.committed.plus(event.committed ?? ZERO);
    row.accrued = row.accrued.plus(event.accrued ?? ZERO);
    row.accruedLinked = row.accruedLinked.plus(event.accruedLinked ?? ZERO);
    row.paid = row.paid.plus(event.paid ?? ZERO);
    rows.set(event.wbsNodeId, row);
    if (event.committed != null || event.accruedLinked != null) {
      const byCommitment = commitments.get(event.wbsNodeId) ?? new Map();
      const key = event.commitmentId ?? "legacy-commitment";
      const commitment = byCommitment.get(key) ?? { committed: ZERO, accruedLinked: ZERO };
      commitment.committed = commitment.committed.plus(event.committed ?? ZERO);
      commitment.accruedLinked = commitment.accruedLinked.plus(event.accruedLinked ?? ZERO);
      byCommitment.set(key, commitment);
      commitments.set(event.wbsNodeId, byCommitment);
    }
  }
  for (const [id, row] of rows) {
    let open = ZERO;
    for (const commitment of commitments.get(id)?.values() ?? []) {
      open = open.plus(computeCostExposureLayers({ ...commitment, accrued: ZERO }).openCommitted);
    }
    row.exposure = row.accrued.plus(open);
  }
  return rows;
}
