import { Prisma } from "@bloqer/database";
import type { CompanyProcurementSettingsView } from "./company-procurement-settings.service";

export {
  DEFAULT_VARIANCE_SETTINGS,
  evaluateLineVariance,
  evaluateLineVarianceLenient,
  formatMissingVarianceJustificationError,
  isComparablePurchaseBaseline,
  resolveBudgetRefKind,
  varianceJustificationReasonEs,
  type BudgetRefKind,
  type PurchaseVarianceTier,
  type VarianceLineInput,
  type VarianceLineResult,
  type VarianceSettings,
} from "./purchase-variance-pure";

export function poRequiresHighLevelApproval(
  totalAmountArs: Prisma.Decimal,
  settings: Pick<CompanyProcurementSettingsView, "poApprovalThresholdArs">,
): boolean {
  if (!settings.poApprovalThresholdArs) return false;
  const threshold = new Prisma.Decimal(settings.poApprovalThresholdArs);
  return totalAmountArs.greaterThanOrEqualTo(threshold);
}
