import type { CostCategory } from "@bloqer/database";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";

/** Pure cost-control DTO types — safe for client subpath imports ([D-099]). */

export type CostControlFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
  wbsSearch?: string;
  /**
   * CSV / export scope filter ([D-099]). When present, the export slices each
   * row and totals to the given CostCategory bucket. It does **not** affect
   * `getProjectCostControl` (which always returns full rows + `byCostType`).
   */
  costType?: CostCategory;
};

export type CostControlRowFlags = {
  overBudget: boolean;
  overCertified: boolean;
  missingBudget: boolean;
};

export type CostControlRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  unit: string;
  budgetQty: string;
  budgetUnitCost: string;
  budgetTotalCost: string;
  budgetUnitSale: string;
  budgetTotalSale: string;
  certifiedIssued: string;
  certifiedApproved: string;
  committedCost: string;
  receivedCost: string;
  accruedCost: string;
  paidCost: string;
  inventoryConsumedCost: string;
  qtyCommitted: string;
  qtyReceived: string;
  qtyConsumed: string;
  operationalProgressQty: string;
  submittedProgressQty: string;
  openCommittedCost: string;
  expectedCostExposure: string;
  remainingBudgetCost: string;
  costVariance: string;
  projectedMargin: string;
  pctPurchased: string | null;
  pctReceived: string | null;
  pctPhysicalProgress: string | null;
  pctEconomic: string | null;
  pctExposure: string | null;
  flags: CostControlRowFlags;
  byCostType: CostTypeBucket[];
};

/** Budget vs cost layers for one CostCategory under a WBS ITEM ([D-099]). */
export type CostTypeBucket = {
  costType: CostCategory;
  label: string;
  budgetTotalCost: string;
  committedCost: string;
  accruedCost: string;
  paidCost: string;
  inventoryConsumedCost: string;
  openCommittedCost: string;
  expectedCostExposure: string;
  costVariance: string;
};

export type CostControlTotals = {
  budgetTotalCost: string;
  budgetTotalSale: string;
  certifiedIssued: string;
  certifiedApproved: string;
  committedCost: string;
  receivedCost: string;
  accruedCost: string;
  paidCost: string;
  inventoryConsumedCost: string;
  operationalProgressQty: string;
  openCommittedCost: string;
  expectedCostExposure: string;
  remainingBudgetCost: string;
  costVariance: string;
  projectedMargin: string;
};

export type AvailableBudget = { id: string; name: string; status: string };

export type ProjectCostControlReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  budgetStatus: string;
  availableBudgets: AvailableBudget[];
  rows: CostControlRow[];
  totals: CostControlTotals;
  unallocatedCommittedCost: string;
  unallocatedReceivedCost: string;
  unallocatedAccruedCost: string;
  unallocatedPaidCost: string;
  unallocatedInventoryConsumedCost: string;
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type BudgetSelectionRequired = {
  type: "BUDGET_SELECTION_REQUIRED";
  availableBudgets: AvailableBudget[];
};

/** No approved/closed budgets — avoid throwing so the UI can explain instead of a 500. */
export type NoApprovedBudgets = {
  type: "NO_APPROVED_BUDGETS";
};

export type CostControlResult = ProjectCostControlReport | BudgetSelectionRequired | NoApprovedBudgets;
