import { Prisma } from "@bloqer/database";
import type { PurchaseOrderVarianceTier } from "@bloqer/database";
import type { CompanyProcurementSettingsView } from "./company-procurement-settings.service";

export type VarianceLineInput = {
  unit: string;
  unitPrice: string;
  budgetUnitCost: string | null;
  budgetUnit: string | null;
  varianceJustification?: string | null;
};

export type VarianceLineResult = {
  variancePct: string | null;
  varianceTier: PurchaseOrderVarianceTier;
  varianceUnitMismatch: boolean;
  requiresJustification: boolean;
  requiresExtraApproval: boolean;
};

function normalizeUnit(u: string): string {
  return u.trim().toLowerCase();
}

export function evaluateLineVariance(
  line: VarianceLineInput,
  settings: Pick<
    CompanyProcurementSettingsView,
    "varianceSoftAlertPct" | "varianceNoteRequiredPct" | "varianceExtraApprovalPct"
  >,
): VarianceLineResult {
  const soft = new Prisma.Decimal(settings.varianceSoftAlertPct);
  const extra = new Prisma.Decimal(settings.varianceExtraApprovalPct);

  if (line.budgetUnit && normalizeUnit(line.unit) !== normalizeUnit(line.budgetUnit)) {
    const needsNote = new Prisma.Decimal(line.unitPrice).greaterThan(0);
    return {
      variancePct: null,
      varianceTier: "UNIT_MISMATCH",
      varianceUnitMismatch: true,
      requiresJustification: needsNote,
      requiresExtraApproval: false,
    };
  }

  const baseline = line.budgetUnitCost ? new Prisma.Decimal(line.budgetUnitCost) : null;
  const price = new Prisma.Decimal(line.unitPrice);

  if (!baseline || baseline.isZero()) {
    return {
      variancePct: null,
      varianceTier: price.greaterThan(0) ? "NO_BUDGET_BASELINE" : "NONE",
      varianceUnitMismatch: false,
      requiresJustification: price.greaterThan(0),
      requiresExtraApproval: false,
    };
  }

  const pct = price.minus(baseline).div(baseline).times(100);
  const abs = pct.abs();

  if (abs.lessThan(soft)) {
    return {
      variancePct: pct.toFixed(4),
      varianceTier: "NONE",
      varianceUnitMismatch: false,
      requiresJustification: false,
      requiresExtraApproval: false,
    };
  }

  if (abs.lessThan(extra)) {
    return {
      variancePct: pct.toFixed(4),
      varianceTier: "NOTE_REQUIRED",
      varianceUnitMismatch: false,
      requiresJustification: true,
      requiresExtraApproval: false,
    };
  }

  return {
    variancePct: pct.toFixed(4),
    varianceTier: "EXTRA_APPROVAL",
    varianceUnitMismatch: false,
    requiresJustification: true,
    requiresExtraApproval: true,
  };
}

export function poRequiresHighLevelApproval(
  totalAmountArs: Prisma.Decimal,
  settings: Pick<CompanyProcurementSettingsView, "poApprovalThresholdArs">,
): boolean {
  if (!settings.poApprovalThresholdArs) return false;
  const threshold = new Prisma.Decimal(settings.poApprovalThresholdArs);
  return totalAmountArs.greaterThanOrEqualTo(threshold);
}
