export type ProjectProgressFilters = {
  dateFrom?: string;
  dateTo?: string;
  budgetId?: string;
  currency?: string;
};

export type ProjectProgressCoverage = {
  /** Only present when every in-scope item has a valid observation. */
  pct: string | null;
  /** Observed contribution over the entire budget, never renormalized. */
  observedPct: string | null;
  coveragePct: string | null;
  coveredCount: number;
  totalCount: number;
  missingCount: number;
  invalidCount: number;
  zeroCostCount: number;
  hasLegacy: boolean;
};

export type ProjectProgressFinancial = {
  budgetSale: string | null;
  budgetCost: string | null;
  certified: string | null;
  invoiced: string | null;
  collected: string | null;
  receivableBalance: string | null;
  overdueBalance: string | null;
  costAccrued: string | null;
  costExposure: string | null;
  costPaid: string | null;
  certifiedPct: string | null;
  costAccruedPct: string | null;
  costExposurePct: string | null;
  costPaidPct: string | null;
  collectionPct: string | null;
};

export type ProjectProgressSeriesPoint = {
  periodKey: string;
  periodLabel: string;
  physicalPct: string | null;
  physicalObservedPct: string | null;
  physicalCoveragePct: string | null;
  planPct: string | null;
  planObservedPct: string | null;
  certified: string | null;
  invoiced: string | null;
  collected: string | null;
  costAccrued: string | null;
  costExposure: string | null;
  costPaid: string | null;
};

export type ProjectProgressRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  budgetId: string;
  budgetName: string;
  unit: string;
  budgetQty: string;
  budgetCost: string | null;
  budgetSale: string | null;
  physicalPct: string | null;
  physicalQty: string | null;
  physicalRemainingQty: string | null;
  physicalRemainingPct: string | null;
  planPct: string | null;
  certifiedQty: string | null;
  certifiedAmount: string | null;
  pendingCertifyQty: string | null;
  pendingCertifyAmount: string | null;
  costAccrued: string | null;
  costExposure: string | null;
  costPaid: string | null;
  issues: string[];
  href: string;
};

export type ProjectProgressPending = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  href: string;
  amount?: string;
  qty?: string;
  unit?: string;
  date?: string;
};

export type ProjectProgressReport = {
  type: "REPORT";
  projectId: string;
  projectName: string;
  dateFrom: string;
  dateTo: string;
  currency: string;
  availableCurrencies: string[];
  availableBudgets: { id: string; name: string; status: string; currency: string }[];
  budgetIds: string[];
  budgetName: string;
  physical: ProjectProgressCoverage;
  plan: ProjectProgressCoverage;
  schedule: {
    progressPct: string | null;
    totalTasks: number;
    completedTasks: number;
    delayedTasks: number;
    blockedTasks: number;
  };
  financial: ProjectProgressFinancial;
  opening: {
    certified: string | null;
    invoiced: string | null;
    collected: string | null;
    costAccrued: string | null;
    costExposure: string | null;
    costPaid: string | null;
    physicalObservedPct: string | null;
  };
  series: ProjectProgressSeriesPoint[];
  rows: ProjectProgressRow[];
  pending: ProjectProgressPending[];
  sourceDates: {
    jobsite: string | null;
    certifications: string | null;
    invoices: string | null;
    collections: string | null;
    costs: string | null;
  };
  notes: string[];
  warnings: string[];
  sectionsExcluded: string[];
};

export type ProjectProgressReportResult = ProjectProgressReport | { type: "NO_APPROVED_BUDGETS" };
